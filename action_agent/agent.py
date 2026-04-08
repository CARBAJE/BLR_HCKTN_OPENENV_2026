"""
agent.py — Main ActionRecordingAgent class.

Orchestrates the full pipeline:
  1. Extract screenshot / image from each record
  2. Run OmniParser (if screenshot available)
  3. Find matching UI element via euclidean / containment
  4. Call LLM to generate a step
  5. Final LLM refinement pass
"""

import logging
from typing import Any

from . import omni_bridge, event_processor, llm_client

logger = logging.getLogger(__name__)


class ActionRecordingAgent:
    """
    Converts a list of OSaaS action records into a human-readable algorithm.

    Parameters
    ----------
    skip_omniparser : bool
        If True, skip OmniParser (no model loading). Useful for testing the
        LLM pipeline without GPU/weights available.
    """

    def __init__(self, skip_omniparser: bool = False):
        self.skip_omniparser = skip_omniparser

    # ──────────────────────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _extract_screenshot(record: dict) -> str:
        """
        Return the raw screenshot/image base64 string (or '' if missing/empty).
        Supports both 'screenshot' and 'image' keys.
        """
        for key in ("screenshot", "image"):
            val = record.get(key)
            if val and isinstance(val, str) and val.strip():
                return val.strip()
        return ""

    @staticmethod
    def _load_input(data: Any) -> list[dict]:
        """
        Accept several input shapes:
        - dict with 'data' key  → unwrap
        - list                  → use directly
        """
        if isinstance(data, dict):
            return data.get("data", [])
        if isinstance(data, list):
            return data
        raise ValueError(f"Unsupported input type: {type(data)}")

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    def process(self, data: Any) -> str:
        """
        Full pipeline: raw input → polished algorithm string.

        Parameters
        ----------
        data : dict | list
            Either ``{"data": [...]}`` or a bare list of action records.
            Each record must have an ``"action"`` key and optionally
            ``"screenshot"`` / ``"image"``.

        Returns
        -------
        str
            Numbered, human-readable algorithm.
        """
        records = self._load_input(data)
        steps: list[str] = []

        for idx, record in enumerate(records, start=1):
            action = record.get("action", {})
            logger.info("Processing record %d/%d  type=%s", idx, len(records), action.get("type"))

            screenshot_b64 = self._extract_screenshot(record)
            box_info: dict | None = None

            if screenshot_b64 and not self.skip_omniparser:
                try:
                    boxes = omni_bridge.parse_screenshot(screenshot_b64)
                    logger.debug("OmniParser found %d boxes", len(boxes))
                    box_info = event_processor.find_box(action, boxes)
                    if box_info:
                        logger.debug(
                            "Matched box: %s  dist=%.4f  method=%s",
                            box_info.get("content"), box_info.get("distance"), box_info.get("match_method"),
                        )
                    else:
                        logger.debug("No matching box found (keyboard event or no boxes)")
                except Exception as exc:
                    logger.warning("OmniParser failed for record %d: %s", idx, exc)
                    box_info = None

            # Generate natural-language step
            try:
                step = llm_client.generate_step(action, box_info)
            except Exception as exc:
                logger.error("LLM step generation failed for record %d: %s", idx, exc)
                step = self._fallback_step(action)

            logger.info("Step %d: %s", idx, step)
            steps.append(step)

        if not steps:
            return "(No actions to process)"

        # Final LLM cleanup pass
        try:
            algorithm = llm_client.refine_algorithm(steps)
        except Exception as exc:
            logger.error("LLM refinement failed: %s", exc)
            # Return numbered raw steps as fallback
            algorithm = "\n".join(f"{i+1}. {s}" for i, s in enumerate(steps))

        return algorithm

    @staticmethod
    def _fallback_step(action: dict) -> str:
        """Generate a minimal step description without calling the LLM."""
        atype = action.get("type", "UNKNOWN")
        payload = action.get("payload", {})

        if atype == "MOUSE_EVENT":
            aname = payload.get("action", "click")
            x = payload.get("position_x", "?")
            y = payload.get("position_y", "?")
            return f"{aname.capitalize()} at position ({x}, {y})"

        if atype == "KEYBOARD_EVENT":
            if "text" in payload:
                return f"Type '{payload['text']}'"
            if "key" in payload:
                return f"Press {payload['key']}"

        return f"Perform {atype}"
