import { Client, VoiceState, VoiceChannel, GuildMember } from 'discord.js';
import { Logger } from 'winston';
import { PipecatService } from '../services/pipecat';
import { ContextService } from '../services/context';
import { VoiceSession, WebRTCBridge, ConversationContext } from '../types';

export class VoiceHandler {
  private activeSessions: Map<string, VoiceSession> = new Map();
  private audioBridges: Map<string, WebRTCBridge> = new Map();

  constructor(
    private client: Client,
    private pipecatService: PipecatService,
    private contextService: ContextService,
    private logger: Logger
  ) {}

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    // Ignore bot's own voice state changes
    if (newState.member?.user.id === this.client.user?.id) {
      return;
    }

    const guildId = newState.guild.id;
    const channelId = newState.channelId;
    const userId = newState.member?.user.id;

    if (!userId) {
      return;
    }

    // User joined a voice channel
    if (!oldState.channelId && channelId) {
      await this.handleUserJoinedVoice(userId, guildId, channelId, newState);
    }
    // User left a voice channel
    else if (oldState.channelId && !channelId) {
      await this.handleUserLeftVoice(userId, guildId, oldState.channelId);
    }
    // User moved between voice channels
    else if (oldState.channelId && channelId && oldState.channelId !== channelId) {
      await this.handleUserMovedVoice(userId, guildId, oldState.channelId, channelId);
    }
  }

  private async handleUserJoinedVoice(
    userId: string, 
    guildId: string, 
    channelId: string, 
    voiceState: VoiceState
  ): Promise<void> {
    try {
      const channel = voiceState.channel as VoiceChannel;
      
      // Check if bot should auto-join
      const autoJoin = process.env.VOICE_CHANNEL_AUTO_JOIN === 'true';
      if (!autoJoin) {
        return;
      }

      // Check if bot is already in a voice channel in this guild
      const existingSession = this.getActiveSessionForGuild(guildId);
      if (existingSession) {
        this.logger.info(`Bot already in voice channel ${existingSession.channelId} in guild ${guildId}`);
        return;
      }

      // Check if bot has permissions to join
      if (!channel.permissionsFor(this.client.user!)?.has(['Connect', 'Speak'])) {
        this.logger.warn(`Bot lacks permissions to join voice channel ${channelId}`);
        return;
      }

      // Join the voice channel
      await this.joinVoiceChannel(channelId);

      this.logger.info(`User ${userId} joined voice channel ${channelId}, bot joined automatically`);
    } catch (error) {
      this.logger.error('Error handling user joined voice:', error);
    }
  }

  private async handleUserLeftVoice(userId: string, guildId: string, channelId: string): Promise<void> {
    try {
      const session = this.getActiveSessionForGuild(guildId);
      if (!session) {
        return;
      }

      // Check if channel is now empty (excluding bot)
      const channel = this.client.channels.cache.get(channelId) as VoiceChannel;
      if (channel && channel.members.size <= 1) {
        // Only bot remains, leave the channel
        await this.leaveVoiceChannel();
        this.logger.info(`Voice channel ${channelId} is empty, bot left automatically`);
      }
    } catch (error) {
      this.logger.error('Error handling user left voice:', error);
    }
  }

  private async handleUserMovedVoice(
    userId: string, 
    guildId: string, 
    oldChannelId: string, 
    newChannelId: string
  ): Promise<void> {
    try {
      const session = this.getActiveSessionForGuild(guildId);
      if (!session) {
        return;
      }

      // If bot was in the old channel and it's now empty, leave it
      if (session.channelId === oldChannelId) {
        const oldChannel = this.client.channels.cache.get(oldChannelId) as VoiceChannel;
        if (oldChannel && oldChannel.members.size <= 1) {
          await this.leaveVoiceChannel();
          this.logger.info(`Bot left empty voice channel ${oldChannelId}`);
        }
      }
    } catch (error) {
      this.logger.error('Error handling user moved voice:', error);
    }
  }

  async joinVoiceChannel(channelId: string): Promise<void> {
    try {
      const channel = this.client.channels.cache.get(channelId) as VoiceChannel;
      if (!channel) {
        throw new Error(`Voice channel ${channelId} not found`);
      }
      // TODO: Use @discordjs/voice to join the channel
      // Placeholder: just log for now
      this.logger.info(`Would join voice channel ${channelId} in guild ${channel.guild.id}`);
    } catch (error) {
      this.logger.error('Error joining voice channel:', error);
      throw error;
    }
  }

  async leaveVoiceChannel(): Promise<void> {
    try {
      const guildId = this.getActiveGuildId();
      if (!guildId) {
        this.logger.warn('No active voice session to leave');
        return;
      }
      const session = this.activeSessions.get(guildId);
      if (!session) {
        return;
      }
      // TODO: Use @discordjs/voice to leave the channel
      // Placeholder: just log for now
      this.logger.info(`Would leave voice channel ${session.channelId} in guild ${guildId}`);
      this.activeSessions.delete(guildId);
    } catch (error) {
      this.logger.error('Error leaving voice channel:', error);
      throw error;
    }
  }

  private setupAudioProcessing(connection: any, session: VoiceSession): void {
    try {
      // Set up audio receiver
      const receiver = connection.receiver;
      
      connection.on('speaking', (userId: string, speaking: boolean) => {
        if (speaking) {
          this.handleUserSpeaking(userId, session);
        }
      });

      // Handle incoming audio
      receiver.speaking.on('start', (userId: string) => {
        const audioStream = receiver.subscribe(userId, {
          end: {
            behavior: 'manual'
          }
        });

        this.processIncomingAudio(audioStream, userId, session);
      });

      this.logger.info(`Audio processing set up for voice session in guild ${session.guildId}`);
    } catch (error) {
      this.logger.error('Error setting up audio processing:', error);
    }
  }

  private async handleUserSpeaking(userId: string, session: VoiceSession): Promise<void> {
    try {
      // Update session activity
      session.lastActivity = new Date();

      // Get user context for voice interaction
      const context = await this.contextService.getContext(userId, session.channelId);
      context.interactionType = 'voice';
      context.timestamp = new Date();

      this.logger.debug(`User ${userId} started speaking in voice session ${session.guildId}`);
    } catch (error) {
      this.logger.error('Error handling user speaking:', error);
    }
  }

  private async processIncomingAudio(
    audioStream: any, 
    userId: string, 
    session: VoiceSession
  ): Promise<void> {
    try {
      const audioChunks: Buffer[] = [];

      audioStream.on('data', (chunk: Buffer) => {
        audioChunks.push(chunk);
      });

      audioStream.on('end', async () => {
        if (audioChunks.length === 0) {
          return;
        }

        // Combine audio chunks
        const audioData = Buffer.concat(audioChunks);

        // Process with Pipecat service
        const response = await this.pipecatService.processAudio(audioData);

        // Handle response (text-to-speech, etc.)
        await this.handleVoiceResponse(response, session);

        this.logger.debug(`Processed audio from user ${userId} in session ${session.guildId}`);
      });

    } catch (error) {
      this.logger.error('Error processing incoming audio:', error);
    }
  }

  private async handleVoiceResponse(response: any, session: VoiceSession): Promise<void> {
    try {
      // Update conversation context
      const context = await this.contextService.getContext(session.userId, session.channelId);
      context.history.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        metadata: { 
          tools: response.tools,
          interactionType: 'voice'
        }
      });

      await this.contextService.updateContext(context);

      // Send audio response back to Discord
      if (response.audio) {
        await this.sendAudioResponse(response.audio, session);
      }

      this.logger.debug(`Handled voice response in session ${session.guildId}`);
    } catch (error) {
      this.logger.error('Error handling voice response:', error);
    }
  }

  private async sendAudioResponse(audioData: Buffer, session: VoiceSession): Promise<void> {
    try {
      // TODO: Use @discordjs/voice to play audio in the channel
      this.logger.info(`Would play audio in voice channel for session ${session.guildId}`);
    } catch (error) {
      this.logger.error('Error sending audio response:', error);
    }
  }

  private getActiveSessionForGuild(guildId: string): VoiceSession | undefined {
    return this.activeSessions.get(guildId);
  }

  private getActiveGuildId(): string | undefined {
    for (const [guildId, session] of this.activeSessions.entries()) {
      if (session.isActive) {
        return guildId;
      }
    }
    return undefined;
  }

  // Public methods for external control
  async forceJoinVoiceChannel(channelId: string): Promise<void> {
    await this.joinVoiceChannel(channelId);
  }

  async forceLeaveVoiceChannel(): Promise<void> {
    await this.leaveVoiceChannel();
  }

  getActiveSessions(): VoiceSession[] {
    return Array.from(this.activeSessions.values());
  }

  getSessionStatus(guildId: string): VoiceSession | null {
    return this.activeSessions.get(guildId) || null;
  }

  async updateVoiceSettings(guildId: string, settings: any): Promise<void> {
    try {
      const session = this.activeSessions.get(guildId);
      if (!session) {
        throw new Error(`No active voice session for guild ${guildId}`);
      }

      // Update Pipecat service settings
      await this.pipecatService.updateSettings(guildId, settings);

      this.logger.info(`Updated voice settings for guild ${guildId}`);
    } catch (error) {
      this.logger.error('Error updating voice settings:', error);
      throw error;
    }
  }
} 