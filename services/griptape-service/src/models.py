from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import time

class ConversationContext(BaseModel):
    userId: str
    guildId: Optional[str] = None
    channelId: str
    interactionType: str
    history: List[Dict[str, Any]] = []
    tools: List[str] = []
    preferences: Dict[str, Any] = {}
    timestamp: float = time.time()

class ProcessRequest(BaseModel):
    message: str
    context: ConversationContext

class ProcessResponse(BaseModel):
    content: str
    tools: List[Dict[str, Any]] = []
    context: Optional[ConversationContext] = None
    metadata: Dict[str, Any] = {}

class ToolExecuteRequest(BaseModel):
    tool: str
    parameters: Dict[str, Any]

class ToolExecuteResponse(BaseModel):
    name: str
    input: Dict[str, Any]
    output: Any
    success: bool
    error: Optional[str] = None

class ServiceStatus(BaseModel):
    status: str
    uptime: float
    last_check: float
    errors: List[str] = []
    metrics: Dict[str, Any] = {}

class HealthResponse(BaseModel):
    status: str
    uptime: float
    last_check: float
    errors: List[str] = []
    metrics: Dict[str, Any] = {} 