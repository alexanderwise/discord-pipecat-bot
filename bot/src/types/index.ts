import { 
  Client, 
  ChatInputCommandInteraction, 
  AutocompleteInteraction,
  Message,
  VoiceState,
  Collection,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder
} from 'discord.js';
import { RedisClientType } from '@redis/client';
import { Pool } from 'pg';
import { Logger } from 'winston';

// Global type declarations
declare global {
  interface MediaStream {}
}

// Bot Configuration
export interface BotConfig {
  token: string;
  clientId: string;
  guildId?: string;
  prefix: string;
  logLevel: string;
  environment: string;
}

// Interaction Types
export type InteractionType = 'slash' | 'message' | 'voice' | 'autocomplete';

// AI Service Responses
export interface AIResponse {
  content: string;
  tools?: ToolResult[];
  context?: ConversationContext;
  metadata?: {
    model: string;
    tokens: number;
    latency: number;
  };
}

export interface ToolResult {
  name: string;
  input: any;
  output: any;
  success: boolean;
  error?: string;
}

// Conversation Context
export interface ConversationContext {
  userId: string;
  guildId?: string;
  channelId: string;
  interactionType: InteractionType;
  history: MessageHistory[];
  tools: string[];
  preferences: UserPreferences;
  timestamp: Date;
}

export interface MessageHistory {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    tools?: ToolResult[];
    interactionType?: InteractionType;
  };
}

export interface UserPreferences {
  language: string;
  voiceModel?: string;
  textModel: string;
  autoJoinVoice: boolean;
  notificationSettings: NotificationSettings;
}

export interface NotificationSettings {
  reminders: boolean;
  mentions: boolean;
  dms: boolean;
}

// Tool Definitions
export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (params: any) => Promise<any>;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: any;
}

// Voice State
export interface VoiceSession {
  guildId: string;
  channelId: string;
  userId: string;
  isActive: boolean;
  startTime: Date;
  lastActivity: Date;
  audioBridge?: WebRTCBridge;
}

export interface WebRTCBridge {
  id: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  audioInput?: MediaStream;
  audioOutput?: MediaStream;
  error?: string;
}

// Service Interfaces
export interface AIService {
  processMessage(message: string, context: ConversationContext): Promise<AIResponse>;
  executeTool(toolName: string, params: any): Promise<ToolResult>;
  getAvailableTools(): Tool[];
}

export interface VoiceService {
  startSession(session: VoiceSession): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
  processAudio(audioData: Buffer): Promise<AIResponse>;
  getStatus(): Promise<ServiceStatus>;
}

export interface ContextService {
  getContext(userId: string, channelId: string): Promise<ConversationContext>;
  updateContext(context: ConversationContext): Promise<void>;
  clearContext(userId: string, channelId: string): Promise<void>;
  getUserPreferences(userId: string): Promise<UserPreferences>;
  updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<void>;
}

// Service Status
export interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastCheck: Date;
  errors: string[];
  metrics: {
    requestsPerMinute: number;
    averageLatency: number;
    errorRate: number;
  };
}

// Command Definitions
export interface SlashCommand {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  cooldown?: number;
}

// Handler Interfaces
export interface InteractionHandler {
  handleInteraction(interaction: ChatInputCommandInteraction): Promise<void>;
  handleAutocomplete(interaction: AutocompleteInteraction): Promise<void>;
  deployCommands(): Promise<void>;
}

export interface MessageHandler {
  handleMessage(message: Message): Promise<void>;
}

export interface VoiceHandler {
  handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void>;
  joinVoiceChannel(channelId: string): Promise<void>;
  leaveVoiceChannel(): Promise<void>;
}

// Database Models
export interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface Guild {
  id: string;
  name: string;
  ownerId: string;
  settings: GuildSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuildSettings {
  prefix: string;
  autoJoinVoice: boolean;
  allowedChannels: string[];
  blockedChannels: string[];
  moderationEnabled: boolean;
}

export interface Reminder {
  id: string;
  userId: string;
  guildId?: string;
  channelId: string;
  message: string;
  scheduledFor: Date;
  isCompleted: boolean;
  createdAt: Date;
}

// Extended Discord.js Client
declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, SlashCommand>;
    cooldowns: Collection<string, Collection<string, number>>;
  }
}

// Error Types
export class BotError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: any
  ) {
    super(message);
    this.name = 'BotError';
  }
}

export class ServiceError extends BotError {
  constructor(message: string, service: string, context?: any) {
    super(message, `SERVICE_${service.toUpperCase()}_ERROR`, 503, context);
    this.name = 'ServiceError';
  }
}

export class ValidationError extends BotError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400, { field });
    this.name = 'ValidationError';
  }
}

// Event Types
export interface BotEvents {
  'command.executed': (interaction: ChatInputCommandInteraction, response: AIResponse) => void;
  'message.processed': (message: Message, response: AIResponse) => void;
  'voice.session.started': (session: VoiceSession) => void;
  'voice.session.ended': (sessionId: string) => void;
  'tool.executed': (tool: ToolResult) => void;
  'error.occurred': (error: BotError) => void;
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>; 