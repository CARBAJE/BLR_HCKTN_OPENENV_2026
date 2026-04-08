"""
app.py — FastAPI application for the ReactOS environment.

OpenEnv spec v1 compliant endpoints:
  POST /reset  → ReactOSObservation   (initial observation)
  POST /step   → {observation, reward, done, info}
  GET  /state  → ReactOSState
  GET  /health → {"status": "healthy"}
  GET  /schema → JSON schemas for Action / Observation / Reward / State
  GET  /tasks  → task catalog
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import FastAPI, Body
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

_env = ReactOSEnvironment()


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}


# ── Core OpenEnv endpoints ─────────────────────────────────────────────────────

@app.post("/reset", response_model=ReactOSObservation)
def reset(body: Optional[Dict[str, Any]] = Body(default=None)) -> ReactOSObservation:
    """Reset the environment and return the initial observation.

    Optional body:
      - instruction (str): natural-language task instruction
      - task_name   (str): known task ID
      - seed        (int): RNG seed
    """
    body = body or {}
    obs = _env.reset(
        task_name=body.get("task_name"),
        instruction=body.get("instruction"),
        seed=body.get("seed"),
    )
    return obs


@app.post("/step")
def step(action: ReactOSAction) -> dict:
    """Execute one action and return (observation, reward, done, info).

    Body: ReactOSAction JSON
      - action   (str): CLICK | DOUBLE_CLICK
      - node_idx (int): 0-based index in current DOM
      - x        (float): normalized x coordinate
      - y        (float): normalized y coordinate
    """
    obs = _env.step(action)
    return {
        "observation": obs.model_dump(),
        "reward":      obs.reward or 0.0,
        "done":        obs.done,
        "info":        obs.info,
    }


@app.get("/state", response_model=ReactOSState)
def get_state() -> ReactOSState:
    """Return the current episode metadata state."""
    return _env.state


# ── Introspection ──────────────────────────────────────────────────────────────

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


# ── Entrypoint ─────────────────────────────────────────────────────────────────

def main() -> None:
    """Server entrypoint — callable by [project.scripts] and openenv validate."""
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    main()
