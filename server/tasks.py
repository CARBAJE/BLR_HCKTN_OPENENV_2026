"""
tasks.py — Task definitions and graders for ReactOS environment.

10 tasks with progressive difficulty, each scored in [0.0, 1.0].
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


def _any_reward_ge(rewards: List[float], threshold: float) -> bool:
    return any(r >= threshold for r in rewards)


# ── Graders ───────────────────────────────────────────────────────────────────

def grade_click_start(rewards: List[float], dom_history: List[List[dict]],
                      state: dict) -> float:
    """Easy: click the Start button."""
    if _any_reward_ge(rewards, 1.0):
        return 1.0
    if state.get("startMenuOpen"):
        return 0.5
    if any(r > 0 for r in rewards):
        return 0.2
    return 0.0


def grade_open_terminal(rewards: List[float], dom_history: List[List[dict]],
                        state: dict) -> float:
    """Medium: open the Terminal app."""
    if _has_window(state, "Terminal") or _any_reward_ge(rewards, 1.0):
        return 1.0
    if state.get("startMenuOpen"):
        return 0.3
    total = sum(rewards)
    return min(0.2, total / 5.0)


def grade_open_explorer(rewards: List[float], dom_history: List[List[dict]],
                        state: dict) -> float:
    """Medium: open the File Explorer."""
    if _has_window(state, "Explorer") or _any_reward_ge(rewards, 1.0):
        return 1.0
    if state.get("startMenuOpen"):
        return 0.3
    total = sum(rewards)
    return min(0.2, total / 5.0)


def grade_open_settings(rewards: List[float], dom_history: List[List[dict]],
                        state: dict) -> float:
    """Easy: open System Settings."""
    if _has_window(state, "Settings") or _any_reward_ge(rewards, 1.0):
        return 1.0
    if any(r > 0 for r in rewards):
        return 0.2
    return 0.0


def grade_open_downloads(rewards: List[float], dom_history: List[List[dict]],
                         state: dict) -> float:
    """Easy: open the Downloads folder."""
    if _has_window(state, "Explorer") or _any_reward_ge(rewards, 1.0):
        return 1.0
    if any(r > 0 for r in rewards):
        return 0.2
    return 0.0


def grade_open_recycle_bin(rewards: List[float], dom_history: List[List[dict]],
                           state: dict) -> float:
    """Easy: open the Recycle Bin."""
    if _has_window(state, "RecycleBin") or _any_reward_ge(rewards, 1.0):
        return 1.0
    if any(r > 0 for r in rewards):
        return 0.2
    return 0.0


def grade_install_python(rewards: List[float], dom_history: List[List[dict]],
                         state: dict) -> float:
    """Hard: navigate to Python installer and click Install Now."""
    score = 0.0
    if _has_window(state, "Explorer"):
        score += 0.15
    if _has_window(state, "PythonInstaller"):
        score += 0.35
    if _any_reward_ge(rewards, 1.0):
        return 1.0
    if score < 0.15:
        score = max(score, min(0.1, sum(rewards) / 10.0))
    return min(1.0, score)


def grade_open_notepad(rewards: List[float], dom_history: List[List[dict]],
                       state: dict) -> float:
    """Medium: open Notepad."""
    if _has_window(state, "Notepad") or _any_reward_ge(rewards, 1.0):
        return 1.0
    if state.get("startMenuOpen"):
        return 0.3
    total = sum(rewards)
    return min(0.2, total / 5.0)


def grade_open_documents(rewards: List[float], dom_history: List[List[dict]],
                         state: dict) -> float:
    """Medium: open the Documents folder (requires Explorer + navigation)."""
    if _any_reward_ge(rewards, 1.0):
        return 1.0
    score = 0.0
    if _has_window(state, "Explorer"):
        score += 0.4
    if state.get("startMenuOpen"):
        score = max(score, 0.2)
    total = sum(rewards)
    return max(score, min(0.3, total / 5.0))


def grade_open_file_terminal(rewards: List[float], dom_history: List[List[dict]],
                             state: dict) -> float:
    """Hard: open readme.txt via the Terminal."""
    if _any_reward_ge(rewards, 1.0):
        return 1.0
    score = 0.0
    if _has_window(state, "Terminal"):
        score += 0.4
    if state.get("startMenuOpen"):
        score = max(score, 0.1)
    total = sum(rewards)
    return max(score, min(0.3, total / 10.0))


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
    "open_explorer": Task(
        name="open_explorer",
        instruction="Open the Explorer",
        target_text="Explorer",
        difficulty="medium",
        max_steps=15,
        grader=grade_open_explorer,
    ),
    "open_settings": Task(
        name="open_settings",
        instruction="Open System Settings",
        target_text="System Settings",
        difficulty="easy",
        max_steps=10,
        grader=grade_open_settings,
    ),
    "open_downloads": Task(
        name="open_downloads",
        instruction="Open the Downloads folder",
        target_text="Downloads",
        difficulty="easy",
        max_steps=10,
        grader=grade_open_downloads,
    ),
    "open_recycle_bin": Task(
        name="open_recycle_bin",
        instruction="Open the Recycle Bin",
        target_text="Recycle Bin",
        difficulty="easy",
        max_steps=10,
        grader=grade_open_recycle_bin,
    ),
    "install_python": Task(
        name="install_python",
        instruction="Click the 'Install Now' button in the Python Setup.",
        target_text="Install Now",
        difficulty="hard",
        max_steps=30,
        grader=grade_install_python,
    ),
    "open_notepad": Task(
        name="open_notepad",
        instruction="Open Notepad",
        target_text="Notepad",
        difficulty="medium",
        max_steps=15,
        grader=grade_open_notepad,
    ),
    "open_documents": Task(
        name="open_documents",
        instruction="Open the Documents folder",
        target_text="Documents",
        difficulty="medium",
        max_steps=20,
        grader=grade_open_documents,
    ),
    "open_file_terminal": Task(
        name="open_file_terminal",
        instruction="Open readme.txt using the Terminal",
        target_text="open readme.txt",
        difficulty="hard",
        max_steps=30,
        grader=grade_open_file_terminal,
    ),
}

DEFAULT_TASK = "open_terminal"
