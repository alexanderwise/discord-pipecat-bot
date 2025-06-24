import { RedisClientType } from '@redis/client';
import { Pool } from 'pg';
import { Logger } from 'winston';
import { 
  ContextService as IContextService,
  ConversationContext, 
  UserPreferences, 
  MessageHistory,
  User,
  Guild,
  Reminder
} from '../types';

export class ContextService implements IContextService {
  private readonly CONTEXT_TTL = 3600; // 1 hour
  private readonly PREFERENCES_TTL = 86400; // 24 hours

  constructor(
    private redis: RedisClientType<any>,
    private pgPool: Pool,
    private logger: Logger
  ) {}

  async getContext(userId: string, channelId: string): Promise<ConversationContext> {
    try {
      const key = `context:${userId}:${channelId}`;
      const cached = await this.redis.get(key);

      if (cached) {
        const context = JSON.parse(cached);
        return {
          ...context,
          history: context.history.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          })),
          timestamp: new Date(context.timestamp)
        };
      }

      // Create new context
      const preferences = await this.getUserPreferences(userId);
      const context: ConversationContext = {
        userId,
        channelId,
        interactionType: 'message',
        history: [],
        tools: [],
        preferences,
        timestamp: new Date()
      };

      // Cache the context
      await this.redis.setEx(key, this.CONTEXT_TTL, JSON.stringify(context));

      return context;
    } catch (error) {
      this.logger.error('Error getting context:', error);
      throw error;
    }
  }

  async updateContext(context: ConversationContext): Promise<void> {
    try {
      const key = `context:${context.userId}:${context.channelId}`;
      
      // Update timestamp
      context.timestamp = new Date();

      // Cache the updated context
      await this.redis.setEx(key, this.CONTEXT_TTL, JSON.stringify(context));

      // Store in database for persistence
      await this.storeContextInDatabase(context);
    } catch (error) {
      this.logger.error('Error updating context:', error);
      throw error;
    }
  }

  async clearContext(userId: string, channelId: string): Promise<void> {
    try {
      const key = `context:${userId}:${channelId}`;
      await this.redis.del(key);

      // Also clear from database
      await this.pgPool.query(
        'DELETE FROM conversation_contexts WHERE user_id = $1 AND channel_id = $2',
        [userId, channelId]
      );

      this.logger.info(`Cleared context for user ${userId} in channel ${channelId}`);
    } catch (error) {
      this.logger.error('Error clearing context:', error);
      throw error;
    }
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    try {
      const key = `preferences:${userId}`;
      const cached = await this.redis.get(key);

      if (cached) {
        return JSON.parse(cached);
      }

      // Get from database
      const result = await this.pgPool.query(
        'SELECT preferences FROM users WHERE id = $1',
        [userId]
      );

      let preferences: UserPreferences;
      if (result.rows.length > 0) {
        preferences = result.rows[0].preferences;
      } else {
        // Create default preferences
        preferences = {
          language: 'en',
          textModel: 'gpt-4',
          autoJoinVoice: true,
          notificationSettings: {
            reminders: true,
            mentions: true,
            dms: true
          }
        };

        // Store default preferences
        await this.pgPool.query(
          'INSERT INTO users (id, preferences) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
          [userId, preferences]
        );
      }

      // Cache preferences
      await this.redis.setEx(key, this.PREFERENCES_TTL, JSON.stringify(preferences));

      return preferences;
    } catch (error) {
      this.logger.error('Error getting user preferences:', error);
      
      // Return default preferences on error
      return {
        language: 'en',
        textModel: 'gpt-4',
        autoJoinVoice: true,
        notificationSettings: {
          reminders: true,
          mentions: true,
          dms: true
        }
      };
    }
  }

  async updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<void> {
    try {
      const currentPreferences = await this.getUserPreferences(userId);
      const updatedPreferences = { ...currentPreferences, ...preferences };

      // Update database
      await this.pgPool.query(
        'UPDATE users SET preferences = $1, updated_at = NOW() WHERE id = $2',
        [updatedPreferences, userId]
      );

      // Update cache
      const key = `preferences:${userId}`;
      await this.redis.setEx(key, this.PREFERENCES_TTL, JSON.stringify(updatedPreferences));

      this.logger.info(`Updated preferences for user ${userId}`);
    } catch (error) {
      this.logger.error('Error updating user preferences:', error);
      throw error;
    }
  }

  private async storeContextInDatabase(context: ConversationContext): Promise<void> {
    try {
      await this.pgPool.query(
        `INSERT INTO conversation_contexts 
         (user_id, channel_id, guild_id, interaction_type, history, tools, preferences, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         ON CONFLICT (user_id, channel_id) 
         DO UPDATE SET 
           guild_id = EXCLUDED.guild_id,
           interaction_type = EXCLUDED.interaction_type,
           history = EXCLUDED.history,
           tools = EXCLUDED.tools,
           preferences = EXCLUDED.preferences,
           updated_at = NOW()`,
        [
          context.userId,
          context.channelId,
          context.guildId,
          context.interactionType,
          JSON.stringify(context.history),
          JSON.stringify(context.tools),
          JSON.stringify(context.preferences)
        ]
      );
    } catch (error) {
      this.logger.error('Error storing context in database:', error);
      // Don't throw error for database storage failures
    }
  }

  // User management
  async createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<void> {
    try {
      await this.pgPool.query(
        `INSERT INTO users (id, username, discriminator, avatar, preferences, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           discriminator = EXCLUDED.discriminator,
           avatar = EXCLUDED.avatar,
           preferences = EXCLUDED.preferences,
           updated_at = NOW()`,
        [user.id, user.username, user.discriminator, user.avatar, user.preferences]
      );

      this.logger.info(`Created/updated user ${user.id}`);
    } catch (error) {
      this.logger.error('Error creating user:', error);
      throw error;
    }
  }

  async getUser(userId: string): Promise<User | null> {
    try {
      const result = await this.pgPool.query(
        'SELECT * FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        discriminator: row.discriminator,
        avatar: row.avatar,
        preferences: row.preferences,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      this.logger.error('Error getting user:', error);
      throw error;
    }
  }

  // Guild management
  async createGuild(guild: Omit<Guild, 'createdAt' | 'updatedAt'>): Promise<void> {
    try {
      await this.pgPool.query(
        `INSERT INTO guilds (id, name, owner_id, settings, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           owner_id = EXCLUDED.owner_id,
           settings = EXCLUDED.settings,
           updated_at = NOW()`,
        [guild.id, guild.name, guild.ownerId, guild.settings]
      );

      this.logger.info(`Created/updated guild ${guild.id}`);
    } catch (error) {
      this.logger.error('Error creating guild:', error);
      throw error;
    }
  }

  async getGuild(guildId: string): Promise<Guild | null> {
    try {
      const result = await this.pgPool.query(
        'SELECT * FROM guilds WHERE id = $1',
        [guildId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        settings: row.settings,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      this.logger.error('Error getting guild:', error);
      throw error;
    }
  }

  // Reminder management
  async createReminder(reminder: Omit<Reminder, 'id' | 'createdAt'>): Promise<string> {
    try {
      const result = await this.pgPool.query(
        `INSERT INTO reminders (user_id, guild_id, channel_id, message, scheduled_for, is_completed, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id`,
        [
          reminder.userId,
          reminder.guildId,
          reminder.channelId,
          reminder.message,
          reminder.scheduledFor,
          reminder.isCompleted
        ]
      );

      const reminderId = result.rows[0].id;
      this.logger.info(`Created reminder ${reminderId} for user ${reminder.userId}`);

      return reminderId;
    } catch (error) {
      this.logger.error('Error creating reminder:', error);
      throw error;
    }
  }

  async getReminders(userId: string, includeCompleted: boolean = false): Promise<Reminder[]> {
    try {
      const query = includeCompleted
        ? 'SELECT * FROM reminders WHERE user_id = $1 ORDER BY scheduled_for ASC'
        : 'SELECT * FROM reminders WHERE user_id = $1 AND is_completed = false ORDER BY scheduled_for ASC';

      const result = await this.pgPool.query(query, [userId]);

      return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        guildId: row.guild_id,
        channelId: row.channel_id,
        message: row.message,
        scheduledFor: row.scheduled_for,
        isCompleted: row.is_completed,
        createdAt: row.created_at
      }));
    } catch (error) {
      this.logger.error('Error getting reminders:', error);
      throw error;
    }
  }

  async markReminderCompleted(reminderId: string): Promise<void> {
    try {
      await this.pgPool.query(
        'UPDATE reminders SET is_completed = true WHERE id = $1',
        [reminderId]
      );

      this.logger.info(`Marked reminder ${reminderId} as completed`);
    } catch (error) {
      this.logger.error('Error marking reminder completed:', error);
      throw error;
    }
  }

  async deleteReminder(reminderId: string): Promise<void> {
    try {
      await this.pgPool.query(
        'DELETE FROM reminders WHERE id = $1',
        [reminderId]
      );

      this.logger.info(`Deleted reminder ${reminderId}`);
    } catch (error) {
      this.logger.error('Error deleting reminder:', error);
      throw error;
    }
  }

  // Analytics and metrics
  async getContextStats(userId: string): Promise<any> {
    try {
      const result = await this.pgPool.query(
        `SELECT 
           COUNT(*) as total_contexts,
           COUNT(DISTINCT channel_id) as unique_channels,
           MAX(updated_at) as last_activity,
           AVG(jsonb_array_length(history)) as avg_messages_per_context
         FROM conversation_contexts 
         WHERE user_id = $1`,
        [userId]
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error getting context stats:', error);
      throw error;
    }
  }

  async cleanupOldContexts(daysOld: number = 30): Promise<number> {
    try {
      const result = await this.pgPool.query(
        'DELETE FROM conversation_contexts WHERE updated_at < NOW() - INTERVAL \'$1 days\'',
        [daysOld]
      );

      const deletedCount = result.rowCount || 0;
      this.logger.info(`Cleaned up ${deletedCount} old conversation contexts`);

      return deletedCount;
    } catch (error) {
      this.logger.error('Error cleaning up old contexts:', error);
      throw error;
    }
  }

  // Cache management
  async clearUserCache(userId: string): Promise<void> {
    try {
      const keys = await this.redis.keys(`*:${userId}:*`);
      if (keys.length > 0) {
        await this.redis.del(keys as any);
      }

      this.logger.info(`Cleared cache for user ${userId}`);
    } catch (error) {
      this.logger.error('Error clearing user cache:', error);
      throw error;
    }
  }

  async getCacheStats(): Promise<any> {
    try {
      const keys = await this.redis.keys('*');
      const contextKeys = await this.redis.keys('context:*');
      const preferenceKeys = await this.redis.keys('preferences:*');

      return {
        totalKeys: keys.length,
        contextKeys: contextKeys.length,
        preferenceKeys: preferenceKeys.length
      };
    } catch (error) {
      this.logger.error('Error getting cache stats:', error);
      throw error;
    }
  }
} 