import { Client, Message, Events, TextBasedChannel } from 'discord.js';
import { Logger } from 'winston';
import { GriptapeService } from '../services/griptape';
import { ContextService } from '../services/context';
import { ConversationContext, InteractionType, AIResponse } from '../types';

export class MessageHandler {
  private readonly BOT_PREFIX: string;
  private readonly MENTION_PATTERN: RegExp;

  constructor(
    private client: Client,
    private griptapeService: GriptapeService,
    private contextService: ContextService,
    private logger: Logger
  ) {
    this.BOT_PREFIX = process.env.BOT_PREFIX || '!';
    this.MENTION_PATTERN = new RegExp(`^<@!?${this.client.user?.id}>\\s*`);
  }

  async handleMessage(message: Message): Promise<void> {
    // Ignore bot messages and messages without content
    if (message.author.bot || !message.content) {
      return;
    }

    // Check if message is in a guild and bot has permissions
    if (message.guild && !message.guild.members.me?.permissions.has('SendMessages')) {
      return;
    }

    // Check if message is meant for the bot
    const isMentioned = this.MENTION_PATTERN.test(message.content);
    const isPrefixed = message.content.startsWith(this.BOT_PREFIX);
    const isDM = message.channel.type === 1; // DMChannel

    if (!isMentioned && !isPrefixed && !isDM) {
      return;
    }

    // Extract the actual message content
    let content = message.content;
    if (isMentioned) {
      content = content.replace(this.MENTION_PATTERN, '').trim();
    } else if (isPrefixed) {
      content = content.slice(this.BOT_PREFIX.length).trim();
    }

    // Ignore empty messages after processing
    if (!content) {
      return;
    }

    // Check for command-like messages
    if (this.isCommand(content)) {
      await this.handleCommandMessage(message, content);
      return;
    }

    // Handle natural conversation
    await this.handleConversationMessage(message, content);
  }

  private isCommand(content: string): boolean {
    const commandPattern = /^(\w+)(?:\s+(.+))?$/;
    const match = content.match(commandPattern);
    
    if (!match) return false;

    const command = match[1]?.toLowerCase();
    if (!command) return false;
    
    const validCommands = [
      'help', 'ping', 'info', 'status', 'clear', 'reset',
      'remind', 'time', 'weather', 'search', 'translate'
    ];

    return validCommands.includes(command);
  }

  private async handleCommandMessage(message: Message, content: string): Promise<void> {
    const parts = content.split(/\s+/);
    const command = parts[0]?.toLowerCase();
    if (!command) return;
    
    const args = parts.slice(1).join(' ');

    try {
      switch (command) {
        case 'help':
          await this.handleHelpCommand(message, args);
          break;
        case 'ping':
          await this.handlePingCommand(message);
          break;
        case 'info':
          await this.handleInfoCommand(message);
          break;
        case 'status':
          await this.handleStatusCommand(message);
          break;
        case 'clear':
        case 'reset':
          await this.handleClearCommand(message);
          break;
        case 'remind':
          await this.handleRemindCommand(message, args);
          break;
        case 'time':
          await this.handleTimeCommand(message, args);
          break;
        case 'weather':
          await this.handleWeatherCommand(message, args);
          break;
        case 'search':
          await this.handleSearchCommand(message, args);
          break;
        case 'translate':
          await this.handleTranslateCommand(message, args);
          break;
        default:
          await message.reply(`Unknown command: \`${command}\`. Use \`${this.BOT_PREFIX}help\` to see available commands.`);
      }
    } catch (error) {
      this.logger.error(`Error handling command message: ${command}`, error);
      await message.reply('Sorry, I encountered an error processing your command. Please try again.');
    }
  }

  private async handleConversationMessage(message: Message, content: string): Promise<void> {
    try {
      // Show typing indicator only if channel supports it
      if ('sendTyping' in message.channel && typeof (message.channel as any).sendTyping === 'function') {
        await (message.channel as any).sendTyping();
      }

      // Get or create conversation context
      const context = await this.contextService.getContext(
        message.author.id,
        message.channelId
      );

      // Update context for this interaction
      context.interactionType = 'message';
      context.timestamp = new Date();
      context.history.push({
        role: 'user',
        content: content,
        timestamp: new Date(),
        metadata: { interactionType: 'message' }
      });

      // Process with AI service
      const response = await this.griptapeService.processMessage(content, context);

      // Update context with AI response
      context.history.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        metadata: {
          ...(response.tools ? { tools: response.tools } : {}),
          interactionType: 'message'
        }
      });

      await this.contextService.updateContext(context);

      // Send response
      await message.reply(response.content);

      this.logger.info(`Conversation message processed for user ${message.author.id}`);
    } catch (error) {
      this.logger.error('Error in conversation message:', error);
      await message.reply('Sorry, I encountered an error processing your message. Please try again.');
    }
  }

  // Command handlers
  private async handleHelpCommand(message: Message, args: string): Promise<void> {
    const helpText = `**Available Commands:**\n\n` +
      `**Conversation:**\n` +
      `• Mention me or use \`${this.BOT_PREFIX}\` prefix to chat\n` +
      `• I can help with questions, tasks, and more!\n\n` +
      `**Utility Commands:**\n` +
      `• \`${this.BOT_PREFIX}ping\` - Check if I'm responsive\n` +
      `• \`${this.BOT_PREFIX}info\` - Get bot information\n` +
      `• \`${this.BOT_PREFIX}status\` - Check service status\n` +
      `• \`${this.BOT_PREFIX}clear\` - Clear conversation history\n\n` +
      `**Tool Commands:**\n` +
      `• \`${this.BOT_PREFIX}remind <message> <time>\` - Set a reminder\n` +
      `• \`${this.BOT_PREFIX}time [timezone]\` - Get current time\n` +
      `• \`${this.BOT_PREFIX}weather <location>\` - Get weather info\n` +
      `• \`${this.BOT_PREFIX}search <query>\` - Web search\n` +
      `• \`${this.BOT_PREFIX}translate <text> [language]\` - Translate text\n\n` +
      `**Voice:**\n` +
      `• Join a voice channel and I'll join you for voice conversations!\n\n` +
      `For more detailed help, use \`/help\` (slash command).`;

    await message.reply(helpText);
  }

  private async handlePingCommand(message: Message): Promise<void> {
    const sent = await message.reply('Pinging...');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    
    await sent.edit(`🏓 Pong! Latency: ${latency}ms | API Latency: ${Math.round(this.client.ws.ping)}ms`);
  }

  private async handleInfoCommand(message: Message): Promise<void> {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const infoText = `**Bot Information:**\n\n` +
      `• **Name:** ${this.client.user?.username}\n` +
      `• **ID:** ${this.client.user?.id}\n` +
      `• **Uptime:** ${hours}h ${minutes}m ${seconds}s\n` +
      `• **Servers:** ${this.client.guilds.cache.size}\n` +
      `• **Users:** ${this.client.users.cache.size}\n` +
      `• **Node.js:** ${process.version}\n` +
      `• **Environment:** ${process.env.NODE_ENV || 'development'}\n\n` +
      `**Features:**\n` +
      `• Multi-modal AI interactions\n` +
      `• Voice conversations with Pipecat\n` +
      `• Tool integration and automation\n` +
      `• Context-aware conversations`;

    await message.reply(infoText);
  }

  private async handleStatusCommand(message: Message): Promise<void> {
    try {
      const griptapeStatus = await this.griptapeService.getStatus();
      const context = await this.contextService.getContext(message.author.id, message.channelId);

      const statusText = `**Service Status:**\n\n` +
        `• **Discord API:** 🟢 Online\n` +
        `• **Griptape Service:** ${griptapeStatus.status === 'healthy' ? '🟢' : '🔴'} ${griptapeStatus.status}\n` +
        `• **Context Service:** 🟢 Active\n` +
        `• **Your Context:** ${context.history.length} messages\n\n` +
        `**Performance:**\n` +
        `• API Latency: ${Math.round(this.client.ws.ping)}ms\n` +
        `• Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`;

      await message.reply(statusText);
    } catch (error) {
      this.logger.error('Error getting status:', error);
      await message.reply('Sorry, I encountered an error getting the status.');
    }
  }

  private async handleClearCommand(message: Message): Promise<void> {
    try {
      await this.contextService.clearContext(message.author.id, message.channelId);
      await message.reply('✅ Your conversation history has been cleared!');
    } catch (error) {
      this.logger.error('Error clearing context:', error);
      await message.reply('Sorry, I encountered an error clearing your history.');
    }
  }

  private async handleRemindCommand(message: Message, args: string): Promise<void> {
    if (!args) {
      await message.reply(`Usage: \`${this.BOT_PREFIX}remind <message> <time>\`\nExample: \`${this.BOT_PREFIX}remind call mom tomorrow at 2pm\``);
      return;
    }

    try {
      const context = await this.contextService.getContext(message.author.id, message.channelId);
      const reminderPrompt = `Create a reminder for: "${args}". Parse the time and return a JSON response with the scheduled time.`;
      
      const response = await this.griptapeService.processMessage(reminderPrompt, context);
      await message.reply(`✅ Reminder set: ${response.content}`);
    } catch (error) {
      this.logger.error('Error setting reminder:', error);
      await message.reply('Sorry, I encountered an error setting your reminder.');
    }
  }

  private async handleTimeCommand(message: Message, args: string): Promise<void> {
    try {
      const context = await this.contextService.getContext(message.author.id, message.channelId);
      const timePrompt = args ? `What is the current time in ${args}?` : 'What is the current time?';
      
      const response = await this.griptapeService.processMessage(timePrompt, context);
      await message.reply(response.content);
    } catch (error) {
      this.logger.error('Error getting time:', error);
      await message.reply('Sorry, I encountered an error getting the time.');
    }
  }

  private async handleWeatherCommand(message: Message, args: string): Promise<void> {
    if (!args) {
      await message.reply(`Usage: \`${this.BOT_PREFIX}weather <location>\`\nExample: \`${this.BOT_PREFIX}weather San Francisco\``);
      return;
    }

    try {
      const context = await this.contextService.getContext(message.author.id, message.channelId);
      const weatherPrompt = `What's the weather like in ${args}?`;
      
      const response = await this.griptapeService.processMessage(weatherPrompt, context);
      await message.reply(response.content);
    } catch (error) {
      this.logger.error('Error getting weather:', error);
      await message.reply('Sorry, I encountered an error getting the weather.');
    }
  }

  private async handleSearchCommand(message: Message, args: string): Promise<void> {
    if (!args) {
      await message.reply(`Usage: \`${this.BOT_PREFIX}search <query>\`\nExample: \`${this.BOT_PREFIX}search latest AI news\``);
      return;
    }

    try {
      const context = await this.contextService.getContext(message.author.id, message.channelId);
      const searchPrompt = `Search for: "${args}". Provide a summary of the most relevant results.`;
      
      const response = await this.griptapeService.processMessage(searchPrompt, context);
      await message.reply(response.content);
    } catch (error) {
      this.logger.error('Error performing search:', error);
      await message.reply('Sorry, I encountered an error performing the search.');
    }
  }

  private async handleTranslateCommand(message: Message, args: string): Promise<void> {
    if (!args) {
      await message.reply(`Usage: \`${this.BOT_PREFIX}translate <text> [language]\`\nExample: \`${this.BOT_PREFIX}translate Hello world Spanish\``);
      return;
    }

    try {
      const context = await this.contextService.getContext(message.author.id, message.channelId);
      const translatePrompt = `Translate: "${args}". If a target language is specified, translate to that language. Otherwise, detect the language and translate to English.`;
      
      const response = await this.griptapeService.processMessage(translatePrompt, context);
      await message.reply(response.content);
    } catch (error) {
      this.logger.error('Error translating:', error);
      await message.reply('Sorry, I encountered an error translating the text.');
    }
  }
} 