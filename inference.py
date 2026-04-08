"""
inference.py — OpenEnv-compliant LLM agent for ReactOS

Uses an LLM (via the openai SDK) to navigate a simulated OS environment.
Emits strict [START]/[STEP]/[END] log format required by the Meta OpenEnv Hackathon.

Environment variables:
    API_BASE_URL  — LLM endpoint        (default: https://api.openai.com/v1)
    MODEL_NAME    — model identifier     (default: gpt-4o-mini)
    HF_TOKEN      — API key              (REQUIRED, no default)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any, Dict, List, Optional

import requests
from openai import OpenAI

# ────────────────────────────────────────────────────────────────────────────
# Configuration from environment
# ────────────────────────────────────────────────────────────────────────────
API_BASE_URL = os.getenv("API_BASE_URL", "https://api.openai.com/v1")
MODEL_NAME   = os.getenv("MODEL_NAME", "gpt-4o-mini")
HF_TOKEN     = os.getenv("HF_TOKEN")

if HF_TOKEN is None:
    raise ValueError("HF_TOKEN environment variable is required")

client = OpenAI(base_url=API_BASE_URL, api_key=HF_TOKEN)

BENCHMARK = "ReactOS"

# ────────────────────────────────────────────────────────────────────────────
# Task registry — maps CLI task names to RL instructions
# ────────────────────────────────────────────────────────────────────────────
TASK_INSTRUCTIONS = {
    "click_start":      "Click the Start button",
    "open_terminal":    "Open the Terminal",
    "open_explorer":    "Open the Explorer",
    "open_settings":    "Open System Settings",
    "open_downloads":   "Open the Downloads folder",
    "open_recycle_bin": "Open the Recycle Bin",
    "install_python":   "Click the 'Install Now' button in the Python Setup.",
    "open_notepad":     "Open Notepad",
    "open_documents":   "Open the Documents folder",
    "open_file_terminal": "Open readme.txt using the Terminal",
}

# ────────────────────────────────────────────────────────────────────────────
# Logging (all diagnostics -> stderr, NEVER stdout)
# ────────────────────────────────────────────────────────────────────────────
def _log(msg: str) -> None:
    print(f"[INFO] {msg}", file=sys.stderr, flush=True)


def _err(msg: str) -> None:
    print(f"[ERROR] {msg}", file=sys.stderr, flush=True)


# ────────────────────────────────────────────────────────────────────────────
# Environment client
# ────────────────────────────────────────────────────────────────────────────
class EnvClient:
    def __init__(self, base_url: str, timeout: int = 30):
        self.base    = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path: str) -> Dict:
        r = requests.get(f"{self.base}{path}", timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, payload: Dict | None = None) -> Dict:
        r = requests.post(f"{self.base}{path}", json=payload or {}, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def reset(self, task_name: str | None = None, instruction: str | None = None) -> Dict:
        body: Dict[str, Any] = {}
        if task_name:
            body["task_name"] = task_name
        if instruction:
            body["instruction"] = instruction
        return self._post("/reset", body)

    def step(self, payload: Dict) -> Dict:
        return self._post("/step", payload)

    def state(self) -> Dict:
        return self._get("/state")

    def score(self, rewards: List[float]) -> float:
        r = self._post("/score", {"rewards": rewards})
        return float(r.get("score", 0.0))

    def close(self) -> None:
        pass  # HTTP client — nothing to close


# ────────────────────────────────────────────────────────────────────────────
# LLM Agent
# ────────────────────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """\
You are an AI agent navigating a simulated operating system. You see a list of \
interactive UI elements (the DOM) and must pick one to interact with to complete a task.

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

You MUST respond with ONLY a JSON object (no markdown, no explanation):
{"node_idx": <int>, "action": "<CLICK|DOUBLE_CLICK>"}

node_idx is the 0-based index of the element you want to interact with.\
"""


def _build_user_prompt(instruction: str, dom: List[Dict], step_n: int,
                       history: List[str]) -> str:
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
    lines.append('Respond with ONLY: {"node_idx": ..., "action": ...}')
    return "\n".join(lines)


def _parse_llm_response(raw: str, dom_size: int) -> Dict:
    match = re.search(r'\{[^}]+\}', raw)
    if not match:
        raise ValueError(f"No JSON object in LLM response: {raw!r}")
    data = json.loads(match.group())
    node_idx = max(0, min(int(data.get("node_idx", 0)), dom_size - 1))
    action = str(data.get("action", "CLICK")).upper()
    if action not in ("CLICK", "DOUBLE_CLICK"):
        action = "CLICK"
    return {"node_idx": node_idx, "action": action}


def _ask_llm(instruction: str, dom: List[Dict], step_n: int,
             history: List[str], conversation: List[Dict]) -> Dict:
    user_msg = _build_user_prompt(instruction, dom, step_n, history)
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
        conversation.append({"role": "assistant", "content": raw})
        return _parse_llm_response(raw, len(dom))
    except Exception as e:
        _err(f"LLM call failed: {e}")
        conversation.append({"role": "assistant", "content": '{"node_idx": 0, "action": "CLICK"}'})
        return {"node_idx": 0, "action": "CLICK"}


# ────────────────────────────────────────────────────────────────────────────
# Stdout formatters (strict hackathon format)
# ────────────────────────────────────────────────────────────────────────────
def _emit_start(task: str, model: str) -> None:
    print(f"[START] task={task} env={BENCHMARK} model={model}", flush=True)


def _emit_step(step: int, action: str, reward: float, done: bool,
               error: str | None = None) -> None:
    err = "null" if error is None else error
    print(
        f"[STEP] step={step} action={action} reward={reward:.2f} "
        f"done={'true' if done else 'false'} error={err}",
        flush=True,
    )


def _emit_end(success: bool, steps: int, score: float, rewards: List[float]) -> None:
    rewards_str = ",".join(f"{r:.2f}" for r in rewards)
    print(
        f"[END] success={'true' if success else 'false'} steps={steps} "
        f"score={score:.2f} rewards={rewards_str}",
        flush=True,
    )


# ────────────────────────────────────────────────────────────────────────────
# Main loop
# ────────────────────────────────────────────────────────────────────────────
def run(server_url: str, task_name: str, instruction: str | None = None,
        max_steps: int = 30) -> None:
    env = EnvClient(server_url)

    # Reset
    try:
        reset_resp = env.reset(task_name=task_name, instruction=instruction)
    except Exception as e:
        _err(f"/reset failed: {e}")
        sys.exit(1)

    obs = reset_resp.get("observation", {})
    ep_instruction = obs.get("instruction", instruction or task_name)
    dom = [el if isinstance(el, dict) else el for el in obs.get("dom", [])]
    task_info = obs.get("info", {})
    actual_task = task_info.get("task", task_name)

    _log(f"Task: {actual_task} | Instruction: \"{ep_instruction}\"")
    _log(f"Initial DOM: {len(dom)} elements")

    _emit_start(task=actual_task, model=MODEL_NAME)

    all_rewards: List[float] = []
    success = False
    score = 0.0
    history: List[str] = []
    conversation: List[Dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    try:
        for step_n in range(1, max_steps + 1):
            error_msg: Optional[str] = None

            if not dom:
                error_msg = "empty_dom"
                _emit_step(step_n, "NOOP", 0.0, False, error=error_msg)
                all_rewards.append(0.0)
                break

            # Ask LLM
            llm_action = _ask_llm(ep_instruction, dom, step_n, history, conversation)
            node_idx   = llm_action["node_idx"]
            action_str = llm_action["action"]
            target_el  = dom[node_idx] if node_idx < len(dom) else dom[0]
            el_text    = target_el.get("text", "?") if isinstance(target_el, dict) else "?"
            x = round(target_el.get("x", 0.0), 4) if isinstance(target_el, dict) else 0.0
            y = round(target_el.get("y", 0.0), 4) if isinstance(target_el, dict) else 0.0

            history.append(f"Step {step_n}: {action_str} [{node_idx}] \"{el_text}\"")

            # Step environment
            try:
                result = env.step({
                    "action": action_str,
                    "node_idx": node_idx,
                    "x": x,
                    "y": y,
                })
            except Exception as e:
                error_msg = str(e)
                _emit_step(step_n, f"{action_str}({el_text})", 0.0, False, error=error_msg)
                all_rewards.append(0.0)
                break

            reward = float(result.get("reward", 0.0))
            done   = bool(result.get("done", False))
            all_rewards.append(reward)

            action_display = f"{action_str}({el_text})"
            _emit_step(step_n, action_display, reward, done, error=None)

            _log(f"  reward={reward:.3f} done={done} info={result.get('info', {})}")

            if done:
                if reward >= 1.0:
                    success = True
                break

            # Refresh DOM from observation
            step_obs = result.get("observation", {})
            dom = step_obs.get("dom", [])
            if not dom:
                # Fallback: fetch state
                try:
                    dom = []  # will break on next iteration
                except Exception:
                    pass

        # Compute score via server grader
        try:
            score = env.score(all_rewards)
        except Exception:
            score = 1.0 if success else (sum(all_rewards) / max(len(all_rewards), 1))

        score = min(max(score, 0.0), 1.0)
        if score >= 0.5:
            success = True

    finally:
        try:
            env.close()
        except Exception:
            pass
        _emit_end(success=success, steps=len(all_rewards), score=score, rewards=all_rewards)


# ────────────────────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="OpenEnv LLM Agent for ReactOS")
    p.add_argument("--server", default="http://localhost:8000",
                   help="ReactOS environment server URL")
    p.add_argument("--task", default="open_terminal",
                   choices=list(TASK_INSTRUCTIONS.keys()),
                   help="Task to run")
    p.add_argument("--instruction", default=None,
                   help="Custom instruction (overrides task)")
    p.add_argument("--max_steps", type=int, default=30,
                   help="Maximum steps per episode")
    return p.parse_args()


if __name__ == "__main__":
    args = parse_args()
    # --instruction overrides --task; otherwise look up the task in the registry
    instruction = args.instruction or TASK_INSTRUCTIONS.get(args.task, args.task)
    run(
        server_url=args.server,
        task_name=args.task,
        instruction=instruction,
        max_steps=args.max_steps,
    )
