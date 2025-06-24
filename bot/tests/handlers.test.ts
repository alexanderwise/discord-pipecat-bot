import { jest } from '@jest/globals';
import { Message, ChatInputCommandInteraction } from 'discord.js';
import { MessageHandler } from '../src/handlers/messages';
import { SlashCommandHandler } from '../src/handlers/slashCommands';

// Mock Discord.js
jest.mock('discord.js');

describe('MessageHandler', () => {
  let messageHandler: MessageHandler;
  let mockMessage: jest.Mocked<Message>;

  beforeEach(() => {
    // Create mock message
    mockMessage = {
      content: '!help',
      author: { id: '123', bot: false } as any,
      channel: { id: '456' } as any,
      guild: { id: '789' } as any,
      reply: jest.fn(),
    } as any;

    // Create handler with mocked services
    messageHandler = new MessageHandler(
      {} as any, // client
      { processMessage: jest.fn() } as any, // griptapeService
      { getContext: jest.fn() } as any, // contextService
      { info: jest.fn(), error: jest.fn() } as any // logger
    );
  });

  test('should handle command messages', async () => {
    await messageHandler.handleMessage(mockMessage);
    
    // Verify the message was processed
    expect(mockMessage.reply).toHaveBeenCalled();
  });
});

describe('SlashCommandHandler', () => {
  let slashHandler: SlashCommandHandler;
  let mockInteraction: jest.Mocked<ChatInputCommandInteraction>;

  beforeEach(() => {
    mockInteraction = {
      commandName: 'help',
      user: { id: '123' } as any,
      channelId: '456',
      reply: jest.fn(),
      editReply: jest.fn(),
      deferReply: jest.fn(),
    } as any;

    slashHandler = new SlashCommandHandler(
      {} as any, // client
      { processMessage: jest.fn() } as any, // griptapeService
      { getContext: jest.fn() } as any, // contextService
      { info: jest.fn(), error: jest.fn() } as any // logger
    );
  });

  test('should handle slash commands', async () => {
    await slashHandler.handleInteraction(mockInteraction);
    
    // Verify the interaction was processed
    expect(mockInteraction.reply).toHaveBeenCalled();
  });
}); 