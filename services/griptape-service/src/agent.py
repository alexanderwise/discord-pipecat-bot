import structlog
import asyncio
from typing import Dict, Any, AsyncGenerator, Optional
import time
import os
import aiohttp
import json
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class ModelProvider(Enum):
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OPENROUTER = "openrouter"
    TOGETHER = "together"
    SELF_HOSTED = "self-hosted"

@dataclass
class ModelConfig:
    provider: ModelProvider
    model_name: str
    api_key: str
    base_url: Optional[str] = None
    max_tokens: int = 4000
    temperature: float = 0.7

class GriptapeAgent:
    def __init__(self):
        self.initialized = False
        self.start_time = None
        
    async def initialize(self):
        """Initialize the agent"""
        logger.info("Initializing Griptape Agent")
        self.initialized = True
        self.start_time = time.time()
        
    async def cleanup(self):
        """Cleanup the agent"""
        logger.info("Cleaning up Griptape Agent")
        self.initialized = False
        
    async def process_message(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process a message with the agent"""
        logger.info("Processing message", message=message[:100])
        
        # Placeholder response
        return {
            "content": f"I received your message: {message}. This is a placeholder response from the Griptape agent.",
            "tools": [],
            "metadata": {
                "model": "gpt-4",
                "tokens": len(message.split()),
                "latency": 100
            }
        }
        
    async def process_message_stream(self, message: str, context: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """Process a message with streaming response"""
        logger.info("Processing message stream", message=message[:100])
        
        response = f"I received your message: {message}. This is a placeholder streaming response."
        for word in response.split():
            yield word + " "
            await asyncio.sleep(0.1)
            
    async def get_status(self) -> Dict[str, Any]:
        """Get agent status"""
        return {
            "status": "healthy" if self.initialized else "unhealthy",
            "uptime": time.time() - self.start_time if self.start_time else 0,
            "last_check": time.time(),
            "errors": [],
            "metrics": {
                "requestsPerMinute": 0,
                "averageLatency": 100,
                "errorRate": 0
            }
        }
        
    async def update_settings(self, settings: Dict[str, Any]):
        """Update agent settings"""
        logger.info("Updating agent settings", settings=settings)

class BaseModelAgent:
    """Base class for all model agents"""
    
    def __init__(self, config: ModelConfig):
        self.config = config
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def process_message(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process a message and return AI response"""
        raise NotImplementedError

class OpenAIAgent(BaseModelAgent):
    """Agent using OpenAI API"""
    
    async def process_message(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.config.base_url or 'https://api.openai.com'}/v1/chat/completions"
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json"
        }
        
        # Build conversation history from context
        messages = []
        if context.get("history"):
            for msg in context["history"][-10:]:  # Last 10 messages
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        messages.append({"role": "user", "content": message})
        
        data = {
            "model": self.config.model_name,
            "messages": messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature
        }
        
        async with self.session.post(url, headers=headers, json=data) as response:
            result = await response.json()
            
            if response.status != 200:
                logger.error(f"OpenAI API error: {result}")
                raise Exception(f"OpenAI API error: {result.get('error', {}).get('message', 'Unknown error')}")
            
            return {
                "content": result["choices"][0]["message"]["content"],
                "model": self.config.model_name,
                "tokens": result["usage"]["total_tokens"],
                "latency": 0  # Could calculate this
            }

class AnthropicAgent(BaseModelAgent):
    """Agent using Anthropic API"""
    
    async def process_message(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.config.base_url or 'https://api.anthropic.com'}/v1/messages"
        
        headers = {
            "x-api-key": self.config.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01"
        }
        
        # Build conversation history
        messages = []
        if context.get("history"):
            for msg in context["history"][-10:]:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        messages.append({"role": "user", "content": message})
        
        data = {
            "model": self.config.model_name,
            "messages": messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature
        }
        
        async with self.session.post(url, headers=headers, json=data) as response:
            result = await response.json()
            
            if response.status != 200:
                logger.error(f"Anthropic API error: {result}")
                raise Exception(f"Anthropic API error: {result.get('error', {}).get('message', 'Unknown error')}")
            
            return {
                "content": result["content"][0]["text"],
                "model": self.config.model_name,
                "tokens": result["usage"]["input_tokens"] + result["usage"]["output_tokens"],
                "latency": 0
            }

class OpenRouterAgent(BaseModelAgent):
    """Agent using OpenRouter API for access to various models"""
    
    async def process_message(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.config.base_url or 'https://openrouter.ai'}/api/v1/chat/completions"
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://discord-bot-hacking",  # Required by OpenRouter
            "X-Title": "Discord AI Bot"  # Optional but recommended
        }
        
        # Build conversation history
        messages = []
        if context.get("history"):
            for msg in context["history"][-10:]:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        messages.append({"role": "user", "content": message})
        
        data = {
            "model": self.config.model_name,
            "messages": messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature
        }
        
        async with self.session.post(url, headers=headers, json=data) as response:
            result = await response.json()
            
            if response.status != 200:
                logger.error(f"OpenRouter API error: {result}")
                raise Exception(f"OpenRouter API error: {result.get('error', {}).get('message', 'Unknown error')}")
            
            return {
                "content": result["choices"][0]["message"]["content"],
                "model": self.config.model_name,
                "tokens": result["usage"]["total_tokens"],
                "latency": 0
            }

class TogetherAIAgent(BaseModelAgent):
    """Agent using Together AI API for access to various models"""
    
    async def process_message(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        url = f"{self.config.base_url or 'https://api.together.xyz'}/v1/chat/completions"
        
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json"
        }
        
        # Build conversation history
        messages = []
        if context.get("history"):
            for msg in context["history"][-10:]:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        messages.append({"role": "user", "content": message})
        
        data = {
            "model": self.config.model_name,
            "messages": messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature
        }
        
        async with self.session.post(url, headers=headers, json=data) as response:
            result = await response.json()
            
            if response.status != 200:
                logger.error(f"Together AI API error: {result}")
                raise Exception(f"Together AI API error: {result.get('error', {}).get('message', 'Unknown error')}")
            
            return {
                "content": result["choices"][0]["message"]["content"],
                "model": self.config.model_name,
                "tokens": result["usage"]["total_tokens"],
                "latency": 0
            }

class SelfHostedAgent(BaseModelAgent):
    """Agent using your own hosted model"""
    
    async def process_message(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        if not self.config.base_url:
            raise ValueError("Self-hosted model requires base_url configuration")
        
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        
        # Build conversation history
        messages = []
        if context.get("history"):
            for msg in context["history"][-10:]:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        messages.append({"role": "user", "content": message})
        
        data = {
            "model": self.config.model_name,
            "messages": messages,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature
        }
        
        async with self.session.post(self.config.base_url, headers=headers, json=data) as response:
            result = await response.json()
            
            if response.status != 200:
                logger.error(f"Self-hosted model error: {result}")
                raise Exception(f"Self-hosted model error: {result.get('error', {}).get('message', 'Unknown error')}")
            
            return {
                "content": result["choices"][0]["message"]["content"],
                "model": self.config.model_name,
                "tokens": result.get("usage", {}).get("total_tokens", 0),
                "latency": 0
            }

def create_agent_from_env() -> BaseModelAgent:
    """Create agent based on environment variables"""
    provider_str = os.getenv("MODEL_PROVIDER", "openai").lower()
    
    try:
        provider = ModelProvider(provider_str)
    except ValueError:
        raise ValueError(f"Unsupported model provider: {provider_str}")
    
    # Get common configuration
    model_name = os.getenv("MODEL_NAME", "gpt-4")
    max_tokens = int(os.getenv("MAX_TOKENS", "4000"))
    temperature = float(os.getenv("TEMPERATURE", "0.7"))
    
    if provider == ModelProvider.OPENAI:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")
        
        return OpenAIAgent(ModelConfig(
            provider=provider,
            model_name=model_name,
            api_key=api_key,
            max_tokens=max_tokens,
            temperature=temperature
        ))
    
    elif provider == ModelProvider.ANTHROPIC:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is required")
        
        return AnthropicAgent(ModelConfig(
            provider=provider,
            model_name=model_name,
            api_key=api_key,
            max_tokens=max_tokens,
            temperature=temperature
        ))
    
    elif provider == ModelProvider.OPENROUTER:
        api_key = os.getenv("OPENROUTER_API_KEY")
        model_name = os.getenv("OPENROUTER_MODEL", model_name)
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY environment variable is required")
        
        return OpenRouterAgent(ModelConfig(
            provider=provider,
            model_name=model_name,
            api_key=api_key,
            max_tokens=max_tokens,
            temperature=temperature
        ))
    
    elif provider == ModelProvider.TOGETHER:
        api_key = os.getenv("TOGETHER_API_KEY")
        model_name = os.getenv("TOGETHER_MODEL", model_name)
        if not api_key:
            raise ValueError("TOGETHER_API_KEY environment variable is required")
        
        return TogetherAIAgent(ModelConfig(
            provider=provider,
            model_name=model_name,
            api_key=api_key,
            max_tokens=max_tokens,
            temperature=temperature
        ))
    
    elif provider == ModelProvider.SELF_HOSTED:
        model_url = os.getenv("SELF_HOSTED_MODEL_URL")
        api_key = os.getenv("SELF_HOSTED_API_KEY")
        if not model_url:
            raise ValueError("SELF_HOSTED_MODEL_URL environment variable is required")
        
        return SelfHostedAgent(ModelConfig(
            provider=provider,
            model_name=model_name,
            api_key=api_key or "",
            base_url=model_url,
            max_tokens=max_tokens,
            temperature=temperature
        ))
    
    else:
        raise ValueError(f"Unsupported provider: {provider}")

# Main agent class that uses the environment-based configuration
class Agent:
    """Main agent class that delegates to the appropriate model agent"""
    
    def __init__(self):
        self.agent = create_agent_from_env()
        logger.info(f"Initialized agent with provider: {self.agent.config.provider.value}")
    
    async def process_message(self, message: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Process a message using the configured model agent"""
        async with self.agent as agent:
            return await agent.process_message(message, context)

# ... existing code ... 