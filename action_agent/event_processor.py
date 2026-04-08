"""
event_processor.py — Geometry logic for mapping actions to UI element boxes.

Given a list of boxes (from omni_bridge.parse_screenshot) and an action's
position, finds the best-matching box using:
  1. Containment test: is the action point inside any box?
  2. Euclidean distance to box center (fallback / tie-break)
"""

import math


def _normalize_coord(value: float) -> float:
    """
    Guard: if a coordinate is clearly in pixel space (> 1.0 with large values),
    we cannot normalize without knowing screen resolution, so we clip to [0, 1].
    In practice the real input already uses 0-1, so this is a safety net.
    """
    if value > 1.0:
        # Heuristic: assume 1920x1080; caller should handle this differently if needed
        return min(value / 1920.0, 1.0)
    return max(0.0, min(1.0, value))


def _point_in_box(px: float, py: float, bbox: list) -> bool:
    """
    bbox = [cx, cy, w, h] (cxcywh, normalized 0-1).
    Returns True if (px, py) falls inside the box boundaries.
    """
    cx, cy, w, h = bbox
    x1 = cx - w / 2
    y1 = cy - h / 2
    x2 = cx + w / 2
    y2 = cy + h / 2
    return x1 <= px <= x2 and y1 <= py <= y2


def _euclidean(px: float, py: float, bbox: list) -> float:
    """Distance from point to box center."""
    cx, cy = bbox[0], bbox[1]
    return math.sqrt((px - cx) ** 2 + (py - cy) ** 2)


def find_box(action: dict, boxes: list[dict]) -> dict | None:
    """
    Find the UI element box that best matches the action's position.

    Parameters
    ----------
    action : dict
        Action record: { type, payload }.  Only MOUSE_EVENTs have positions.
    boxes : list[dict]
        Output from omni_bridge.parse_screenshot().

    Returns
    -------
    dict | None
        Best-matching box dict (with added keys 'distance' and 'match_method'),
        or None if no boxes or action has no position.
    """
    if not boxes:
        return None

    payload = action.get("payload", {})
    raw_x = payload.get("position_x")
    raw_y = payload.get("position_y")

    if raw_x is None or raw_y is None:
        # Keyboard event or action without position
        return None

    px = _normalize_coord(float(raw_x))
    py = _normalize_coord(float(raw_y))

    # 1. Containment: prefer boxes that actually contain the action point
    containing = [b for b in boxes if _point_in_box(px, py, b["bbox"])]
    if containing:
        # Among containing boxes, pick the smallest (most specific)
        best = min(containing, key=lambda b: b["bbox"][2] * b["bbox"][3])
        best = dict(best)
        best["distance"]     = _euclidean(px, py, best["bbox"])
        best["match_method"] = "containment"
        return best

    # 2. Fallback: nearest center
    best = min(boxes, key=lambda b: _euclidean(px, py, b["bbox"]))
    best = dict(best)
    best["distance"]     = _euclidean(px, py, best["bbox"])
    best["match_method"] = "euclidean"
    return best
