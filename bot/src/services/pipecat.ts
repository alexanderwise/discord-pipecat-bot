import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { Logger } from 'winston';
import { 
  VoiceService, 
  VoiceSession, 
  AIResponse, 
  ServiceStatus 
} from '../types';
import { RedisClientType } from '@redis/client';

export class PipecatService implements VoiceService {
  private client: AxiosInstance;
  private baseUrl: string;
  private activeSessions: Map<string, VoiceSession> = new Map();

  constructor(baseUrl: string, private logger: Logger) {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 60000, // Longer timeout for voice processing
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config: any) => {
        this.logger.debug(`Pipecat request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error: any) => {
        this.logger.error('Pipecat request error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response: any) => {
        this.logger.debug(`Pipecat response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error: any) => {
        this.logger.error('Pipecat response error:', error);
        return Promise.reject(error);
      }
    );
  }

  async startSession(session: VoiceSession): Promise<void> {
    try {
      const response: AxiosResponse<{ sessionId: string }> = await this.client.post('/sessions/start', {
        guildId: session.guildId,
        channelId: session.channelId,
        userId: session.userId,
        settings: {
          voiceActivityDetection: process.env.VOICE_ACTIVITY_DETECTION === 'true',
          interruptionHandling: process.env.VOICE_INTERRUPTION_HANDLING === 'true',
          audioFormat: 'opus',
          sampleRate: 48000,
          channels: 2
        }
      });

      session.isActive = true;
      this.activeSessions.set(session.guildId, session);

      this.logger.info(`Started Pipecat voice session for guild ${session.guildId}`);
    } catch (error) {
      this.logger.error('Error starting Pipecat session:', error);
      throw new Error(`Failed to start voice session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    try {
      await this.client.post(`/sessions/${sessionId}/stop`);
      
      // Remove from active sessions
      this.activeSessions.delete(sessionId);

      this.logger.info(`Stopped Pipecat voice session ${sessionId}`);
    } catch (error) {
      this.logger.error('Error stopping Pipecat session:', error);
      throw error;
    }
  }

  async processAudio(audioData: Buffer): Promise<AIResponse> {
    try {
      const startTime = Date.now();

      const response: AxiosResponse<AIResponse> = await this.client.post('/audio/process', {
        audio: audioData.toString('base64'),
        format: 'opus',
        sampleRate: 48000,
        channels: 2
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const latency = Date.now() - startTime;

      return {
        ...response.data,
        metadata: {
          model: response.data.metadata?.model || 'whisper-1',
          tokens: response.data.metadata?.tokens || 0,
          latency
        }
      };
    } catch (error) {
      this.logger.error('Error processing audio with Pipecat:', error);
      throw new Error(`Failed to process audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
      this.logger.error('Error getting Pipecat service status:', error);
      
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

  async updateSettings(guildId: string, settings: any): Promise<void> {
    try {
      await this.client.post(`/sessions/${guildId}/settings`, settings);
      this.logger.info(`Updated Pipecat settings for guild ${guildId}`);
    } catch (error) {
      this.logger.error('Error updating Pipecat settings:', error);
      throw error;
    }
  }

  // Voice-specific methods
  async setVoiceModel(model: string): Promise<void> {
    try {
      await this.client.post('/voice/model', { model });
      this.logger.info(`Set voice model to ${model}`);
    } catch (error) {
      this.logger.error('Error setting voice model:', error);
      throw error;
    }
  }

  async setSpeechRate(rate: number): Promise<void> {
    try {
      await this.client.post('/voice/rate', { rate });
      this.logger.info(`Set speech rate to ${rate}`);
    } catch (error) {
      this.logger.error('Error setting speech rate:', error);
      throw error;
    }
  }

  async setVoiceVolume(volume: number): Promise<void> {
    try {
      await this.client.post('/voice/volume', { volume });
      this.logger.info(`Set voice volume to ${volume}`);
    } catch (error) {
      this.logger.error('Error setting voice volume:', error);
      throw error;
    }
  }

  async enableInterruptionHandling(enabled: boolean): Promise<void> {
    try {
      await this.client.post('/voice/interruption', { enabled });
      this.logger.info(`${enabled ? 'Enabled' : 'Disabled'} interruption handling`);
    } catch (error) {
      this.logger.error('Error setting interruption handling:', error);
      throw error;
    }
  }

  async enableVoiceActivityDetection(enabled: boolean): Promise<void> {
    try {
      await this.client.post('/voice/vad', { enabled });
      this.logger.info(`${enabled ? 'Enabled' : 'Disabled'} voice activity detection`);
    } catch (error) {
      this.logger.error('Error setting voice activity detection:', error);
      throw error;
    }
  }

  // Audio processing methods
  async processAudioStream(audioStream: AsyncIterable<Buffer>): Promise<AsyncIterable<AIResponse>> {
    try {
      const response = await this.client.post('/audio/stream', {
        stream: true
      }, {
        responseType: 'stream'
      });

      return this.createAudioStreamIterator(response.data, audioStream);
    } catch (error) {
      this.logger.error('Error processing audio stream:', error);
      throw error;
    }
  }

  private async *createAudioStreamIterator(stream: any, audioStream: AsyncIterable<Buffer>): AsyncIterable<AIResponse> {
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
            yield parsed as AIResponse;
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  // Session management
  async getActiveSessions(): Promise<VoiceSession[]> {
    try {
      const response: AxiosResponse<VoiceSession[]> = await this.client.get('/sessions');
      return response.data;
    } catch (error) {
      this.logger.error('Error getting active sessions:', error);
      return Array.from(this.activeSessions.values());
    }
  }

  async getSessionInfo(sessionId: string): Promise<VoiceSession | null> {
    try {
      const response: AxiosResponse<VoiceSession> = await this.client.get(`/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      this.logger.error('Error getting session info:', error);
      throw error;
    }
  }

  async pauseSession(sessionId: string): Promise<void> {
    try {
      await this.client.post(`/sessions/${sessionId}/pause`);
      this.logger.info(`Paused session ${sessionId}`);
    } catch (error) {
      this.logger.error('Error pausing session:', error);
      throw error;
    }
  }

  async resumeSession(sessionId: string): Promise<void> {
    try {
      await this.client.post(`/sessions/${sessionId}/resume`);
      this.logger.info(`Resumed session ${sessionId}`);
    } catch (error) {
      this.logger.error('Error resuming session:', error);
      throw error;
    }
  }

  // Audio bridge methods
  async createAudioBridge(sessionId: string): Promise<string> {
    try {
      const response: AxiosResponse<{ bridgeId: string }> = await this.client.post(`/sessions/${sessionId}/bridge`);
      this.logger.info(`Created audio bridge ${response.data.bridgeId} for session ${sessionId}`);
      return response.data.bridgeId;
    } catch (error) {
      this.logger.error('Error creating audio bridge:', error);
      throw error;
    }
  }

  async destroyAudioBridge(bridgeId: string): Promise<void> {
    try {
      await this.client.delete(`/bridge/${bridgeId}`);
      this.logger.info(`Destroyed audio bridge ${bridgeId}`);
    } catch (error) {
      this.logger.error('Error destroying audio bridge:', error);
      throw error;
    }
  }

  // Conversation flow methods
  async startConversationFlow(sessionId: string, flowType: string): Promise<void> {
    try {
      await this.client.post(`/sessions/${sessionId}/flow`, { type: flowType });
      this.logger.info(`Started conversation flow ${flowType} for session ${sessionId}`);
    } catch (error) {
      this.logger.error('Error starting conversation flow:', error);
      throw error;
    }
  }

  async endConversationFlow(sessionId: string): Promise<void> {
    try {
      await this.client.delete(`/sessions/${sessionId}/flow`);
      this.logger.info(`Ended conversation flow for session ${sessionId}`);
    } catch (error) {
      this.logger.error('Error ending conversation flow:', error);
      throw error;
    }
  }

  // Error handling and recovery
  async recoverSession(sessionId: string): Promise<void> {
    try {
      await this.client.post(`/sessions/${sessionId}/recover`);
      this.logger.info(`Recovered session ${sessionId}`);
    } catch (error) {
      this.logger.error('Error recovering session:', error);
      throw error;
    }
  }

  async getSessionMetrics(sessionId: string): Promise<any> {
    try {
      const response: AxiosResponse<any> = await this.client.get(`/sessions/${sessionId}/metrics`);
      return response.data;
    } catch (error) {
      this.logger.error('Error getting session metrics:', error);
      throw error;
    }
  }
} 