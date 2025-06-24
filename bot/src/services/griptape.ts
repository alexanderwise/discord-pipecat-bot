import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from 'winston';
import { 
  AIService, 
  AIResponse, 
  ConversationContext, 
  ToolResult, 
  Tool, 
  ServiceStatus 
} from '../types';

export class GriptapeService implements AIService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl: string, private logger: Logger) {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request/response interceptors for logging
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Griptape request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Griptape request error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug(`Griptape response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        this.logger.error('Griptape response error:', error);
        return Promise.reject(error);
      }
    );
  }

  async processMessage(message: string, context: ConversationContext): Promise<AIResponse> {
    try {
      const startTime = Date.now();

      const response: AxiosResponse<AIResponse> = await this.client.post('/process', {
        message,
        context: {
          userId: context.userId,
          guildId: context.guildId,
          channelId: context.channelId,
          interactionType: context.interactionType,
          history: context.history.slice(-10), // Send last 10 messages for context
          tools: context.tools,
          preferences: context.preferences
        }
      });

      const latency = Date.now() - startTime;

      return {
        ...response.data,
        metadata: {
          model: response.data.metadata?.model || 'gpt-4',
          tokens: response.data.metadata?.tokens || 0,
          latency: response.data.metadata?.latency || 0
        }
      };
    } catch (error) {
      this.logger.error('Error processing message with Griptape:', error);
      throw new Error(`Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeTool(toolName: string, params: any): Promise<ToolResult> {
    try {
      const response: AxiosResponse<ToolResult> = await this.client.post('/tools/execute', {
        tool: toolName,
        parameters: params
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Error executing tool ${toolName}:`, error);
      
      return {
        name: toolName,
        input: params,
        output: null,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  getAvailableTools(): Tool[] {
    return [
      {
        name: 'web_search',
        description: 'Search the web for current information',
        parameters: [
          {
            name: 'query',
            type: 'string',
            description: 'Search query',
            required: true
          }
        ],
        execute: async (params: { query: string }) => {
          // Implementation would call the web search tool
          return { success: true, output: `Search results for: ${params.query}` };
        }
      }
    ];
  }

  async getStatus(): Promise<ServiceStatus> {
    try {
      const startTime = Date.now();
      const response: AxiosResponse<ServiceStatus> = await this.client.get('/health');
      const latency = Date.now() - startTime;

      return {
        ...response.data,
        metrics: {
          ...response.data.metrics,
          averageLatency: latency
        }
      };
    } catch (error) {
      this.logger.error('Error getting Griptape service status:', error);
      
      return {
        status: 'unhealthy',
        uptime: 0,
        lastCheck: new Date(),
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        metrics: {
          requestsPerMinute: 0,
          averageLatency: 0,
          errorRate: 100
        }
      };
    }
  }

  async updateSettings(settings: any): Promise<void> {
    try {
      await this.client.post('/settings', settings);
      this.logger.info('Griptape settings updated successfully');
    } catch (error) {
      this.logger.error('Error updating Griptape settings:', error);
      throw error;
    }
  }

  async clearContext(userId: string, channelId: string): Promise<void> {
    try {
      await this.client.delete(`/context/${userId}/${channelId}`);
      this.logger.info(`Cleared context for user ${userId} in channel ${channelId}`);
    } catch (error) {
      this.logger.error('Error clearing context:', error);
      throw error;
    }
  }

  async getContext(userId: string, channelId: string): Promise<ConversationContext | null> {
    try {
      const response: AxiosResponse<ConversationContext> = await this.client.get(`/context/${userId}/${channelId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      this.logger.error('Error getting context:', error);
      throw error;
    }
  }

  async updateContext(context: ConversationContext): Promise<void> {
    try {
      await this.client.put(`/context/${context.userId}/${context.channelId}`, context);
    } catch (error) {
      this.logger.error('Error updating context:', error);
      throw error;
    }
  }

  // Batch processing for multiple messages
  async processBatch(messages: Array<{ message: string; context: ConversationContext }>): Promise<AIResponse[]> {
    try {
      const response: AxiosResponse<AIResponse[]> = await this.client.post('/process/batch', {
        messages
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error processing batch messages:', error);
      throw error;
    }
  }

  // Stream processing for real-time responses
  async processStream(message: string, context: ConversationContext): Promise<AsyncIterable<string>> {
    try {
      const response = await this.client.post('/process/stream', {
        message,
        context
      }, {
        responseType: 'stream'
      });

      return this.createStreamIterator(response.data);
    } catch (error) {
      this.logger.error('Error processing stream:', error);
      throw error;
    }
  }

  private async *createStreamIterator(stream: any): AsyncIterable<string> {
    for await (const chunk of stream) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            yield parsed.content || '';
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  // Tool-specific methods
  async searchWeb(query: string): Promise<ToolResult> {
    return this.executeTool('web_search', { query });
  }

  async getWeather(location: string, units: string = 'metric'): Promise<ToolResult> {
    return this.executeTool('weather', { location, units });
  }

  async getCurrentTime(timezone?: string): Promise<ToolResult> {
    return this.executeTool('time', { timezone });
  }

  async setReminder(message: string, time: string): Promise<ToolResult> {
    return this.executeTool('reminder', { message, time });
  }

  async translateText(text: string, targetLanguage?: string): Promise<ToolResult> {
    return this.executeTool('translate', { text, target_language: targetLanguage });
  }

  async calculateExpression(expression: string): Promise<ToolResult> {
    return this.executeTool('calculator', { expression });
  }

  // Memory management
  async saveToMemory(key: string, value: any): Promise<void> {
    try {
      await this.client.post('/memory', { key, value });
    } catch (error) {
      this.logger.error('Error saving to memory:', error);
      throw error;
    }
  }

  async getFromMemory(key: string): Promise<any> {
    try {
      const response: AxiosResponse<any> = await this.client.get(`/memory/${key}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      this.logger.error('Error getting from memory:', error);
      throw error;
    }
  }

  async deleteFromMemory(key: string): Promise<void> {
    try {
      await this.client.delete(`/memory/${key}`);
    } catch (error) {
      this.logger.error('Error deleting from memory:', error);
      throw error;
    }
  }
} 