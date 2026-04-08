"""
app.py — FastAPI application for the ReactOS environment.

Exposes the OpenEnv-compatible endpoints: /reset, /step, /state,
/health, /schema, /tasks. Complies with OpenEnv spec v1.0:
  - reset()  → ReactOSObservation (initial observation)
  - step()   → {observation, reward, done, info}
  - state()  → ReactOSState
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.environment import ReactOSEnvironment
from server.models import ReactOSAction, ReactOSObservation, ReactOSState, Reward

app = FastAPI(title="ReactOS Environment", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Single environment instance (one episode at a time)
_env = ReactOSEnvironment()


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}


# ── Core OpenEnv endpoints ─────────────────────────────────────────────────────

@app.post("/reset", response_model=ReactOSObservation)
def reset(body: Optional[Dict[str, Any]] = None) -> ReactOSObservation:
    """Reset the environment and return the initial observation.

    Accepts optional body fields:
      - instruction (str): natural-language task instruction
      - task_name (str): known task ID from the task catalog
      - seed (int): RNG seed for reproducibility
    """
    body = body or {}
    obs = _env.reset(
        task_name=body.get("task_name"),
        instruction=body.get("instruction"),
        seed=body.get("seed"),
    )
    return obs


@app.post("/step")
def step(body: Dict[str, Any]) -> dict:
    """Execute one action and return (observation, reward, done, info).

    Body fields:
      - action (str): CLICK or DOUBLE_CLICK
      - node_idx (int): 0-based index in current DOM
      - x (float): normalized x coordinate (informational)
      - y (float): normalized y coordinate (informational)
    """
    action = ReactOSAction(
        action=body.get("action", "CLICK"),
        node_idx=body.get("node_idx", 0),
        x=body.get("x", 0.0),
        y=body.get("y", 0.0),
    )
    obs = _env.step(action)
    reward_val = obs.reward or 0.0
    return {
        "observation": obs.model_dump(),
        "reward": reward_val,
        "done": obs.done,
        "info": obs.info,
    }


@app.get("/state", response_model=ReactOSState)
def get_state() -> ReactOSState:
    """Return the current episode state."""
    return _env.state


# ── Introspection endpoints ────────────────────────────────────────────────────

@app.get("/schema")
def schema() -> dict:
    """Return JSON schemas for all typed models."""
    return {
        "action":      ReactOSAction.model_json_schema(),
        "observation": ReactOSObservation.model_json_schema(),
        "reward":      Reward.model_json_schema(),
        "state":       ReactOSState.model_json_schema(),
    }


@app.get("/tasks")
def tasks() -> dict:
    """Return the full task catalog with difficulty and max_steps."""
    return _env.get_tasks()


@app.post("/score")
def score(body: Dict[str, Any]) -> dict:
    """Grade an episode given its reward history."""
    rewards = body.get("rewards", [])
    s = _env.get_score(rewards)
    return {"score": s}
