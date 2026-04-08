"""
environment.py — ReactOS OpenEnv environment implementation.

Wraps HeadlessOS with the OpenEnv interface (reset / step / state).
"""

from __future__ import annotations

import math
import uuid
from typing import Any, Dict, List, Optional

from server.headless_os import HeadlessOS
from server.models import DOMElement, ReactOSAction, ReactOSObservation, ReactOSState
from server.tasks import TASKS, DEFAULT_TASK, Task


def _target_visible(dom: List[dict], target: str) -> bool:
    tgt = target.lower()
    return any(
        tgt in (el.get("text") or "").lower() or
        (el.get("text") or "").lower() in tgt
        for el in dom
    )


def _get_expected_action(el_type: str) -> str:
    return "DOUBLE_CLICK" if el_type == "icon" else "CLICK"


RL_MAX_STEPS = 30


class ReactOSEnvironment:
    """OpenEnv-compatible environment for ReactOS navigation tasks."""

    def __init__(self) -> None:
        self._os = HeadlessOS()
        self._state = ReactOSState()
        self._task: Optional[Task] = None
        self._episode_dom: List[dict] = []
        self._dom_history: List[List[dict]] = []

    def reset(self, task_name: str | None = None, instruction: str | None = None,
              seed: int | None = None, **kwargs: Any) -> ReactOSObservation:
        """Reset the OS and start a new episode."""
        if seed is not None:
            import random
            random.seed(seed)

        self._os.reset()

        # Resolve task
        if task_name and task_name in TASKS:
            self._task = TASKS[task_name]
        elif instruction:
            # Try to match instruction to a known task
            instr_lower = instruction.lower()
            matched = next(
                (t for t in TASKS.values()
                 if t.instruction.lower() == instr_lower
                 or t.target_text.lower() in instr_lower),
                None,
            )
            if matched:
                self._task = matched
            else:
                # Custom instruction: extract last word as target
                words = instruction.split()
                self._task = Task(
                    name="custom",
                    instruction=instruction,
                    target_text=words[-1] if words else "Start",
                    difficulty="medium",
                    max_steps=RL_MAX_STEPS,
                    grader=lambda r, d, s: 1.0 if any(x >= 1.0 for x in r) else 0.0,
                )
        else:
            self._task = TASKS[task_name or DEFAULT_TASK]

        self._episode_dom = self._os.get_dom()
        self._dom_history = [self._episode_dom]

        self._state = ReactOSState(
            episode_id=str(uuid.uuid4()),
            step_count=0,
            task_name=self._task.name,
            instruction=self._task.instruction,
            done=False,
            os_version=self._os.version,
        )

        return ReactOSObservation(
            dom=[DOMElement(**el) for el in self._episode_dom],
            instruction=self._task.instruction,
            done=False,
            reward=0.0,
            info={"task": self._task.name, "difficulty": self._task.difficulty},
        )

    def step(self, action: ReactOSAction, **kwargs: Any) -> ReactOSObservation:
        """Execute one agent action and return the observation."""
        if self._task is None:
            return ReactOSObservation(
                done=True, reward=0.0,
                info={"error": "No active episode. Call reset() first."},
            )
        if self._state.done:
            return ReactOSObservation(done=True, reward=0.0)

        self._state.step_count += 1
        action_str = action.action.upper()
        node_idx = action.node_idx

        dom_before = self._episode_dom
        tgt = self._task.target_text.lower()

        # Was target visible before?
        was_visible = _target_visible(dom_before, tgt)

        # Apply action
        ver_before = self._os.version
        self._os.handle_action(node_idx, dom_before, action_str)
        dom_after = self._os.get_dom()
        state_changed = self._os.version > ver_before
        now_visible = _target_visible(dom_after, tgt)

        # ── Reward components ─────────────────────────────────────────────────

        clicked_el = dom_before[node_idx] if 0 <= node_idx < len(dom_before) else None
        element_score = 0.0
        action_score = 1.0

        if clicked_el:
            clicked_text = (clicked_el.get("text") or "").lower()
            if tgt in clicked_text or clicked_text in tgt:
                element_score = 1.0
                expected = _get_expected_action(clicked_el.get("type", "element"))
                action_score = 1.0 if action_str == expected else 0.4

        visibility_bonus = 0.05 if (not was_visible and now_visible) else 0.0
        state_change_bonus = 0.03 if state_changed else 0.0

        # Proximity
        proximity_reward = 0.0
        if element_score == 0.0 and clicked_el:
            target_el = next(
                (el for el in dom_before
                 if tgt in (el.get("text") or "").lower()
                 or (el.get("text") or "").lower() in tgt),
                None,
            )
            if target_el:
                dx = (clicked_el.get("x", 0) - target_el.get("x", 0))
                dy = (clicked_el.get("y", 0) - target_el.get("y", 0))
                dist = math.sqrt(dx * dx + dy * dy)
                if dist < 0.3:
                    proximity_reward = 0.1 * (1 - dist / 0.3)

        # Exploration bonus (new icons)
        icons_before = {el["text"] for el in dom_before if el.get("type") == "icon"}
        new_icon_count = sum(
            1 for el in dom_after
            if el.get("type") == "icon" and el["text"] not in icons_before
        )
        exploration_bonus = min(new_icon_count * 0.04, 0.12)

        reward = min(
            1.0,
            element_score * action_score
            + visibility_bonus + state_change_bonus
            + proximity_reward + exploration_bonus,
        )

        done = (
            (element_score * action_score >= 1.0)
            or self._state.step_count >= self._task.max_steps
        )

        info = {
            "element_score": element_score,
            "action_score": action_score,
            "visibility_bonus": visibility_bonus,
            "state_change": state_change_bonus,
            "proximity": proximity_reward,
            "exploration": exploration_bonus,
        }

        self._episode_dom = dom_after
        self._dom_history.append(dom_after)
        self._state.done = done
        self._state.os_version = self._os.version

        return ReactOSObservation(
            dom=[DOMElement(**el) for el in dom_after],
            instruction=self._task.instruction,
            done=done,
            reward=reward,
            info=info,
        )

    @property
    def state(self) -> ReactOSState:
        return self._state

    def get_score(self, rewards: List[float]) -> float:
        """Compute the graded score for the episode."""
        if self._task is None:
            return 0.0
        return self._task.grader(rewards, self._dom_history, self._os.state)

    def get_tasks(self) -> Dict[str, dict]:
        """Return available tasks for introspection."""
        return {
            name: {
                "instruction": t.instruction,
                "difficulty": t.difficulty,
                "max_steps": t.max_steps,
            }
            for name, t in TASKS.items()
        }
