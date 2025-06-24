import { 
  Client, 
  ChatInputCommandInteraction, 
  AutocompleteInteraction,
  SlashCommandBuilder,
  REST,
  Routes,
  Collection
} from 'discord.js';
import { Logger } from 'winston';
import { GriptapeService } from '../services/griptape';
import { ContextService } from '../services/context';
import { SlashCommand, AIResponse, ConversationContext, InteractionType } from '../types';

export class SlashCommandHandler {
  private commands: Collection<string, SlashCommand> = new Collection();
  private cooldowns: Collection<string, Collection<string, number>> = new Collection();

  constructor(
    private client: Client,
    private griptapeService: GriptapeService,
    private contextService: ContextService,
    private logger: Logger
  ) {
    this.loadCommands();
  }

  private loadCommands(): void {
    // Chat command
    const chatCommand: SlashCommand = {
      data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Start a conversation with the AI')
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('Your message to the AI')
            .setRequired(true)
            .setMaxLength(1000)
        )
        .addBooleanOption(option =>
          option
            .setName('private')
            .setDescription('Make the response private (only you can see it)')
            .setRequired(false)
        ) as SlashCommandBuilder,
      execute: async (interaction) => {
        await this.handleChatCommand(interaction);
      },
      cooldown: 3 // 3 seconds
    };

    // Reminder command
    const reminderCommand: SlashCommand = {
      data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder')
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('What to remind you about')
            .setRequired(true)
            .setMaxLength(200)
        )
        .addStringOption(option =>
          option
            .setName('time')
            .setDescription('When to remind you (e.g., "2pm", "tomorrow 3pm", "in 1 hour")')
            .setRequired(true)
        ) as SlashCommandBuilder,
      execute: async (interaction) => {
        await this.handleReminderCommand(interaction);
      },
      cooldown: 5
    };

    // Time command
    const timeCommand: SlashCommand = {
      data: new SlashCommandBuilder()
        .setName('time')
        .setDescription('Get current time information')
        .addStringOption(option =>
          option
            .setName('timezone')
            .setDescription('Timezone to check (e.g., "UTC", "America/New_York")')
            .setRequired(false)
        ) as SlashCommandBuilder,
      execute: async (interaction) => {
        await this.handleTimeCommand(interaction);
      },
      cooldown: 1
    };

    // Weather command
    const weatherCommand: SlashCommand = {
      data: new SlashCommandBuilder()
        .setName('weather')
        .setDescription('Get weather information')
        .addStringOption(option =>
          option
            .setName('location')
            .setDescription('City or location to check weather for')
            .setRequired(true)
            .setMaxLength(100)
        )
        .addStringOption(option =>
          option
            .setName('units')
            .setDescription('Temperature units')
            .setRequired(false)
            .addChoices(
              { name: 'Celsius', value: 'metric' },
              { name: 'Fahrenheit', value: 'imperial' }
            )
        ) as SlashCommandBuilder,
      execute: async (interaction) => {
        await this.handleWeatherCommand(interaction);
      },
      cooldown: 5
    };

    // Help command
    const helpCommand: SlashCommand = {
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show available commands and their usage')
        .addStringOption(option =>
          option
            .setName('command')
            .setDescription('Specific command to get help for')
            .setRequired(false)
        ) as SlashCommandBuilder,
      execute: async (interaction) => {
        await this.handleHelpCommand(interaction);
      },
      cooldown: 1
    };

    // Settings command
    const settingsCommand: SlashCommand = {
      data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Manage your bot preferences')
        .addSubcommand(subcommand =>
          subcommand
            .setName('view')
            .setDescription('View your current settings')
        )
        .addSubcommand(subcommand =>
          subcommand
            .setName('update')
            .setDescription('Update your settings')
            .addStringOption(option =>
              option
                .setName('language')
                .setDescription('Preferred language')
                .setRequired(false)
                .addChoices(
                  { name: 'English', value: 'en' },
                  { name: 'Spanish', value: 'es' },
                  { name: 'French', value: 'fr' }
                )
            )
            .addBooleanOption(option =>
              option
                .setName('auto_join_voice')
                .setDescription('Automatically join voice channels')
                .setRequired(false)
            )
        ),
      execute: async (interaction) => {
        await this.handleSettingsCommand(interaction);
      },
      cooldown: 2
    };

    // Ask command
    const askCommand: SlashCommand = {
      data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask the AI a question')
        .addStringOption(option =>
          option.setName('question')
            .setDescription('Your question')
            .setRequired(true)
        ) as SlashCommandBuilder,
      execute: async (interaction) => {
        await this.handleAskCommand(interaction);
      },
      cooldown: 3
    };

    // Search command
    const searchCommand: SlashCommand = {
      data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search the web')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('Search query')
            .setRequired(true)
        ) as SlashCommandBuilder,
      execute: async (interaction) => {
        await this.handleSearchCommand(interaction);
      },
      cooldown: 5
    };

    // Register commands
    this.commands.set(chatCommand.data.name, chatCommand);
    this.commands.set(reminderCommand.data.name, reminderCommand);
    this.commands.set(timeCommand.data.name, timeCommand);
    this.commands.set(weatherCommand.data.name, weatherCommand);
    this.commands.set(helpCommand.data.name, helpCommand);
    this.commands.set(settingsCommand.data.name, settingsCommand);
    this.commands.set(askCommand.data.name, askCommand);
    this.commands.set(searchCommand.data.name, searchCommand);

    this.logger.info(`Loaded ${this.commands.size} slash commands`);
  }

  async handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      this.logger.warn(`Unknown command: ${interaction.commandName}`);
      await interaction.reply({
        content: 'Unknown command. Use `/help` to see available commands.',
        ephemeral: true
      });
      return;
    }

    // Check cooldown
    if (command.cooldown) {
      const cooldownKey = `${interaction.user.id}-${interaction.commandName}`;
      const now = Date.now();
      const timestamps = this.cooldowns.get(interaction.commandName) || new Collection();
      const cooldownAmount = command.cooldown * 1000;

      if (timestamps.has(cooldownKey)) {
        const expirationTime = timestamps.get(cooldownKey)! + cooldownAmount;

        if (now < expirationTime) {
          const timeLeft = (expirationTime - now) / 1000;
          await interaction.reply({
            content: `Please wait ${timeLeft.toFixed(1)} more seconds before using this command again.`,
            ephemeral: true
          });
          return;
        }
      }

      timestamps.set(cooldownKey, now);
      this.cooldowns.set(interaction.commandName, timestamps);
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      this.logger.error(`Error executing command ${interaction.commandName}:`, error);
      
      const reply = {
        content: 'There was an error while executing this command!',
        ephemeral: true
      };

      if ('replied' in interaction && 'deferred' in interaction && (interaction as any).replied || (interaction as any).deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  }

  async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (command?.autocomplete) {
      try {
        await command.autocomplete(interaction);
      } catch (error) {
        this.logger.error(`Error handling autocomplete for ${interaction.commandName}:`, error);
      }
    }
  }

  async deployCommands(): Promise<void> {
    try {
      const rest = new REST({ version: '10' }).setToken(this.client.token!);
      const commandData = this.commands.map(command => command.data.toJSON());

      this.logger.info('Started refreshing application (/) commands.');

      if (process.env.DISCORD_GUILD_ID) {
        // Deploy to specific guild (faster for development)
        await rest.put(
          Routes.applicationGuildCommands(this.client.user!.id, process.env.DISCORD_GUILD_ID),
          { body: commandData }
        );
        this.logger.info(`Successfully reloaded ${commandData.length} guild (/) commands.`);
      } else {
        // Deploy globally
        await rest.put(
          Routes.applicationCommands(this.client.user!.id),
          { body: commandData }
        );
        this.logger.info(`Successfully reloaded ${commandData.length} global (/) commands.`);
      }
    } catch (error) {
      this.logger.error('Error deploying commands:', error);
      throw error;
    }
  }

  // Command handlers
  private async handleChatCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const message = interaction.options.getString('message', true);
    const isPrivate = interaction.options.getBoolean('private') ?? false;

    await interaction.deferReply({ ephemeral: isPrivate });

    try {
      // Get or create conversation context
      const context = await this.contextService.getContext(
        interaction.user.id,
        interaction.channelId
      );

      // Update context for this interaction
      context.interactionType = 'slash';
      context.timestamp = new Date();
      context.history.push({
        role: 'user',
        content: message,
        timestamp: new Date(),
        metadata: { interactionType: 'slash' }
      });

      // Process with AI service
      const response = await this.griptapeService.processMessage(message, context);

      // Update context with AI response
      context.history.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        metadata: {
          ...(response.tools ? { tools: response.tools } : {}),
          interactionType: 'slash'
        }
      });

      await this.contextService.updateContext(context);

      // Send response
      await interaction.editReply({
        content: response.content
      });

      this.logger.info(`Chat command executed for user ${interaction.user.id}`);
    } catch (error) {
      this.logger.error('Error in chat command:', error);
      await interaction.editReply({
        content: 'Sorry, I encountered an error processing your message. Please try again.'
      });
    }
  }

  private async handleReminderCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const message = interaction.options.getString('message', true);
    const timeString = interaction.options.getString('time', true);

    await interaction.deferReply({ ephemeral: true });

    try {
      // Use AI service to parse time and create reminder
      const context = await this.contextService.getContext(
        interaction.user.id,
        interaction.channelId
      );

      const reminderPrompt = `Create a reminder for: "${message}" at time: "${timeString}". Parse the time and return a JSON response with the scheduled time.`;
      
      const response = await this.griptapeService.processMessage(reminderPrompt, context);

      await interaction.editReply({
        content: `✅ Reminder set: "${message}" - ${response.content}`
      });

      this.logger.info(`Reminder command executed for user ${interaction.user.id}`);
    } catch (error) {
      this.logger.error('Error in reminder command:', error);
      await interaction.editReply({
        content: 'Sorry, I encountered an error setting your reminder. Please try again.'
      });
    }
  }

  private async handleTimeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const timezone = interaction.options.getString('timezone');

    try {
      const context = await this.contextService.getContext(
        interaction.user.id,
        interaction.channelId
      );

      const timePrompt = timezone 
        ? `What is the current time in ${timezone}?`
        : 'What is the current time?';

      const response = await this.griptapeService.processMessage(timePrompt, context);

      await interaction.reply({
        content: response.content,
        ephemeral: false
      });
    } catch (error) {
      this.logger.error('Error in time command:', error);
      await interaction.reply({
        content: 'Sorry, I encountered an error getting the time. Please try again.',
        ephemeral: true
      });
    }
  }

  private async handleWeatherCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const location = interaction.options.getString('location', true);
    const units = interaction.options.getString('units') || 'metric';

    await interaction.deferReply();

    try {
      const context = await this.contextService.getContext(
        interaction.user.id,
        interaction.channelId
      );

      const weatherPrompt = `What's the weather like in ${location}? Use ${units} units.`;
      const response = await this.griptapeService.processMessage(weatherPrompt, context);

      await interaction.editReply({
        content: response.content
      });
    } catch (error) {
      this.logger.error('Error in weather command:', error);
      await interaction.editReply({
        content: 'Sorry, I encountered an error getting the weather. Please try again.'
      });
    }
  }

  private async handleHelpCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const specificCommand = interaction.options.getString('command');

    if (specificCommand) {
      const command = this.commands.get(specificCommand);
      if (command) {
        const helpText = `**/${command.data.name}**\n${command.data.description}\n\n**Usage:**\n\`/${command.data.name}\``;
        await interaction.reply({ content: helpText, ephemeral: true });
      } else {
        await interaction.reply({
          content: `Command "/${specificCommand}" not found. Use \`/help\` to see all available commands.`,
          ephemeral: true
        });
      }
    } else {
      const helpText = this.commands.map(cmd => 
        `**/${cmd.data.name}** - ${cmd.data.description}`
      ).join('\n');

      await interaction.reply({
        content: `**Available Commands:**\n\n${helpText}\n\nUse \`/help <command>\` for detailed information about a specific command.`,
        ephemeral: true
      });
    }
  }

  private async handleSettingsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      try {
        const preferences = await this.contextService.getUserPreferences(interaction.user.id);
        
        const settingsText = `**Your Settings:**\n` +
          `• Language: ${preferences.language}\n` +
          `• Text Model: ${preferences.textModel}\n` +
          `• Auto-join Voice: ${preferences.autoJoinVoice ? 'Yes' : 'No'}\n` +
          `• Reminders: ${preferences.notificationSettings.reminders ? 'Enabled' : 'Disabled'}\n` +
          `• Mentions: ${preferences.notificationSettings.mentions ? 'Enabled' : 'Disabled'}\n` +
          `• DMs: ${preferences.notificationSettings.dms ? 'Enabled' : 'Disabled'}`;

        await interaction.reply({
          content: settingsText,
          ephemeral: true
        });
      } catch (error) {
        this.logger.error('Error viewing settings:', error);
        await interaction.reply({
          content: 'Sorry, I encountered an error loading your settings.',
          ephemeral: true
        });
      }
    } else if (subcommand === 'update') {
      const language = interaction.options.getString('language');
      const autoJoinVoice = interaction.options.getBoolean('auto_join_voice');

      try {
        const preferences = await this.contextService.getUserPreferences(interaction.user.id);
        
        if (language) preferences.language = language;
        if (autoJoinVoice !== null) preferences.autoJoinVoice = autoJoinVoice;

        await this.contextService.updateUserPreferences(interaction.user.id, preferences);

        await interaction.reply({
          content: '✅ Your settings have been updated!',
          ephemeral: true
        });
      } catch (error) {
        this.logger.error('Error updating settings:', error);
        await interaction.reply({
          content: 'Sorry, I encountered an error updating your settings.',
          ephemeral: true
        });
      }
    }
  }

  private async handleAskCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const question = interaction.options.getString('question', true);

    await interaction.deferReply();

    try {
      // Get or create conversation context
      const context = await this.contextService.getContext(
        interaction.user.id,
        interaction.channelId
      );

      // Update context for this interaction
      context.interactionType = 'slash';
      context.timestamp = new Date();
      context.history.push({
        role: 'user',
        content: question,
        timestamp: new Date(),
        metadata: { interactionType: 'slash' }
      });

      // Process with AI service
      const response = await this.griptapeService.processMessage(question, context);

      // Update context with AI response
      context.history.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        metadata: {
          ...(response.tools ? { tools: response.tools } : {}),
          interactionType: 'slash'
        }
      });

      await this.contextService.updateContext(context);

      // Send response
      await interaction.editReply({
        content: response.content
      });

      this.logger.info(`Ask command executed for user ${interaction.user.id}`);
    } catch (error) {
      this.logger.error('Error in ask command:', error);
      await interaction.editReply({
        content: 'Sorry, I encountered an error processing your question. Please try again.'
      });
    }
  }

  private async handleSearchCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const query = interaction.options.getString('query', true);

    await interaction.deferReply();

    try {
      // Get or create conversation context
      const context = await this.contextService.getContext(
        interaction.user.id,
        interaction.channelId
      );

      // Update context for this interaction
      context.interactionType = 'slash';
      context.timestamp = new Date();
      context.history.push({
        role: 'user',
        content: query,
        timestamp: new Date(),
        metadata: { interactionType: 'slash' }
      });

      // Process with AI service
      const response = await this.griptapeService.processMessage(query, context);

      // Update context with AI response
      context.history.push({
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        metadata: {
          ...(response.tools ? { tools: response.tools } : {}),
          interactionType: 'slash'
        }
      });

      await this.contextService.updateContext(context);

      // Send response
      await interaction.editReply({
        content: response.content
      });

      this.logger.info(`Search command executed for user ${interaction.user.id}`);
    } catch (error) {
      this.logger.error('Error in search command:', error);
      await interaction.editReply({
        content: 'Sorry, I encountered an error processing your search. Please try again.'
      });
    }
  }
} 