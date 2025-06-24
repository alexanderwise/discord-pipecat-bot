import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createClient } from 'redis';
import { Pool } from 'pg';
import winston from 'winston';
import path from 'path';

// Import handlers
import { SlashCommandHandler } from './handlers/slashCommands';
import { MessageHandler } from './handlers/messages';
import { VoiceHandler } from './handlers/voice';

// Import services
import { GriptapeService } from './services/griptape';
import { PipecatService } from './services/pipecat';
import { ContextService } from './services/context';

// Import types
import { BotConfig, InteractionType } from './types';

// Load environment variables
config();

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'discord-bot' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Bot configuration
const botConfig: BotConfig = {
  token: process.env.DISCORD_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  prefix: process.env.BOT_PREFIX || '!',
  logLevel: process.env.LOG_LEVEL || 'info',
  environment: process.env.NODE_ENV || 'development',
  ...(process.env.DISCORD_GUILD_ID && { guildId: process.env.DISCORD_GUILD_ID })
};

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers
  ]
});

// Initialize collections
client.commands = new Collection();
client.cooldowns = new Collection();

// Initialize database connections
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

const pgPool = new Pool({
  connectionString: process.env.POSTGRES_URL || 'postgresql://postgres:password@localhost:5432/discord_bot',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Initialize services
const griptapeService = new GriptapeService(
  process.env.GRIPTAPE_SERVICE_URL || 'http://localhost:8000',
  logger
);

const pipecatService = new PipecatService(
  process.env.PIPECAT_SERVICE_URL || 'http://localhost:8001',
  logger
);

const contextService = new ContextService(redisClient as any, pgPool, logger);

// Initialize handlers
const slashCommandHandler = new SlashCommandHandler(client, griptapeService, contextService, logger);
const messageHandler = new MessageHandler(client, griptapeService, contextService, logger);
const voiceHandler = new VoiceHandler(client, pipecatService, contextService, logger);

// Health check server
const app = express();
const PORT = process.env.HEALTH_CHECK_PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      discord: client.isReady(),
      redis: redisClient.isReady,
      postgres: pgPool.totalCount > 0
    }
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json({
    commands: client.commands.size,
    cooldowns: client.cooldowns.size,
    guilds: client.guilds.cache.size,
    users: client.users.cache.size
  });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Bot event handlers
client.once(Events.ClientReady, async () => {
  logger.info(`Bot logged in as ${client.user?.tag}`);
  
  try {
    // Connect to Redis
    await redisClient.connect();
    logger.info('Connected to Redis');
    
    // Test PostgreSQL connection
    await pgPool.query('SELECT NOW()');
    logger.info('Connected to PostgreSQL');
    
    // Deploy slash commands
    await slashCommandHandler.deployCommands();
    logger.info('Slash commands deployed');
    
    // Start health check server
    app.listen(PORT, () => {
      logger.info(`Health check server running on port ${PORT}`);
    });
    
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await slashCommandHandler.handleInteraction(interaction);
    } else if (interaction.isAutocomplete()) {
      await slashCommandHandler.handleAutocomplete(interaction);
    }
  } catch (error) {
    logger.error('Error handling interaction:', error);
    const reply = {
      content: 'There was an error while executing this command!',
      ephemeral: true
    };
    
    if ('replied' in interaction && 'deferred' in interaction && 
        (interaction as any).replied || (interaction as any).deferred) {
      if ('followUp' in interaction) {
        await (interaction as any).followUp(reply);
      }
    } else if ('reply' in interaction) {
      await (interaction as any).reply(reply);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await messageHandler.handleMessage(message);
  } catch (error) {
    logger.error('Error handling message:', error);
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    await voiceHandler.handleVoiceStateUpdate(oldState, newState);
  } catch (error) {
    logger.error('Error handling voice state update:', error);
  }
});

// Error handling
client.on(Events.Error, (error) => {
  logger.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  
  try {
    await client.destroy();
    await redisClient.quit();
    await pgPool.end();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  
  try {
    await client.destroy();
    await redisClient.quit();
    await pgPool.end();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Login to Discord
client.login(botConfig.token).catch((error) => {
  logger.error('Failed to login to Discord:', error);
  process.exit(1);
});

export { client, logger, redisClient, pgPool, griptapeService, pipecatService, contextService }; 