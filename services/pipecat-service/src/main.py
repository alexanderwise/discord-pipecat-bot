from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import structlog
import time
from typing import Dict, Any

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
    title="Pipecat Voice Service",
    description="Voice service for Discord bot using Pipecat framework",
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

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("Starting Pipecat Voice Service")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down Pipecat Voice Service")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "uptime": time.time(),
        "last_check": time.time(),
        "errors": [],
        "metrics": {
            "requestsPerMinute": 0,
            "averageLatency": 0,
            "errorRate": 0
        }
    }

@app.post("/sessions/start")
async def start_session(data: Dict[str, Any]):
    """Start a voice session"""
    logger.info("Starting voice session", data=data)
    return {"sessionId": f"session_{int(time.time())}"}

@app.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str):
    """Stop a voice session"""
    logger.info("Stopping voice session", session_id=session_id)
    return {"status": "stopped"}

@app.post("/audio/process")
async def process_audio(data: Dict[str, Any]):
    """Process audio data"""
    logger.info("Processing audio", audio_length=len(data.get("audio", "")))
    return {
        "content": "This is a placeholder voice response.",
        "tools": [],
        "metadata": {
            "model": "whisper-1",
            "tokens": 10,
            "latency": 100
        }
    }

@app.get("/sessions")
async def get_sessions():
    """Get active sessions"""
    return []

@app.get("/sessions/{session_id}")
async def get_session_info(session_id: str):
    """Get session information"""
    return {
        "sessionId": session_id,
        "status": "active",
        "startTime": time.time()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 