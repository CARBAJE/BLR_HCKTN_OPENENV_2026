"""
omni_bridge.py — Thin bridge between the action agent and OmniParser.

Lazily loads the Omniparser model and exposes a single parse_screenshot()
function that takes a raw base64 / data-URI string and returns a list of
detected UI element boxes with metadata.
"""

import sys
import os
import base64

from . import config

# ── Make OmniParser importable ────────────────────────────────────────────────
_OMNI_ROOT = os.path.abspath(config.OMNIPARSER_ROOT)
if _OMNI_ROOT not in sys.path:
    sys.path.insert(0, _OMNI_ROOT)

# Lazy singleton
_parser = None


def _get_parser():
    global _parser
    if _parser is None:
        from util.omniparser import Omniparser  # noqa: relative to OMNI_ROOT

        omni_config = {
            "som_model_path":     config.SOM_MODEL_PATH,
            "caption_model_name": config.CAPTION_MODEL_NAME,
            "caption_model_path": config.CAPTION_MODEL_PATH,
            "BOX_TRESHOLD":       config.BOX_THRESHOLD,
            "iou_threshold":      config.IOU_THRESHOLD,
        }
        _parser = Omniparser(omni_config)
    return _parser


def _strip_data_uri(b64_string: str) -> str:
    """
    Remove the 'data:image/...;base64,' prefix if present,
    returning a clean base64 string.
    """
    if b64_string and "base64," in b64_string:
        return b64_string.split("base64,", 1)[1]
    return b64_string


def parse_screenshot(screenshot_b64: str) -> list[dict]:
    """
    Run OmniParser on a screenshot and return a list of UI element boxes.

    Parameters
    ----------
    screenshot_b64 : str
        Raw base64 string OR data-URI (data:image/jpeg;base64,...).
        May be empty string – callers should check before calling.

    Returns
    -------
    list[dict]
        Each dict has:
          - bbox    : [cx, cy, w, h]  – normalised 0-1 (center-x, center-y, width, height)
          - elem_type : "text" | "icon"
          - content : str | None
          - interactivity : bool
    """
    clean_b64 = _strip_data_uri(screenshot_b64)
    if not clean_b64:
        return []

    parser = _get_parser()

    # Omniparser.parse() returns (annotated_image_b64, parsed_content_list)
    # parsed_content_list is a list of dicts: {type, bbox, interactivity, content, ...}
    # bbox format from get_som_labeled_img with output_coord_in_ratio=True is xyxy (ratio),
    # then converted to cxcywh in label_coordinates. The Omniparser.parse() returns
    # parsed_content_list which is filtered_boxes_elem — these have xyxy bbox in ratio.
    # We convert to cxcywh here for consistency.

    _, parsed_content_list = parser.parse(clean_b64)

    boxes = []
    for elem in parsed_content_list:
        raw_bbox = elem.get("bbox", [])
        if len(raw_bbox) == 4:
            x1, y1, x2, y2 = raw_bbox
            cx = (x1 + x2) / 2
            cy = (y1 + y2) / 2
            w  = x2 - x1
            h  = y2 - y1
            bbox_cxcywh = [cx, cy, w, h]
        else:
            bbox_cxcywh = raw_bbox  # already processed, use as-is

        boxes.append({
            "bbox":          bbox_cxcywh,
            "elem_type":     elem.get("type", "icon"),
            "content":       elem.get("content"),
            "interactivity": elem.get("interactivity", True),
        })

    return boxes
