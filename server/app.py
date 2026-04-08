"""
app.py — FastAPI application for the ReactOS environment.

Exposes the OpenEnv-compatible endpoints: /reset, /step, /state, /health, /schema, /tasks.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.environment import ReactOSEnvironment
from server.models import ReactOSAction, ReactOSObservation, ReactOSState

app = FastAPI(title="ReactOS Environment", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Single environment instance (supports one session at a time)
_env = ReactOSEnvironment()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}


@app.post("/reset")
def reset(body: Optional[Dict[str, Any]] = None) -> dict:
    body = body or {}
    obs = _env.reset(
        task_name=body.get("task_name"),
        instruction=body.get("instruction"),
        seed=body.get("seed"),
    )
    return {
        "observation": obs.model_dump(),
        "reward": 0.0,
        "done": False,
    }


@app.post("/step")
def step(body: Dict[str, Any]) -> dict:
    action = ReactOSAction(
        action=body.get("action", "CLICK"),
        node_idx=body.get("node_idx", 0),
    )
    obs = _env.step(action)
    return {
        "observation": obs.model_dump(),
        "reward": obs.reward or 0.0,
        "done": obs.done,
        "info": obs.info,
    }


@app.get("/state")
def get_state() -> dict:
    s = _env.state
    return s.model_dump()


@app.get("/schema")
def schema() -> dict:
    return {
        "action": ReactOSAction.model_json_schema(),
        "observation": ReactOSObservation.model_json_schema(),
        "state": ReactOSState.model_json_schema(),
    }


@app.get("/tasks")
def tasks() -> dict:
    return _env.get_tasks()


@app.post("/score")
def score(body: Dict[str, Any]) -> dict:
    rewards = body.get("rewards", [])
    s = _env.get_score(rewards)
    return {"score": s}
