"""
tasks.py — Task definitions and graders for ReactOS environment.

3 tasks with progressive difficulty, each scored in [0.0, 1.0].
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List

# ── Task registry ─────────────────────────────────────────────────────────────

@dataclass
class Task:
    name: str
    instruction: str
    target_text: str      # text fragment to match in DOM
    difficulty: str       # easy, medium, hard
    max_steps: int
    grader: Callable      # (rewards, dom_history, state) -> float in [0,1]


def _target_visible(dom: List[dict], target: str) -> bool:
    tgt = target.lower()
    return any(
        tgt in (el.get("text") or "").lower() or
        (el.get("text") or "").lower() in tgt
        for el in dom
    )


def _has_window(state: dict, component: str) -> bool:
    return any(
        w.get("component") == component and not w.get("minimized")
        for w in state.get("windowsStack", [])
    )


# ── Graders ───────────────────────────────────────────────────────────────────

def grade_click_start(rewards: List[float], dom_history: List[List[dict]],
                      state: dict) -> float:
    """Easy: click the Start button. 1.0 if any reward >= 1.0."""
    if any(r >= 1.0 for r in rewards):
        return 1.0
    if state.get("startMenuOpen"):
        return 0.5
    if any(r > 0 for r in rewards):
        return 0.2
    return 0.0


def grade_open_terminal(rewards: List[float], dom_history: List[List[dict]],
                        state: dict) -> float:
    """Medium: open the Terminal app. Partial credit for start menu."""
    if _has_window(state, "Terminal"):
        return 1.0
    if state.get("startMenuOpen"):
        return 0.3
    if any(r >= 1.0 for r in rewards):
        return 1.0
    total = sum(rewards)
    return min(0.2, total / 5.0)


def grade_install_python(rewards: List[float], dom_history: List[List[dict]],
                         state: dict) -> float:
    """Hard: navigate to Python installer and click Install Now."""
    score = 0.0

    # Milestone 1: opened File Explorer (0.15)
    if _has_window(state, "Explorer"):
        score += 0.15

    # Milestone 2: opened Python Installer (0.35)
    if _has_window(state, "PythonInstaller"):
        score += 0.35

    # Milestone 3: clicked Install Now (full reward from env)
    if any(r >= 1.0 for r in rewards):
        score = 1.0

    # Fallback: partial from accumulated rewards
    if score < 0.15:
        total = sum(rewards)
        score = max(score, min(0.1, total / 10.0))

    return min(1.0, score)


# ── Task catalog ──────────────────────────────────────────────────────────────

TASKS: Dict[str, Task] = {
    "click_start": Task(
        name="click_start",
        instruction="Click the Start button",
        target_text="Start",
        difficulty="easy",
        max_steps=10,
        grader=grade_click_start,
    ),
    "open_terminal": Task(
        name="open_terminal",
        instruction="Open the Terminal",
        target_text="Terminal",
        difficulty="medium",
        max_steps=15,
        grader=grade_open_terminal,
    ),
    "install_python": Task(
        name="install_python",
        instruction="Click the 'Install Now' button in the Python Setup.",
        target_text="Install Now",
        difficulty="hard",
        max_steps=30,
        grader=grade_install_python,
    ),
}

DEFAULT_TASK = "open_terminal"
