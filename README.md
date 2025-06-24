# Discord AI Bot - Unified Multi-Modal Architecture

A sophisticated Discord bot that operates across multiple interaction modes with advanced AI capabilities, featuring unified conversation context, tool access, and seamless voice/text integration.

## 🚀 Features

- **Multi-Modal Interactions**: Slash commands, text chat, and voice conversations
- **Unified Context**: Shared conversation state across all interaction modes
- **Advanced Voice**: Pipecat-powered voice conversations with interruption handling
- **Extensible Tools**: Time, reminders, weather, web search, and more
- **Production Ready**: Single-container deployment with comprehensive monitoring

## 🏗️ Architecture

```
Discord.js Bot (TypeScript)
├── SlashCommandHandler - Structured bot commands
├── MessageHandler - Natural conversation with tool use
└── VoiceHandler - Sophisticated voice conversations

AI Services:
├── Griptape Service (Python) - Text interactions & tool execution
└── Pipecat Service (Python) - Voice interactions & streaming

Infrastructure:
├── PostgreSQL - Persistent data storage
├── Redis - Caching & session management
└── WebRTC Bridge - Discord ↔ Pipecat audio bridge
```

## 🛠️ Technology Stack

- **Frontend**: Discord.js v14 (TypeScript)
- **Text AI**: Griptape (Python microservice)
- **Voice AI**: Pipecat + Pipecat Flows (Python microservice)
- **Database**: PostgreSQL + Redis
- **Deployment**: Docker (multi-service dev, single-container prod)
- **Process Management**: PM2

## 📋 Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.9+ (for local development)
- Discord Bot Token
- OpenAI API Key (or other LLM provider)
- Speech service API keys (Deepgram, ElevenLabs)

## 🚀 Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo>
cd discord-bot-hacking
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` with your API keys and configuration:

```bash
# Discord
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_client_id

# AI Services
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Speech Services
DEEPGRAM_API_KEY=your_deepgram_key
ELEVENLABS_API_KEY=your_elevenlabs_key

# Database
POSTGRES_URL=postgresql://user:pass@localhost:5432/discord_bot
REDIS_URL=redis://localhost:6379
```

### 3. Local Development (Multi-Service)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### 4. Production Deployment

```bash
# Build production image
docker build -f deployment/Dockerfile.production -t discord-ai-bot .

# Run production container
docker run -d \
  --name discord-ai-bot \
  --env-file .env \
  -p 3000:3000 \
  discord-ai-bot
```

## 🎯 Usage Examples

### Slash Commands
```
/chat - Start a conversation
/remind - Set a reminder
/time - Get current time
/weather - Check weather
```

### Text Chat
```
User: "What's the weather like in San Francisco?"
Bot: "Let me check that for you. Currently in San Francisco, it's 68°F with partly cloudy skies..."

User: "Remind me to call mom tomorrow at 2pm"
Bot: "I've set a reminder for you to call mom tomorrow at 2:00 PM. I'll notify you when it's time!"
```

### Voice Conversations
- Join a voice channel and the bot will automatically join
- Natural conversation with interruption handling
- Tool access through voice commands
- Seamless context sharing with text interactions

## 🔧 Development

### Project Structure

```
discord-ai-bot/
├── bot/                          # Main Discord bot (TypeScript)
│   ├── src/
│   │   ├── index.ts             # Bot entry point
│   │   ├── handlers/            # Interaction handlers
│   │   ├── services/            # AI service connectors
│   │   ├── tools/              # Tool definitions
│   │   └── types/              # TypeScript types
│   └── package.json
├── services/
│   ├── griptape-service/        # Griptape LLM service (Python)
│   └── pipecat-service/         # Pipecat voice service (Python)
├── shared/                      # Shared resources
├── deployment/                  # Deployment configs
└── docker-compose.yml          # Local development
```

### Adding New Tools

1. **Text Tools** (Griptape Service):
   ```python
   # services/griptape-service/src/tools/weather.py
   from griptape.tools import BaseTool
   
   class WeatherTool(BaseTool):
       def execute(self, location: str) -> str:
           # Implementation
           return f"Weather in {location}: 72°F, sunny"
   ```

2. **Voice Tools** (Pipecat Service):
   ```python
   # services/pipecat-service/src/tools.py
   def weather_tool(location: str) -> str:
       # Voice-optimized response
       return f"It's currently 72 degrees and sunny in {location}"
   ```

### Local Development Workflow

```bash
# Start services
docker-compose up -d

# View specific service logs
docker-compose logs -f bot
docker-compose logs -f griptape-service
docker-compose logs -f pipecat-service

# Restart a service
docker-compose restart bot

# Access service directly
docker-compose exec bot npm run dev
```

## 🔍 Monitoring & Debugging

### Health Checks
- Bot: `http://localhost:3000/health`
- Griptape Service: `http://localhost:8000/health`
- Pipecat Service: `http://localhost:8001/health`

### Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f bot

# Production logs
docker logs discord-ai-bot
```

### Database Access
```bash
# PostgreSQL
docker-compose exec postgres psql -U postgres -d discord_bot

# Redis
docker-compose exec redis redis-cli
```

## 🚀 Deployment

### Production Environment Variables

```bash
# Required for production
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=your_production_postgres_url
REDIS_URL=your_production_redis_url
```

### Cloud Deployment

#### Google Cloud Run
```bash
# Build and deploy
gcloud builds submit --tag gcr.io/your-project/discord-ai-bot
gcloud run deploy discord-ai-bot \
  --image gcr.io/your-project/discord-ai-bot \
  --platform managed \
  --allow-unauthenticated
```

#### AWS Fargate
```bash
# Build and push to ECR
aws ecr get-login-password --region us-west-2 | docker login --username AWS --password-stdin your-account.dkr.ecr.us-west-2.amazonaws.com
docker tag discord-ai-bot:latest your-account.dkr.ecr.us-west-2.amazonaws.com/discord-ai-bot:latest
docker push your-account.dkr.ecr.us-west-2.amazonaws.com/discord-ai-bot:latest
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Issues**: Create a GitHub issue
- **Discussions**: Use GitHub Discussions
- **Documentation**: Check the `/docs` folder for detailed guides

## 🎯 Roadmap

- [ ] Advanced voice emotion detection
- [ ] Multi-language support
- [ ] Custom voice models
- [ ] Advanced conversation flows
- [ ] Plugin system for tools
- [ ] Analytics dashboard
- [ ] Multi-server management

## Environment-Based Model Configuration

This bot supports multiple AI model providers through environment variables. You can easily switch between different providers without changing code.

### Supported Providers

1. **OpenAI** - GPT-4, GPT-3.5-turbo, and other OpenAI models
2. **Anthropic** - Claude models (Claude-3.5-Sonnet, Claude-3-Opus, etc.)
3. **OpenRouter** - Access to 100+ models including uncensored options
4. **Together AI** - Open source models (Llama, Mistral, etc.)
5. **Self-hosted** - Your own model endpoints (vLLM, Ollama, etc.)

### Configuration Examples

#### OpenAI (Default)
```bash
MODEL_PROVIDER=openai
MODEL_NAME=gpt-4
OPENAI_API_KEY=your_openai_api_key_here
```

#### Anthropic Claude
```bash
MODEL_PROVIDER=anthropic
MODEL_NAME=claude-3.5-sonnet-20241022
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

#### OpenRouter (for uncensored models)
```bash
MODEL_PROVIDER=openrouter
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

Popular OpenRouter models:
- `anthropic/claude-3.5-sonnet` - Claude 3.5 Sonnet
- `meta-llama/llama-2-70b-chat` - Llama 2 70B
- `google/gemini-pro` - Google Gemini Pro
- `microsoft/wizardlm-2-8x22b` - WizardLM 2
- `nousresearch/nous-hermes-2-mixtral-8x7b-dpo` - Uncensored model

#### Together AI (for open source models)
```bash
MODEL_PROVIDER=together
TOGETHER_MODEL=meta-llama/Llama-2-70b-chat-hf
TOGETHER_API_KEY=your_together_api_key_here
```

Popular Together AI models:
- `meta-llama/Llama-2-70b-chat-hf` - Llama 2 70B
- `mistralai/Mixtral-8x7B-Instruct-v0.1` - Mixtral 8x7B
- `microsoft/DialoGPT-medium` - DialoGPT
- `tiiuae/falcon-7b-instruct` - Falcon 7B

#### Self-hosted Model
```bash
MODEL_PROVIDER=self-hosted
SELF_HOSTED_MODEL_URL=http://localhost:8000/v1/chat/completions
SELF_HOSTED_API_KEY=your_api_key_here  # Optional
```

### Common Configuration Options

All providers support these common settings:

```bash
# Model settings
MODEL_NAME=gpt-4                    # Model name (provider-specific)
MAX_TOKENS=4000                     # Maximum tokens per response
TEMPERATURE=0.7                     # Response creativity (0.0-1.0)

# Optional custom endpoints (for enterprise/proxy setups)
OPENAI_BASE_URL=https://api.openai.com
ANTHROPIC_BASE_URL=https://api.anthropic.com
OPENROUTER_BASE_URL=https://openrouter.ai
TOGETHER_BASE_URL=https://api.together.xyz
```

### Switching Providers

To switch between providers, simply change the `MODEL_PROVIDER` environment variable and set the corresponding API key:

```bash
# Switch to OpenRouter
export MODEL_PROVIDER=openrouter
export OPENROUTER_API_KEY=your_key_here

# Switch to Together AI
export MODEL_PROVIDER=together
export TOGETHER_API_KEY=your_key_here

# Switch back to OpenAI
export MODEL_PROVIDER=openai
export OPENAI_API_KEY=your_key_here
```

### Provider-Specific Features

#### OpenRouter
- Access to 100+ models from various providers
- Many uncensored models available
- Pay-per-token pricing
- No content filtering on many models

#### Together AI
- Focus on open source models
- Competitive pricing for large models
- Good for fine-tuned models
- Supports many community models

#### Self-hosted
- Complete control over your model
- No API costs
- Can use any model format
- Requires infrastructure management

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd discord-bot-hacking
   ```

2. **Set up environment variables**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Choose your model provider** (see examples above)

4. **Start the services**
   ```bash
   docker-compose up --build
   ```

5. **Add bot to Discord server** and test!

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Discord Bot   │    │  Griptape AI    │    │  Pipecat Voice  │
│  (TypeScript)   │◄──►│   Service       │    │   Service       │
│                 │    │   (Python)      │    │   (Python)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis       │    │   Voice APIs    │
│   (Database)    │    │    (Cache)      │    │ (Deepgram, etc) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Services

### Discord Bot (TypeScript/Node.js)
- Handles Discord interactions
- Manages conversation context
- Routes requests to AI services
- Supports slash commands, text chat, and voice

### Griptape AI Service (Python)
- Processes text-based interactions
- Supports multiple AI model providers
- Manages conversation memory
- Provides tool execution capabilities

### Pipecat Voice Service (Python)
- Handles voice interactions
- Real-time speech-to-text and text-to-speech
- Integrates with various voice APIs
- Manages voice sessions

## Development

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.9+ (for local development)

### Local Development
```bash
# Start all services
docker-compose up --build

# Or start individual services
docker-compose up griptape-service
docker-compose up pipecat-service
docker-compose up bot
```

### Testing
```bash
# Test the bot locally
npm run dev

# Test AI service
curl -X POST http://localhost:8000/process \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!", "context": {...}}'
```

## Configuration

See `env.example` for all available environment variables. Key configuration areas:

- **Discord**: Bot token, client ID, guild settings
- **AI Models**: Provider selection, API keys, model parameters
- **Database**: PostgreSQL and Redis connection settings
- **Voice**: Speech recognition and synthesis APIs
- **Logging**: Log levels and output formats

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the documentation
2. Search existing issues
3. Create a new issue with details

## Roadmap

- [ ] Streaming responses for all providers
- [ ] Advanced tool integration
- [ ] Voice model fine-tuning
- [ ] Multi-modal support (images, files)
- [ ] Advanced conversation management
- [ ] Plugin system for custom tools 