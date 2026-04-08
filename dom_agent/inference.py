"""
inference.py — OpenEnv-compliant inference agent for OSaaS

Uses an LLM (via the openai SDK) to navigate a simulated OS environment.
Emits the strict [START]/[STEP]/[END] log format required by the
Meta OpenEnv Hackathon.

Environment variables:
    API_BASE_URL  — LLM endpoint        (default: https://api.openai.com/v1)
    MODEL_NAME    — model to use         (default: gpt-4o-mini)
    HF_TOKEN      — API key              (REQUIRED, no default)

Usage:
    python inference.py
"""

from __future__ import annotations
import json
import os
import re
import sys
from typing import Dict, List

import requests
from openai import OpenAI

# ────────────────────────────────────────────────────────────────────────────
# Configuration from environment
# ────────────────────────────────────────────────────────────────────────────
SERVER_URL   = "http://localhost:8000"
TASKS        = ["easy", "medium", "hard"]

API_BASE_URL = os.environ.get("API_BASE_URL", "https://api.openai.com/v1")
MODEL_NAME   = os.environ.get("MODEL_NAME", "gpt-4o-mini")
HF_TOKEN     = os.environ.get("HF_TOKEN")

if not HF_TOKEN:
    raise ValueError(
        "HF_TOKEN environment variable is required but not set. "
        "Export it before running: export HF_TOKEN=your_token_here"
    )

client = OpenAI(base_url=API_BASE_URL, api_key=HF_TOKEN)

# ────────────────────────────────────────────────────────────────────────────
# Logging helpers (all diagnostics go to stderr, NEVER stdout)
# ────────────────────────────────────────────────────────────────────────────
def _log(msg: str) -> None:
    print(f"[INFO] {msg}", file=sys.stderr, flush=True)


def _err(msg: str) -> None:
    print(f"[ERROR] {msg}", file=sys.stderr, flush=True)


# ────────────────────────────────────────────────────────────────────────────
# Environment client (unchanged — talks to OSaaS Vite server)
# ────────────────────────────────────────────────────────────────────────────
class EnvClient:
    def __init__(self, base_url: str, timeout: int = 15):
        self.base    = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path: str) -> Dict:
        r = requests.get(f"{self.base}{path}", timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, payload: Dict | None = None) -> Dict:
        r = requests.post(
            f"{self.base}{path}",
            json=payload or {},
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()

    def reset(self, instruction: str | None = None) -> Dict:
        payload = {"instruction": instruction} if instruction else {}
        return self._post("/reset", payload)

    def state(self) -> Dict:
        return self._get("/state")

    def step(self, payload: Dict) -> Dict:
        return self._post("/step", payload)


# ────────────────────────────────────────────────────────────────────────────
# LLM agent: converts DOM state into an action via the OpenAI SDK
# ────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """\
You are an AI agent navigating a simulated operating system. You see a list of \
interactive UI elements (the DOM) and must pick one to interact with in order to \
complete a given task.

Rules:
- Desktop icons REQUIRE action "DOUBLE_CLICK" to open them.
- Start menu items, buttons, and all other elements use "CLICK".
- To open an app that is not visible, first CLICK the "Start Button" to open the \
start menu, then CLICK the app in the menu.
- If your target is not visible in the current DOM, take exploratory actions to \
reveal it (open start menu, open folders, etc.).
- The Terminal window has clickable command buttons (e.g. "Terminal cmd: dir", \
"Terminal cmd: open readme.txt"). CLICK them to execute that command.
- To open a file from the Terminal: first open the Terminal, then CLICK the \
appropriate "Terminal cmd: open <filename>" button.
- Think step-by-step about what needs to happen to reach the goal.

You MUST respond with ONLY a JSON object (no markdown, no explanation) in this \
exact format:
{"node_idx": <int>, "action": "<CLICK|DOUBLE_CLICK>"}

node_idx is the 0-based index of the element you want to interact with.
"""


def build_user_prompt(
    instruction: str,
    dom: List[Dict],
    step_n: int,
    history: List[str],
) -> str:
    """Build the per-step user prompt showing the current DOM and history."""
    lines = [f"TASK: {instruction}", f"STEP: {step_n}", ""]

    if history:
        lines.append("RECENT ACTIONS:")
        for h in history[-5:]:
            lines.append(f"  {h}")
        lines.append("")

    lines.append("CURRENT DOM ELEMENTS:")
    for i, el in enumerate(dom):
        text  = el.get("text", "")
        etype = el.get("type", "element")
        x     = el.get("x", 0.0)
        y     = el.get("y", 0.0)
        hint  = " (needs DOUBLE_CLICK)" if etype == "icon" else ""
        lines.append(f"  [{i}] {text}  (type={etype}, x={x:.3f}, y={y:.3f}){hint}")

    lines.append("")
    lines.append("Respond with ONLY the JSON object: {\"node_idx\": ..., \"action\": ...}")
    return "\n".join(lines)


def parse_llm_response(raw: str, dom_size: int) -> Dict:
    """
    Extract {node_idx, action} from the LLM response.
    Robust to markdown fences, extra text, etc.
    """
    # Try to find a JSON object in the response
    match = re.search(r'\{[^}]+\}', raw)
    if not match:
        raise ValueError(f"No JSON object found in LLM response: {raw!r}")

    data = json.loads(match.group())

    node_idx = int(data.get("node_idx", 0))
    action   = str(data.get("action", "CLICK")).upper()

    # Clamp and validate
    node_idx = max(0, min(node_idx, dom_size - 1))
    if action not in ("CLICK", "DOUBLE_CLICK"):
        action = "CLICK"

    return {"node_idx": node_idx, "action": action}


def ask_llm(
    instruction: str,
    dom: List[Dict],
    step_n: int,
    history: List[str],
    conversation: List[Dict],
) -> Dict:
    """
    Call the LLM and return a parsed action dict.
    Maintains conversation context across steps for multi-step reasoning.
    """
    user_msg = build_user_prompt(instruction, dom, step_n, history)
    conversation.append({"role": "user", "content": user_msg})

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=conversation,
            temperature=0.2,
            max_tokens=100,
        )
        raw = response.choices[0].message.content.strip()
        _log(f"LLM raw: {raw}")

        # Add assistant response to conversation for context
        conversation.append({"role": "assistant", "content": raw})

        return parse_llm_response(raw, len(dom))

    except Exception as e:
        _err(f"LLM call failed: {e}")
        # Fallback: click element 0 (usually Start Button)
        conversation.append({"role": "assistant", "content": '{"node_idx": 0, "action": "CLICK"}'})
        return {"node_idx": 0, "action": "CLICK"}


# ────────────────────────────────────────────────────────────────────────────
# Stdout formatters (strict hackathon format)
# ────────────────────────────────────────────────────────────────────────────
def emit_start(task: str, model: str) -> None:
    print(f"[START] task={task} env=ReactOS model={model}", flush=True)


def emit_step(step: int, action: str, reward: float, done: bool, error: str | None = None) -> None:
    err_str = "null" if error is None else error
    print(
        f"[STEP] step={step} action={action} reward={reward:.2f} "
        f"done={'true' if done else 'false'} error={err_str}",
        flush=True,
    )


def emit_end(success: bool, steps: int, rewards: List[float]) -> None:
    rewards_str = ",".join(f"{r:.2f}" for r in rewards)
    print(
        f"[END] success={'true' if success else 'false'} steps={steps} rewards={rewards_str}",
        flush=True,
    )


# ────────────────────────────────────────────────────────────────────────────
# Main loop
# ────────────────────────────────────────────────────────────────────────────
def run(
    server_url: str,
    task_id: str,
    max_steps: int = 30,
) -> None:
    env = EnvClient(server_url)

    # ── Reset ────────────────────────────────────────────────────────────────
    try:
        env.reset(instruction=task_id)
    except Exception as e:
        _err(f"/reset failed for task '{task_id}': {e}")
        return

    # ── Get initial state ────────────────────────────────────────────────────
    try:
        initial_state = env.state()
        ep_instruction = initial_state.get("instruction", task_id)
        _log(f"Task: '{task_id}' — Instruction: \"{ep_instruction}\"")
        _log(f"Initial DOM: {len(initial_state.get('dom', []))} elements")
    except Exception:
        ep_instruction = task_id

    # ── Start ────────────────────────────────────────────────────────────────
    emit_start(task=task_id, model=MODEL_NAME)

    all_rewards: List[float] = []
    success  = False
    history: List[str] = []

    # Conversation context for multi-step reasoning
    conversation: List[Dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    for step_n in range(1, max_steps + 1):
        # ── Fetch state ──────────────────────────────────────────────────────
        error_msg = None
        try:
            state = env.state()
        except Exception as e:
            error_msg = str(e)
            emit_step(step_n, "NOOP", 0.0, False, error=error_msg)
            all_rewards.append(0.0)
            break

        dom: List[Dict] = state.get("dom", [])
        ep_instruction   = state.get("instruction", task_id)

        if not dom:
            error_msg = "empty_dom"
            emit_step(step_n, "NOOP", 0.0, False, error=error_msg)
            all_rewards.append(0.0)
            break

        # ── Ask LLM for action ───────────────────────────────────────────────
        llm_action = ask_llm(ep_instruction, dom, step_n, history, conversation)
        node_idx   = llm_action["node_idx"]
        action_str = llm_action["action"]

        # Resolve coordinates from DOM
        target_el = dom[node_idx] if node_idx < len(dom) else dom[0]
        x = round(target_el.get("x", 0.0), 4)
        y = round(target_el.get("y", 0.0), 4)

        # Record action in history for LLM context
        el_text = target_el.get("text", "?")
        history.append(f"Step {step_n}: {action_str} [{node_idx}] \"{el_text}\" ({x},{y})")

        # ── Step environment ─────────────────────────────────────────────────
        try:
            result = env.step({
                "action":   action_str,
                "x":        x,
                "y":        y,
                "node_idx": node_idx,
            })
        except Exception as e:
            error_msg = str(e)
            emit_step(step_n, f"{action_str}({el_text})", 0.0, False, error=error_msg)
            all_rewards.append(0.0)
            break

        reward = float(result.get("reward", 0.0))
        done   = bool(result.get("done", False))
        all_rewards.append(reward)

        action_display = f"{action_str}({el_text})"
        emit_step(step_n, action_display, reward, done, error=None)

        _log(f"  reward={reward:.3f} done={done} info={result.get('info', {})}")

        if done:
            # Success if the last reward indicates task completion
            if reward >= 1.0:
                success = True
            break

    # ── End ──────────────────────────────────────────────────────────────────
    emit_end(success=success, steps=len(all_rewards), rewards=all_rewards)


if __name__ == "__main__":
    for task_id in TASKS:
        _log(f"===== Starting task: {task_id} =====")
        run(server_url=SERVER_URL, task_id=task_id, max_steps=30)
