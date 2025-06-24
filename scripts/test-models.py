#!/usr/bin/env python3
"""
Test script for different AI model providers.
This script helps you test and compare different model providers.
"""

import os
import sys
import asyncio
import aiohttp
import json
from typing import Dict, Any
from datetime import datetime

# Add the griptape service to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'services', 'griptape-service', 'src'))

from agent import create_agent_from_env

class ModelTester:
    def __init__(self):
        self.results = []
    
    async def test_provider(self, provider_name: str, env_vars: Dict[str, str], test_message: str = "Hello! How are you today?") -> Dict[str, Any]:
        """Test a specific model provider"""
        print(f"\n🧪 Testing {provider_name}...")
        
        # Set environment variables
        for key, value in env_vars.items():
            os.environ[key] = value
        
        try:
            # Create agent
            agent = create_agent_from_env()
            
            # Test context
            context = {
                "history": [
                    {
                        "role": "system",
                        "content": "You are a helpful AI assistant."
                    }
                ]
            }
            
            # Time the request
            start_time = datetime.now()
            
            async with agent as a:
                response = await a.process_message(test_message, context)
            
            end_time = datetime.now()
            latency = (end_time - start_time).total_seconds() * 1000
            
            result = {
                "provider": provider_name,
                "model": response.get("model", "unknown"),
                "content": response.get("content", ""),
                "tokens": response.get("tokens", 0),
                "latency_ms": latency,
                "success": True,
                "error": None
            }
            
            print(f"✅ {provider_name} - {result['model']}")
            print(f"   Response: {result['content'][:100]}...")
            print(f"   Tokens: {result['tokens']}")
            print(f"   Latency: {latency:.2f}ms")
            
            return result
            
        except Exception as e:
            error_msg = str(e)
            print(f"❌ {provider_name} failed: {error_msg}")
            
            result = {
                "provider": provider_name,
                "model": "unknown",
                "content": "",
                "tokens": 0,
                "latency_ms": 0,
                "success": False,
                "error": error_msg
            }
            
            return result
    
    async def test_all_providers(self, test_message: str = "Hello! How are you today?"):
        """Test all configured providers"""
        print("🤖 AI Model Provider Test Suite")
        print("=" * 50)
        
        # Define test configurations
        test_configs = [
            {
                "name": "OpenAI",
                "env_vars": {
                    "MODEL_PROVIDER": "openai",
                    "MODEL_NAME": "gpt-4",
                    "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY", "")
                }
            },
            {
                "name": "Anthropic",
                "env_vars": {
                    "MODEL_PROVIDER": "anthropic",
                    "MODEL_NAME": "claude-3.5-sonnet-20241022",
                    "ANTHROPIC_API_KEY": os.getenv("ANTHROPIC_API_KEY", "")
                }
            },
            {
                "name": "OpenRouter",
                "env_vars": {
                    "MODEL_PROVIDER": "openrouter",
                    "OPENROUTER_MODEL": "anthropic/claude-3.5-sonnet",
                    "OPENROUTER_API_KEY": os.getenv("OPENROUTER_API_KEY", "")
                }
            },
            {
                "name": "Together AI",
                "env_vars": {
                    "MODEL_PROVIDER": "together",
                    "TOGETHER_MODEL": "meta-llama/Llama-2-70b-chat-hf",
                    "TOGETHER_API_KEY": os.getenv("TOGETHER_API_KEY", "")
                }
            },
            {
                "name": "Self-hosted",
                "env_vars": {
                    "MODEL_PROVIDER": "self-hosted",
                    "SELF_HOSTED_MODEL_URL": os.getenv("SELF_HOSTED_MODEL_URL", ""),
                    "SELF_HOSTED_API_KEY": os.getenv("SELF_HOSTED_API_KEY", "")
                }
            }
        ]
        
        # Test each provider
        for config in test_configs:
            # Skip if no API key is provided
            if not any(config["env_vars"].values()):
                print(f"⏭️  Skipping {config['name']} - no API key configured")
                continue
            
            result = await self.test_provider(config["name"], config["env_vars"], test_message)
            self.results.append(result)
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print a summary of all test results"""
        print("\n" + "=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        
        successful_tests = [r for r in self.results if r["success"]]
        failed_tests = [r for r in self.results if not r["success"]]
        
        print(f"✅ Successful: {len(successful_tests)}")
        print(f"❌ Failed: {len(failed_tests)}")
        
        if successful_tests:
            print("\n🏆 Performance Comparison:")
            print(f"{'Provider':<15} {'Model':<25} {'Tokens':<8} {'Latency':<10}")
            print("-" * 60)
            
            for result in successful_tests:
                print(f"{result['provider']:<15} {result['model']:<25} {result['tokens']:<8} {result['latency_ms']:<10.2f}ms")
        
        if failed_tests:
            print("\n❌ Failed Tests:")
            for result in failed_tests:
                print(f"  {result['provider']}: {result['error']}")

async def main():
    """Main function"""
    tester = ModelTester()
    
    # Get test message from command line or use default
    test_message = sys.argv[1] if len(sys.argv) > 1 else "Hello! How are you today?"
    
    await tester.test_all_providers(test_message)

if __name__ == "__main__":
    # Check if .env file exists and load it
    env_file = os.path.join(os.path.dirname(__file__), '..', '.env')
    if os.path.exists(env_file):
        print(f"📁 Loading environment from {env_file}")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value
    
    asyncio.run(main()) 