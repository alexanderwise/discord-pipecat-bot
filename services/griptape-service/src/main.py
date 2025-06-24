from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import structlog
import os
from typing import Dict, Any, List
import json
import time

from .agent import Agent
from .memory import MemoryManager
from .tools import ToolManager
from .models import (
    ProcessRequest,
    ProcessResponse,
    ToolExecuteRequest,
    ToolExecuteResponse,
    HealthResponse,
    ServiceStatus
)

# Configure logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Initialize FastAPI app
app = FastAPI(
    title="Griptape AI Service",
    description="AI service for Discord bot using Griptape framework",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
agent = Agent()
memory_manager = MemoryManager()
tool_manager = ToolManager()

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Starting Griptape AI Service")
    await memory_manager.initialize()
    await tool_manager.initialize()
    logger.info("Griptape AI Service started successfully")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Griptape AI Service")
    await memory_manager.cleanup()
    await tool_manager.cleanup()

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    try:
        return HealthResponse(
            status="healthy",
            uptime=time.time(),
            last_check=time.time(),
            errors=[],
            metrics={
                "requestsPerMinute": 0,
                "averageLatency": 0,
                "errorRate": 0
            }
        )
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        return HealthResponse(
            status="unhealthy",
            uptime=0,
            last_check=time.time(),
            errors=[str(e)],
            metrics={
                "requestsPerMinute": 0,
                "averageLatency": 0,
                "errorRate": 100
            }
        )

@app.post("/process", response_model=ProcessResponse)
async def process_message(request: ProcessRequest):
    """Process a message with the AI agent"""
    try:
        start_time = time.time()
        
        # Get or create conversation context
        context = await memory_manager.get_context(
            request.context.userId,
            request.context.channelId
        )
        
        # Update context with new message
        context.history.append({
            "role": "user",
            "content": request.message,
            "timestamp": time.time(),
            "metadata": {"interactionType": request.context.interactionType}
        })
        
        # Process with agent
        response = await agent.process_message(request.message, context.dict())
        
        # Update context with response
        context.history.append({
            "role": "assistant",
            "content": response["content"],
            "timestamp": time.time(),
            "metadata": {
                "tools": response.get("tools", []),
                "interactionType": request.context.interactionType
            }
        })
        
        # Save updated context
        await memory_manager.save_context(context)
        
        latency = (time.time() - start_time) * 1000
        
        return ProcessResponse(
            content=response["content"],
            tools=response.get("tools", []),
            context=context,
            metadata={
                "model": response.get("model", "unknown"),
                "tokens": response.get("tokens", 0),
                "latency": latency
            }
        )
        
    except Exception as e:
        logger.error("Error processing message", error=str(e), message=request.message)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/stream")
async def process_message_stream(request: ProcessRequest):
    """Process a message with streaming response"""
    try:
        async def generate():
            # For now, return a simple streaming response
            # In a real implementation, you'd want to implement streaming for each provider
            response = await agent.process_message(request.message, request.context.dict())
            yield f"data: {json.dumps({'content': response['content']})}\n\n"
            yield "data: [DONE]\n\n"
        
        return StreamingResponse(
            generate(),
            media_type="text/plain",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
        )
        
    except Exception as e:
        logger.error("Error processing message stream", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process/batch", response_model=List[ProcessResponse])
async def process_batch(request: List[ProcessRequest]):
    """Process multiple messages in batch"""
    try:
        responses = []
        for req in request:
            response = await process_message(req)
            responses.append(response)
        return responses
        
    except Exception as e:
        logger.error("Error processing batch", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tools/execute", response_model=ToolExecuteResponse)
async def execute_tool(request: ToolExecuteRequest):
    """Execute a specific tool"""
    try:
        result = await tool_manager.execute_tool(request.tool, request.parameters)
        return ToolExecuteResponse(
            name=result.name,
            input=result.input,
            output=result.output,
            success=result.success,
            error=result.error
        )
        
    except Exception as e:
        logger.error("Error executing tool", error=str(e), tool=request.tool)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/tools", response_model=List[Dict[str, Any]])
async def get_available_tools():
    """Get list of available tools"""
    try:
        return tool_manager.get_available_tools()
    except Exception as e:
        logger.error("Error getting tools", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/context/{user_id}/{channel_id}")
async def get_context(user_id: str, channel_id: str):
    """Get conversation context for a user and channel"""
    try:
        context = await memory_manager.get_context(user_id, channel_id)
        return context
    except Exception as e:
        logger.error("Error getting context", error=str(e))
        raise HTTPException(status_code=404, detail="Context not found")

@app.put("/context/{user_id}/{channel_id}")
async def update_context(user_id: str, channel_id: str, context: Dict[str, Any]):
    """Update conversation context"""
    try:
        await memory_manager.save_context(context)
        return {"status": "updated"}
    except Exception as e:
        logger.error("Error updating context", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/context/{user_id}/{channel_id}")
async def delete_context(user_id: str, channel_id: str):
    """Delete conversation context"""
    try:
        await memory_manager.delete_context(user_id, channel_id)
        return {"status": "deleted"}
    except Exception as e:
        logger.error("Error deleting context", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/memory")
async def save_to_memory(data: Dict[str, Any]):
    """Save data to memory"""
    try:
        await memory_manager.save(data["key"], data["value"])
        return {"status": "saved"}
    except Exception as e:
        logger.error("Error saving to memory", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/memory/{key}")
async def get_from_memory(key: str):
    """Get data from memory"""
    try:
        value = await memory_manager.get(key)
        if value is None:
            raise HTTPException(status_code=404, detail="Key not found")
        return {"key": key, "value": value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error getting from memory", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/memory/{key}")
async def delete_from_memory(key: str):
    """Delete data from memory"""
    try:
        await memory_manager.delete(key)
        return {"status": "deleted"}
    except Exception as e:
        logger.error("Error deleting from memory", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/settings")
async def update_settings(settings: Dict[str, Any]):
    """Update agent settings"""
    try:
        await agent.update_settings(settings)
        return {"status": "updated"}
    except Exception as e:
        logger.error("Error updating settings", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 