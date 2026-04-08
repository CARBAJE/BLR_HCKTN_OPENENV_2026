"""
models.py — Pydantic models for the ReactOS environment.

Defines Action, Observation used by the FastAPI endpoints.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ── Action ────────────────────────────────────────────────────────────────────

class ReactOSAction(BaseModel):
    action: str = Field(default="CLICK", description="CLICK or DOUBLE_CLICK")
    node_idx: int = Field(default=0, description="0-based index of DOM element to interact with")
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ── Observation ───────────────────────────────────────────────────────────────

class DOMElement(BaseModel):
    text: str = ""
    type: str = "element"
    x: float = 0.0
    y: float = 0.0


class ReactOSObservation(BaseModel):
    dom: List[DOMElement] = Field(default_factory=list, description="List of interactive DOM elements")
    instruction: str = Field(default="", description="Current task instruction")
    done: bool = Field(default=False)
    reward: Optional[float] = Field(default=None)
    info: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


# ── State ─────────────────────────────────────────────────────────────────────

class ReactOSState(BaseModel):
    episode_id: Optional[str] = None
    step_count: int = 0
    task_name: str = ""
    instruction: str = ""
    done: bool = False
    os_version: int = 0
