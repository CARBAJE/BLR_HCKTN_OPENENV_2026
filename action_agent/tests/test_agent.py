"""
test_agent.py — Unit + integration tests for the Action Recording Agent.

Run from hackaton_blr/ root:
    python -m pytest action_agent/tests/ -v
or directly:
    python action_agent/tests/test_agent.py
"""

import sys
import os
import json
import math
import unittest
from unittest.mock import patch, MagicMock

# ── Make the package importable without installing it ─────────────────────────
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# ─────────────────────────────────────────────────────────────────────────────
# Helpers / fixtures
# ─────────────────────────────────────────────────────────────────────────────

BOXES = [
    {"bbox": [0.1, 0.1, 0.08, 0.04], "elem_type": "text",  "content": "Start",   "interactivity": False},
    {"bbox": [0.5, 0.5, 0.12, 0.06], "elem_type": "icon",  "content": "Folder",  "interactivity": True},
    {"bbox": [0.9, 0.9, 0.06, 0.03], "elem_type": "text",  "content": "OK",      "interactivity": False},
]

MOUSE_ACTION = {
    "type": "MOUSE_EVENT",
    "payload": {"action": "click", "button": "left", "position_x": 0.1, "position_y": 0.1},
}

KB_TEXT_ACTION = {
    "type": "KEYBOARD_EVENT",
    "payload": {"action": "text", "text": "python"},
}

KB_KEY_ACTION = {
    "type": "KEYBOARD_EVENT",
    "payload": {"action": "key", "key": "Enter"},
}

SAMPLE_RECORDS = [
    {"action": MOUSE_ACTION,    "screenshot": ""},
    {"action": KB_TEXT_ACTION,  "image": ""},
    {"action": KB_KEY_ACTION,   "image": ""},
]

SAMPLE_INPUT = {"data": SAMPLE_RECORDS}


# ─────────────────────────────────────────────────────────────────────────────
# 1. event_processor tests
# ─────────────────────────────────────────────────────────────────────────────

class TestEventProcessor(unittest.TestCase):
    """Tests for event_processor.find_box() — no external deps needed."""

    def setUp(self):
        from action_agent import event_processor  # noqa
        self.ep = event_processor

    # ── Containment ───────────────────────────────────────────────────────────

    def test_point_inside_box_returns_containment(self):
        """Exact center of box[0] should be matched by containment."""
        action = {
            "type": "MOUSE_EVENT",
            "payload": {"action": "click", "position_x": 0.1, "position_y": 0.1},
        }
        result = self.ep.find_box(action, BOXES)
        self.assertIsNotNone(result)
        self.assertEqual(result["match_method"], "containment")
        self.assertEqual(result["content"], "Start")

    def test_point_inside_box_picks_smallest_containing_box(self):
        """When multiple boxes contain the point, pick the smallest area."""
        overlapping_boxes = [
            {"bbox": [0.5, 0.5, 0.4, 0.4],  "elem_type": "icon", "content": "Big",   "interactivity": True},
            {"bbox": [0.5, 0.5, 0.05, 0.05], "elem_type": "icon", "content": "Small", "interactivity": True},
        ]
        action = {
            "type": "MOUSE_EVENT",
            "payload": {"action": "click", "position_x": 0.5, "position_y": 0.5},
        }
        result = self.ep.find_box(action, overlapping_boxes)
        self.assertEqual(result["content"], "Small")

    # ── Euclidean fallback ────────────────────────────────────────────────────

    def test_point_outside_all_boxes_nearest_center(self):
        """Point not contained by any box → nearest center wins (Folder is closest)."""
        # Folder center (0.5, 0.5); Start center (0.1, 0.1); OK center (0.9, 0.9)
        # (0.4, 0.35) dist-to-Folder≈0.180, dist-to-Start≈0.354, dist-to-OK≈0.742
        action = {
            "type": "MOUSE_EVENT",
            "payload": {"action": "click", "position_x": 0.4, "position_y": 0.35},
        }
        result = self.ep.find_box(action, BOXES)
        self.assertIsNotNone(result)
        self.assertEqual(result["match_method"], "euclidean")
        self.assertEqual(result["content"], "Folder")

    def test_nearest_center_distance_is_correct(self):
        """Reported distance matches manual euclidean computation."""
        px, py = 0.4, 0.35
        action = {
            "type": "MOUSE_EVENT",
            "payload": {"action": "click", "position_x": px, "position_y": py},
        }
        result = self.ep.find_box(action, BOXES)
        cx, cy = BOXES[1]["bbox"][0], BOXES[1]["bbox"][1]   # Folder box center
        expected = math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
        self.assertAlmostEqual(result["distance"], expected, places=6)

    # ── Keyboard / no-position ────────────────────────────────────────────────

    def test_keyboard_action_returns_none(self):
        """Keyboard events have no position → find_box returns None."""
        result = self.ep.find_box(KB_TEXT_ACTION, BOXES)
        self.assertIsNone(result)

    def test_empty_boxes_returns_none(self):
        result = self.ep.find_box(MOUSE_ACTION, [])
        self.assertIsNone(result)

    # ── Normalization guard ───────────────────────────────────────────────────

    def test_pixel_coords_normalized(self):
        """Coords > 1 are normalized (guard) and still produce a result."""
        action = {
            "type": "MOUSE_EVENT",
            "payload": {"action": "click", "position_x": 1920 * 0.5, "position_y": 1080 * 0.5},
        }
        result = self.ep.find_box(action, BOXES)
        self.assertIsNotNone(result)  # should not crash

    def test_zero_coords_works(self):
        action = {
            "type": "MOUSE_EVENT",
            "payload": {"action": "click", "position_x": 0.0, "position_y": 0.0},
        }
        result = self.ep.find_box(action, BOXES)
        self.assertIsNotNone(result)


# ─────────────────────────────────────────────────────────────────────────────
# 2. omni_bridge tests
# ─────────────────────────────────────────────────────────────────────────────

class TestOmniBridge(unittest.TestCase):
    """Tests for omni_bridge helper functions (no model loading)."""

    def setUp(self):
        # Import the module but do NOT trigger the lazy singleton
        import action_agent.omni_bridge as ob
        self.ob = ob

    def test_strip_data_uri_with_prefix(self):
        b64 = self.ob._strip_data_uri("data:image/jpeg;base64,AAAA")
        self.assertEqual(b64, "AAAA")

    def test_strip_data_uri_without_prefix(self):
        b64 = self.ob._strip_data_uri("AAAA")
        self.assertEqual(b64, "AAAA")

    def test_strip_data_uri_empty(self):
        b64 = self.ob._strip_data_uri("")
        self.assertEqual(b64, "")

    def test_parse_screenshot_empty_string_returns_empty_list(self):
        """Empty screenshot must NOT call or load OmniParser."""
        result = self.ob.parse_screenshot("")
        self.assertEqual(result, [])

    def test_parse_screenshot_data_uri_only_prefix_returns_empty(self):
        """A data-URI with no payload after 'base64,' → empty."""
        result = self.ob.parse_screenshot("data:image/jpeg;base64,")
        self.assertEqual(result, [])

    @patch("action_agent.omni_bridge._get_parser")
    def test_parse_screenshot_calls_parser_with_clean_b64(self, mock_get_parser):
        """parse_screenshot must strip the data-URI prefix before calling .parse()."""
        mock_parser = MagicMock()
        mock_parser.parse.return_value = (
            "annotated_b64",
            [{"type": "text", "bbox": [0.1, 0.1, 0.2, 0.2], "interactivity": False, "content": "Hi"}],
        )
        mock_get_parser.return_value = mock_parser

        self.ob.parse_screenshot("data:image/jpeg;base64,REALDATA")
        called_arg = mock_parser.parse.call_args[0][0]
        self.assertEqual(called_arg, "REALDATA")

    @patch("action_agent.omni_bridge._get_parser")
    def test_parse_screenshot_converts_bbox_to_cxcywh(self, mock_get_parser):
        """Boxes returned by OmniParser (xyxy) are converted to cxcywh."""
        mock_parser = MagicMock()
        # xyxy: x1=0.1, y1=0.2, x2=0.3, y2=0.4
        mock_parser.parse.return_value = (
            "img",
            [{"type": "icon", "bbox": [0.1, 0.2, 0.3, 0.4], "interactivity": True, "content": None}],
        )
        mock_get_parser.return_value = mock_parser

        boxes = self.ob.parse_screenshot("SOMEDATA")
        self.assertEqual(len(boxes), 1)
        cx, cy, w, h = boxes[0]["bbox"]
        self.assertAlmostEqual(cx, 0.2)
        self.assertAlmostEqual(cy, 0.3)
        self.assertAlmostEqual(w,  0.2)
        self.assertAlmostEqual(h,  0.2)


# ─────────────────────────────────────────────────────────────────────────────
# 3. agent.py tests (mocking LLM + OmniParser)
# ─────────────────────────────────────────────────────────────────────────────

class TestActionRecordingAgent(unittest.TestCase):
    """Integration tests for the agent orchestrator."""

    def setUp(self):
        from action_agent.agent import ActionRecordingAgent
        self.AgentClass = ActionRecordingAgent

    # ── Input loading ─────────────────────────────────────────────────────────

    def test_load_input_from_dict_with_data_key(self):
        agent = self.AgentClass(skip_omniparser=True)
        records = agent._load_input({"data": [{"action": {}}]})
        self.assertEqual(len(records), 1)

    def test_load_input_from_bare_list(self):
        agent = self.AgentClass(skip_omniparser=True)
        records = agent._load_input([{"action": {}}, {"action": {}}])
        self.assertEqual(len(records), 2)

    def test_load_input_unsupported_type_raises(self):
        agent = self.AgentClass(skip_omniparser=True)
        with self.assertRaises(ValueError):
            agent._load_input("invalid")

    # ── Screenshot extraction ─────────────────────────────────────────────────

    def test_extract_screenshot_from_screenshot_key(self):
        agent = self.AgentClass(skip_omniparser=True)
        record = {"screenshot": "data:image/jpeg;base64,ABC", "action": {}}
        self.assertEqual(agent._extract_screenshot(record), "data:image/jpeg;base64,ABC")

    def test_extract_screenshot_from_image_key(self):
        agent = self.AgentClass(skip_omniparser=True)
        record = {"image": "data:image/jpeg;base64,XYZ", "action": {}}
        self.assertEqual(agent._extract_screenshot(record), "data:image/jpeg;base64,XYZ")

    def test_extract_screenshot_prefers_screenshot_over_image(self):
        agent = self.AgentClass(skip_omniparser=True)
        record = {"screenshot": "SCREEN", "image": "IMG", "action": {}}
        self.assertEqual(agent._extract_screenshot(record), "SCREEN")

    def test_extract_screenshot_missing_returns_empty(self):
        agent = self.AgentClass(skip_omniparser=True)
        self.assertEqual(agent._extract_screenshot({"action": {}}), "")

    # ── Fallback steps ────────────────────────────────────────────────────────

    def test_fallback_step_mouse_click(self):
        agent = self.AgentClass(skip_omniparser=True)
        step = agent._fallback_step({
            "type": "MOUSE_EVENT",
            "payload": {"action": "click", "position_x": 0.5, "position_y": 0.3},
        })
        self.assertIn("0.5", step)
        self.assertIn("0.3", step)

    def test_fallback_step_keyboard_text(self):
        agent = self.AgentClass(skip_omniparser=True)
        step = agent._fallback_step(KB_TEXT_ACTION)
        self.assertIn("python", step)

    def test_fallback_step_keyboard_key(self):
        agent = self.AgentClass(skip_omniparser=True)
        step = agent._fallback_step(KB_KEY_ACTION)
        self.assertIn("Enter", step)

    # ── Full process (LLM mocked) ─────────────────────────────────────────────

    @patch("action_agent.llm_client.refine_algorithm", return_value="1. Mocked refinement")
    @patch("action_agent.llm_client.generate_step",    return_value="Mocked step")
    def test_process_returns_string(self, mock_step, mock_refine):
        agent = self.AgentClass(skip_omniparser=True)
        result = agent.process(SAMPLE_INPUT)
        self.assertIsInstance(result, str)
        self.assertEqual(result, "1. Mocked refinement")

    @patch("action_agent.llm_client.refine_algorithm", return_value="Refined")
    @patch("action_agent.llm_client.generate_step",    return_value="A step")
    def test_process_calls_generate_step_for_each_record(self, mock_step, mock_refine):
        agent = self.AgentClass(skip_omniparser=True)
        agent.process(SAMPLE_INPUT)
        self.assertEqual(mock_step.call_count, len(SAMPLE_RECORDS))

    @patch("action_agent.llm_client.refine_algorithm", return_value="Refined")
    @patch("action_agent.llm_client.generate_step",    return_value="A step")
    def test_process_calls_refine_once(self, mock_step, mock_refine):
        agent = self.AgentClass(skip_omniparser=True)
        agent.process(SAMPLE_INPUT)
        mock_refine.assert_called_once()

    @patch("action_agent.llm_client.refine_algorithm", side_effect=ConnectionError("Ollama offline"))
    @patch("action_agent.llm_client.generate_step",    return_value="A step")
    def test_process_survives_refinement_failure(self, mock_step, mock_refine):
        """If final LLM pass fails, raw numbered steps are returned."""
        agent = self.AgentClass(skip_omniparser=True)
        result = agent.process(SAMPLE_INPUT)
        self.assertIn("1.", result)

    @patch("action_agent.llm_client.refine_algorithm", return_value="Refined")
    @patch("action_agent.llm_client.generate_step",    side_effect=ConnectionError("Ollama offline"))
    def test_process_survives_step_generation_failure(self, mock_step, mock_refine):
        """If per-step LLM fails, fallback step is used and processing continues."""
        agent = self.AgentClass(skip_omniparser=True)
        result = agent.process(SAMPLE_INPUT)
        self.assertIsInstance(result, str)

    def test_process_empty_input_returns_message(self):
        agent = self.AgentClass(skip_omniparser=True)
        result = agent.process({"data": []})
        self.assertIn("No actions", result)

    @patch("action_agent.llm_client.refine_algorithm", return_value="Done")
    @patch("action_agent.llm_client.generate_step",    return_value="Step")
    def test_process_accepts_bare_list(self, mock_step, mock_refine):
        agent = self.AgentClass(skip_omniparser=True)
        result = agent.process([{"action": MOUSE_ACTION, "screenshot": ""}])
        self.assertEqual(result, "Done")


# ─────────────────────────────────────────────────────────────────────────────
# 4. llm_client prompt-building tests (no actual Ollama call)
# ─────────────────────────────────────────────────────────────────────────────

class TestLLMClient(unittest.TestCase):

    def setUp(self):
        import action_agent.llm_client as lc
        self.lc = lc

    @patch("action_agent.llm_client._get_client")
    def test_generate_step_called_with_correct_model(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="  Click Start  "))]
        )
        mock_get_client.return_value = mock_client

        from action_agent import config
        result = self.lc.generate_step(MOUSE_ACTION, BOXES[0])

        call_kwargs = mock_client.chat.completions.create.call_args[1]
        self.assertEqual(call_kwargs["model"], config.LLM_MODEL)
        self.assertEqual(result, "Click Start")   # strip() applied

    @patch("action_agent.llm_client._get_client")
    def test_generate_step_no_box_uses_fallback_prompt(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Type python"))]
        )
        mock_get_client.return_value = mock_client

        result = self.lc.generate_step(KB_TEXT_ACTION, None)  # box_info=None
        user_msg = mock_client.chat.completions.create.call_args[1]["messages"][1]["content"]
        self.assertIn("no screenshot", user_msg)
        self.assertEqual(result, "Type python")

    @patch("action_agent.llm_client._get_client")
    def test_refine_algorithm_numbers_steps(self, mock_get_client):
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="1. Open Terminal\n2. Run python"))]
        )
        mock_get_client.return_value = mock_client

        result = self.lc.refine_algorithm(["Open Terminal", "Run python"])
        user_msg = mock_client.chat.completions.create.call_args[1]["messages"][1]["content"]
        self.assertIn("1. Open Terminal", user_msg)
        self.assertIn("2. Run python", user_msg)
        self.assertEqual(result, "1. Open Terminal\n2. Run python")


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    unittest.main(verbosity=2)
