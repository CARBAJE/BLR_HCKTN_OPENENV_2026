"""
config.py — Central configuration for the Action Recording Agent.
Adjust paths and thresholds here before running.
"""

import os

# ── OmniParser weights ────────────────────────────────────────────────────────
# Absolute path to the OmniParser repo (sibling folder by default)
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
OMNIPARSER_ROOT = os.path.join(_THIS_DIR, "..", "OmniParser")

SOM_MODEL_PATH = os.path.join(OMNIPARSER_ROOT, "weights", "icon_detect", "model.pt")
CAPTION_MODEL_NAME = "florence2"
CAPTION_MODEL_PATH = os.path.join(OMNIPARSER_ROOT, "weights", "icon_caption_florence")

# Detection thresholds
BOX_THRESHOLD = 0.05   # Minimum confidence to keep a detected box
IOU_THRESHOLD = 0.7    # Overlap threshold for deduplication

# ── Ollama / LLM ─────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = "http://localhost:11434/v1"
OLLAMA_API_KEY  = "ollama"          # Ollama ignores this; required by openai client
LLM_MODEL       = "llama3.1:8b"
LLM_TEMPERATURE = 0.2
LLM_MAX_TOKENS  = 512
