# Model Configuration Guide

This guide explains how to configure different AI model providers for your Discord bot.

## Quick Setup

1. Copy the environment template:
   ```bash
   cp env.example .env
   ```

2. Choose your model provider and set the required variables (see examples below)

3. Test your configuration:
   ```bash
   npm run test-models
   ```

## Provider Examples

### OpenAI (Default)

**Best for**: General purpose, reliable, well-supported
**Cost**: $0.03/1K tokens (GPT-4), $0.002/1K tokens (GPT-3.5)

```bash
MODEL_PROVIDER=openai
MODEL_NAME=gpt-4
OPENAI_API_KEY=sk-...
```

Available models:
- `gpt-4` - Most capable
- `gpt-4-turbo` - Faster, cheaper
- `gpt-3.5-turbo` - Good balance of cost/performance

### Anthropic Claude

**Best for**: Safety-focused, detailed responses
**Cost**: $0.015/1K tokens (Claude 3.5 Sonnet)

```bash
MODEL_PROVIDER=anthropic
MODEL_NAME=claude-3.5-sonnet-20241022
ANTHROPIC_API_KEY=sk-ant-...
```

Available models:
- `claude-3.5-sonnet-20241022` - Latest Claude 3.5
- `claude-3-opus-20240229` - Most capable (expensive)
- `claude-3-haiku-20240307` - Fastest, cheapest

### OpenRouter

**Best for**: Access to 100+ models, uncensored options
**Cost**: Varies by model, often cheaper than direct providers

```bash
MODEL_PROVIDER=openrouter
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_API_KEY=sk-or-...
```

Popular models:
- `anthropic/claude-3.5-sonnet` - Claude 3.5 via OpenRouter
- `meta-llama/llama-2-70b-chat` - Llama 2 70B
- `google/gemini-pro` - Google Gemini Pro
- `nousresearch/nous-hermes-2-mixtral-8x7b-dpo` - Uncensored model

### Together AI

**Best for**: Open source models, fine-tuned models
**Cost**: Very competitive for large models

```bash
MODEL_PROVIDER=together
TOGETHER_MODEL=meta-llama/Llama-2-70b-chat-hf
TOGETHER_API_KEY=...
```

Popular models:
- `meta-llama/Llama-2-70b-chat-hf` - Llama 2 70B
- `mistralai/Mixtral-8x7B-Instruct-v0.1` - Mixtral 8x7B
- `microsoft/DialoGPT-medium` - DialoGPT
- `tiiuae/falcon-7b-instruct` - Falcon 7B

### Self-hosted

**Best for**: Complete control, no API costs, privacy
**Cost**: Infrastructure costs only

```bash
MODEL_PROVIDER=self-hosted
SELF_HOSTED_MODEL_URL=http://localhost:8000/v1/chat/completions
SELF_HOSTED_API_KEY=optional_api_key
```

Setup options:
- **vLLM**: Fast inference server
- **Ollama**: Easy local model running
- **LM Studio**: GUI for local models
- **Custom API**: Your own implementation

## Advanced Configuration

### Model Parameters

All providers support these common parameters:

```bash
# Response length
MAX_TOKENS=4000

# Creativity (0.0 = deterministic, 1.0 = very creative)
TEMPERATURE=0.7

# Model-specific name
MODEL_NAME=gpt-4
```

### Custom Endpoints

For enterprise or proxy setups:

```bash
# OpenAI
OPENAI_BASE_URL=https://your-proxy.com/v1

# Anthropic
ANTHROPIC_BASE_URL=https://your-proxy.com

# OpenRouter
OPENROUTER_BASE_URL=https://your-proxy.com

# Together AI
TOGETHER_BASE_URL=https://your-proxy.com
```

### Provider-Specific Settings

#### OpenRouter
```bash
# Set your app name (required)
HTTP-Referer=https://your-app.com
X-Title=Your App Name
```

#### Self-hosted
```bash
# Authentication (optional)
SELF_HOSTED_API_KEY=your_api_key

# Custom headers (if needed)
SELF_HOSTED_HEADERS={"X-Custom-Header": "value"}
```

## Testing Your Configuration

### Quick Test
```bash
npm run test-models
```

### Custom Test Message
```bash
python3 scripts/test-models.py "What is the capital of France?"
```

### Test Individual Provider
```bash
# Set environment variables
export MODEL_PROVIDER=openai
export OPENAI_API_KEY=your_key

# Run test
python3 scripts/test-models.py
```

## Troubleshooting

### Common Issues

1. **"API key not found"**
   - Check that your API key is set correctly
   - Verify the key is valid and has credits

2. **"Model not found"**
   - Check the model name spelling
   - Verify the model is available for your provider

3. **"Rate limit exceeded"**
   - Wait a few minutes and try again
   - Consider upgrading your API plan

4. **"Connection timeout"**
   - Check your internet connection
   - Verify the API endpoint is correct

### Provider-Specific Issues

#### OpenRouter
- Ensure you have credits in your account
- Check that the model is available (some require approval)

#### Together AI
- Verify your account is approved for the model
- Check model availability status

#### Self-hosted
- Ensure your model server is running
- Check that the API endpoint is accessible
- Verify the API format matches OpenAI's

## Cost Optimization

### Token Usage
- Use `MAX_TOKENS` to limit response length
- Consider using smaller models for simple tasks
- Implement conversation history limits

### Provider Selection
- **OpenAI**: Best for general use, good documentation
- **Anthropic**: Best for safety and detailed responses
- **OpenRouter**: Best for cost and model variety
- **Together AI**: Best for open source models
- **Self-hosted**: Best for privacy and control

### Model Selection
- **GPT-3.5-turbo**: Good balance of cost/performance
- **Claude 3.5 Sonnet**: Best value for detailed responses
- **Llama 2 70B**: Good open source option
- **Mixtral 8x7B**: Excellent performance/cost ratio

## Security Considerations

1. **API Keys**: Never commit API keys to version control
2. **Environment Files**: Use `.env` files and add them to `.gitignore`
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Content Filtering**: Consider implementing content filters
5. **Logging**: Be careful about logging sensitive information

## Next Steps

1. Test your configuration with `npm run test-models`
2. Start the bot with `docker-compose up --build`
3. Add the bot to your Discord server
4. Test different interaction modes (slash commands, chat, voice)

For more help, check the main README or create an issue on GitHub. 