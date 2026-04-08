"""
inference.py — Inference loop for DOMAgent

Calls the FastAPI environment server and logs to stdout in the
required format:

    [START]
    [STEP] {"step": 1, "action": "CLICK", "reward": 1.0, "done": false}
    ...
    [END]

Usage
-----
  python inference.py \
      --server http://localhost:8000 \
      --instruction "Open the settings menu" \
      --weights agent_bc.pt \
      --max_steps 30
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List

import requests
import torch

from model import DOMAgent, dom_to_graph, ACTION_MAP


# ────────────────────────────────────────────────────────────────────────────
# Environment client
# ────────────────────────────────────────────────────────────────────────────
class EnvClient:
    def __init__(self, base_url: str, timeout: int = 15):
        self.base    = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path: str) -> Dict:
        r = requests.get(f"{self.base}{path}", timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, payload: Dict = None) -> Dict:
        r = requests.post(
            f"{self.base}{path}",
            json=payload or {},
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()

    def reset(self) -> Dict:
        return self._post("/reset")

    def state(self) -> Dict:
        return self._get("/state")

    def step(self, payload: Dict) -> Dict:
        return self._post("/step", payload)


# ────────────────────────────────────────────────────────────────────────────
# Core run() function
# ────────────────────────────────────────────────────────────────────────────
def run(
    server_url: str,
    instruction: str,
    weights_path: str | None = None,
    max_steps: int = 30,
    greedy: bool = True,
) -> None:
    """
    Main inference loop.

    1. POST /reset  → resets the environment
    2. GET  /state  → retrieves current DOM
    3. Forward pass through DOMAgent
    4. Translate winner node → (x, y)
    5. POST /step   → sends action, receives reward + done
    Repeat 2-5 until done=True or max_steps reached.
    """
    # ── Load model ──────────────────────────────────────────────────────────
    model = DOMAgent()
    if weights_path and os.path.isfile(weights_path):
        model.load_state_dict(
            torch.load(weights_path, map_location="cpu")
        )
        _log(f"Loaded weights from {weights_path}")
    model.eval()

    env = EnvClient(server_url)

    # ── Reset ────────────────────────────────────────────────────────────────
    try:
        env.reset()
    except Exception as e:
        _err(f"/reset failed: {e}")
        sys.exit(1)

    # ── Start marker ─────────────────────────────────────────────────────────
    print("[START]", flush=True)

    for step_n in range(1, max_steps + 1):
        # ── Fetch state ──────────────────────────────────────────────────────
        try:
            state = env.state()
        except Exception as e:
            _err(f"/state failed at step {step_n}: {e}")
            break

        dom: List[Dict] = state.get("dom", [])
        ep_instruction  = state.get("instruction", instruction)

        if not dom:
            _err(f"Step {step_n}: empty DOM — terminating episode.")
            break

        # ── Build graph (handles variable-size DOM) ──────────────────────────
        try:
            graph = dom_to_graph(dom)
        except Exception as e:
            _err(f"Step {step_n}: graph construction error: {e}")
            break

        # ── Forward pass ─────────────────────────────────────────────────────
        with torch.no_grad():
            node_log_probs, action_logits, _ = model(ep_instruction, graph)

        # ── Select node ──────────────────────────────────────────────────────
        if greedy:
            node_idx = int(node_log_probs.argmax().item())
        else:
            probs    = node_log_probs.exp()
            node_idx = int(torch.multinomial(probs, 1).item())

        # ── Translate index → coordinates ────────────────────────────────────
        x, y = graph.coords[node_idx].tolist()

        # ── Select action ────────────────────────────────────────────────────
        action_idx = int(action_logits.argmax().item())
        action_str = ACTION_MAP[action_idx]

        # ── Step environment ─────────────────────────────────────────────────
        payload = {
            "action":   action_str,
            "x":        round(x, 4),
            "y":        round(y, 4),
            "node_idx": node_idx,
        }
        try:
            result = env.step(payload)
        except Exception as e:
            _err(f"/step failed at step {step_n}: {e}")
            break

        reward = float(result.get("reward", 0.0))
        done   = bool(result.get("done", False))

        # ── Emit step log ────────────────────────────────────────────────────
        winner_element = dom[node_idx] if node_idx < len(dom) else {}
        step_log = {
            "step":   step_n,
            "action": action_str,
            "target": {
                "index": node_idx,
                "text":  winner_element.get("text", ""),
                "type":  winner_element.get("type", ""),
            },
            "x":      round(x, 4),
            "y":      round(y, 4),
            "reward": reward,
            "done":   done,
        }
        print(f"[STEP] {json.dumps(step_log)}", flush=True)

        if done:
            break

    # ── End marker ───────────────────────────────────────────────────────────
    print("[END]", flush=True)


# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────
def _log(msg: str) -> None:
    print(f"[INFO] {msg}", file=sys.stderr, flush=True)


def _err(msg: str) -> None:
    print(f"[ERROR] {msg}", file=sys.stderr, flush=True)


# ────────────────────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run DOMAgent inference")
    p.add_argument("--server", default="http://localhost:8000",
                   help="FastAPI environment server URL")
    p.add_argument("--instruction", default="Complete the task on screen",
                   help="Natural language task instruction")
    p.add_argument("--weights", default=None,
                   help="Path to model weights (.pt)")
    p.add_argument("--max_steps", type=int, default=30,
                   help="Maximum steps per episode")
    p.add_argument("--stochastic", action="store_true",
                   help="Sample from distribution instead of argmax")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(
        server_url=args.server,
        instruction=args.instruction,
        weights_path=args.weights,
        max_steps=args.max_steps,
        greedy=not args.stochastic,
    )
