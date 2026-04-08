"""
server.py — FastAPI OpenEnv-spec server for the React/Vite OS simulation.
Exposes the OpenEnv API on port 8000; calls the Vite server on port 5173.
"""

from __future__ import annotations

import os
import time
import logging
from contextlib import asynccontextmanager
from typing import Any, Optional

import httpx
import yaml
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
log = logging.getLogger("openenv")

VITE_BASE = os.getenv("VITE_BASE_URL", "http://localhost:5173")
API_BASE_URL = os.getenv("API_BASE_URL", VITE_BASE)
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-4o")
HF_TOKEN = os.getenv("HF_TOKEN", "")

# ---------------------------------------------------------------------------
# Load environment descriptor
# ---------------------------------------------------------------------------

_yaml_path = os.path.join(os.path.dirname(__file__), "openenv.yaml")
with open(_yaml_path, "r") as _f:
    ENV_SPEC: dict = yaml.safe_load(_f)

TASKS: list[dict] = ENV_SPEC.get("tasks", [])
MAX_STEPS: int = ENV_SPEC.get("max_steps", 100)

# ---------------------------------------------------------------------------
# In-memory session state (single-agent)
# ---------------------------------------------------------------------------

session: dict[str, Any] = {
    "instance_id": None,
    "task_id": None,
    "step_count": 0,
    "done": False,
}

# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

http: Optional[httpx.AsyncClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http
    http = httpx.AsyncClient(base_url=API_BASE_URL, timeout=30.0)
    log.info("HTTP client initialised → %s", API_BASE_URL)
    yield
    await http.aclose()
    log.info("HTTP client closed.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="OpenEnv — React OS",
    description=ENV_SPEC.get("description", ""),
    version=ENV_SPEC.get("version", "1.0.0"),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _find_task(task_id: str) -> dict:
    for t in TASKS:
        if t["id"] == task_id:
            return t
    raise HTTPException(
        status_code=400,
        detail=f"Unknown task_id '{task_id}'. Valid: {[t['id'] for t in TASKS]}",
    )


async def _vite(method: str, path: str, **kwargs) -> dict:
    """Proxy a call to the Vite server and return the JSON body."""
    try:
        resp = await http.request(method, path, **kwargs)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        log.error("Vite %s %s → %s", method, path, exc.response.status_code)
        raise HTTPException(status_code=502, detail=f"Vite error: {exc.response.text}")
    except httpx.RequestError as exc:
        log.error("Vite unreachable: %s", exc)
        raise HTTPException(status_code=503, detail="Vite server unreachable.")


async def _get_state(instance_id: str) -> dict:
    return await _vite("GET", f"/api/getState/{instance_id}")


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class ResetRequest(BaseModel):
    task_id: str = "easy"


class ActionPayload(BaseModel):
    type: str
    payload: dict[str, Any] = {}


class StepRequest(BaseModel):
    action: ActionPayload


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health", tags=["meta"])
async def health():
    """Returns 200 OK when the server is running."""
    return {"status": "ok", "model": MODEL_NAME}


@app.get("/tasks", tags=["meta"])
async def list_tasks():
    """Returns the list of available tasks defined in openenv.yaml."""
    return {"tasks": TASKS}


@app.post("/reset", tags=["openenv"])
async def reset(body: ResetRequest):
    """
    Reset the environment.

    Destroys any existing OS instance and creates a fresh one.
    Returns the initial observation and the task description.
    """
    task = _find_task(body.task_id)

    # Tear down existing instance if any
    if session["instance_id"] is not None:
        try:
            await _vite("POST", "/api/destroyOS", json={"instanceId": session["instance_id"]})
        except Exception:
            log.warning("Could not destroy previous instance — continuing.")

    # Create new instance
    create_resp = await _vite("POST", "/api/createOS", json={})
    instance_id: str = create_resp.get("instanceId") or create_resp.get("instance_id")
    if not instance_id:
        raise HTTPException(status_code=502, detail="Vite did not return an instanceId.")

    # Update session
    session.update(
        instance_id=instance_id,
        task_id=body.task_id,
        step_count=0,
        done=False,
    )

    observation = await _get_state(instance_id)

    return {
        "observation": observation,
        "task": task["description"],
        "task_id": task["id"],
        "difficulty": task["difficulty"],
        "max_steps": task.get("max_steps", MAX_STEPS),
        "instance_id": instance_id,
    }


@app.post("/step", tags=["openenv"])
async def step(body: StepRequest):
    """
    Execute an action in the current environment.

    Returns the next observation, reward, done flag, and auxiliary info.
    """
    if session["instance_id"] is None:
        raise HTTPException(status_code=400, detail="Environment not initialised. Call /reset first.")

    if session["done"]:
        raise HTTPException(status_code=400, detail="Episode finished. Call /reset to start a new one.")

    instance_id: str = session["instance_id"]
    t_start = time.perf_counter()

    # Execute action on Vite OS
    exec_resp = await _vite(
        "POST",
        "/api/execute",
        json={"instanceId": instance_id, "action": body.action.model_dump()},
    )

    # Fetch updated state
    observation = await _get_state(instance_id)

    # Step accounting
    session["step_count"] += 1
    step_count: int = session["step_count"]
    task_max = next(
        (t.get("max_steps", MAX_STEPS) for t in TASKS if t["id"] == session["task_id"]),
        MAX_STEPS,
    )

    done = step_count >= task_max
    session["done"] = done

    elapsed_ms = round((time.perf_counter() - t_start) * 1000, 1)

    return {
        "observation": observation,
        "reward": 0.0,         # Stub — reward shaping lives in your RL agent
        "done": done,
        "info": {
            "step": step_count,
            "max_steps": task_max,
            "elapsed_ms": elapsed_ms,
            "exec_response": exec_resp,
        },
    }


@app.get("/state", tags=["openenv"])
async def get_state():
    """Returns the current OS state without advancing the episode."""
    if session["instance_id"] is None:
        raise HTTPException(status_code=400, detail="Environment not initialised. Call /reset first.")
    return await _get_state(session["instance_id"])
