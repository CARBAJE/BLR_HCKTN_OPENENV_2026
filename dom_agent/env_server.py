"""
env_server.py — Minimal FastAPI OS-simulation environment

Endpoints
---------
  POST /reset  → resets the episode, returns {"status": "ok"}
  GET  /state  → returns {"dom": [...], "instruction": "..."}
  POST /step   → receives action dict, returns {"reward": float, "done": bool}

The DOM returned by /state is a list of interactive elements:
  {"text": str, "type": str, "x": float, "y": float}

Run
---
  uvicorn env_server:app --host 0.0.0.0 --port 8000 --reload

Notes
-----
  This server ships as a REFERENCE IMPLEMENTATION / mock.  
  Replace the _simulate_step() function with your actual OS simulator.
"""

from __future__ import annotations

import random
import time
from typing import Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="DOM Navigation Environment", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Episode state ─────────────────────────────────────────────────────────────
class EpisodeState:
    def __init__(self):
        self.reset()

    def reset(self):
        self.step_count  = 0
        self.done        = False
        self.target_idx  = 0          # index of the "correct" node to click
        self.dom: List[Dict] = []
        self.instruction = ""
        self._generate_episode()

    def _generate_episode(self):
        """Generate a synthetic DOM episode (replace with real OS hook)."""
        templates = [
            ("Click the Login button",      "Login",    "button"),
            ("Open the File menu",          "File",     "menuitem"),
            ("Submit the form",             "Submit",   "button"),
            ("Close the dialog",            "Close",    "button"),
            ("Click Search",                "Search",   "button"),
            ("Select the Checkbox option",  "Option A", "checkbox"),
        ]
        self.instruction, target_text, target_type = random.choice(templates)

        n_distractors = random.randint(3, 8)
        elements = []

        # Insert target at a random position
        target_pos = random.randint(0, n_distractors)
        target_el  = {
            "text": target_text,
            "type": target_type,
            "x":    round(random.uniform(0.1, 0.9), 3),
            "y":    round(random.uniform(0.1, 0.9), 3),
        }
        distractor_texts = [
            "Cancel", "Help", "Settings", "Back", "Next",
            "OK", "Apply", "Close", "Save", "Open",
        ]
        for i in range(n_distractors + 1):
            if i == target_pos:
                elements.append(target_el)
            else:
                dt = random.choice(distractor_texts)
                elements.append({
                    "text": dt,
                    "type": random.choice(["button", "link", "menuitem"]),
                    "x":    round(random.uniform(0.0, 1.0), 3),
                    "y":    round(random.uniform(0.0, 1.0), 3),
                })

        self.dom         = elements
        self.target_idx  = target_pos


_state = EpisodeState()


# ── Pydantic models ───────────────────────────────────────────────────────────
class StepRequest(BaseModel):
    action:   str
    x:        float
    y:        float
    node_idx: int = -1


class StepResponse(BaseModel):
    reward: float
    done:   bool
    info:   Dict = {}


# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.post("/reset")
def reset() -> Dict:
    _state.reset()
    return {"status": "ok", "instruction": _state.instruction}


@app.get("/state")
def state() -> Dict:
    return {
        "dom":         _state.dom,
        "instruction": _state.instruction,
        "step":        _state.step_count,
        "done":        _state.done,
    }


@app.post("/step", response_model=StepResponse)
def step(req: StepRequest) -> StepResponse:
    if _state.done:
        raise HTTPException(status_code=400, detail="Episode already done. Call /reset.")

    _state.step_count += 1

    # ── Reward logic (replace with your real simulator) ───────────────────
    reward, done, info = _simulate_step(req)

    _state.done = done
    return StepResponse(reward=reward, done=done, info=info)


def _simulate_step(req: StepRequest):
    """
    Mock reward function:
      +1.0  if the agent clicked the correct node index
      +0.5  if the agent clicked close to the target coordinates
      -0.1  otherwise (step penalty)
    Episode ends on correct click or after 30 steps.
    """
    target = _state.dom[_state.target_idx]
    info   = {}

    # Check by node index (most reliable)
    if req.node_idx == _state.target_idx:
        reward = 1.0
        done   = True
        info   = {"result": "correct_node"}
    # Check by spatial proximity
    elif (abs(req.x - target["x"]) < 0.05 and abs(req.y - target["y"]) < 0.05):
        reward = 0.5
        done   = True
        info   = {"result": "correct_coords"}
    else:
        reward = -0.1
        done   = _state.step_count >= 30
        info   = {"result": "wrong", "target_idx": _state.target_idx}

        # Occasionally mutate DOM to test variable-size handling
        if random.random() < 0.2 and len(_state.dom) > 2:
            _state.dom.pop(random.randint(0, len(_state.dom) - 1))
            # Adjust target index if needed
            if _state.target_idx >= len(_state.dom):
                _state.target_idx = len(_state.dom) - 1

    return reward, done, info


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health() -> Dict:
    return {"status": "ok", "timestamp": time.time()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
