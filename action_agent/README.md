# Action Recording Agent

Converts a list of **OSaaS event records** (mouse/keyboard actions + screenshots) into a clean, numbered human-readable algorithm using **OmniParser** for screen element detection and **llama3.1:8b** (via Ollama) for natural-language generation.

---

## Architecture

```
action_agent/
├── __init__.py          # Package entry — exports ActionRecordingAgent
├── config.py            # Paths, thresholds, LLM settings
├── agent.py             # Main orchestration class
├── omni_bridge.py       # OmniParser integration (lazy-loaded)
├── event_processor.py   # Euclidean / containment box matching
├── llm_client.py        # OpenAI-compatible Ollama client
└── main.py              # CLI entry point
```

### Processing pipeline (per event)

```
Record
  ├─ screenshot / image (base64 / data-URI)
  │     └─ OmniParser.parse()
  │           └─ list of UI boxes  [cx, cy, w, h | type | content]
  │                 └─ find_box()  ← containment → euclidean fallback
  │                       └─ matched box_info
  └─ action { type, payload }
        └─ llm_client.generate_step(action, box_info)
              └─ "step N" string
          ...repeat for all records...
      llm_client.refine_algorithm(all_steps)
            └─ final numbered algorithm  ✓
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Python 3.11+ | Tested with 3.11 |
| OmniParser weights | `OmniParser/weights/icon_detect/model.pt` and `icon_caption_florence/` |
| Ollama | Running on `http://localhost:11434` with `llama3.1:8b` pulled |
| OmniParser deps | Installed from `OmniParser/requirements.txt` |
| `openai` pip package | `pip install openai` |

---

## Running Ollama

```bash
# Pull the model once
ollama pull llama3.1:8b

# Start the server (keep this running in a separate terminal)
ollama serve
```

---

## Usage

### From the `hackaton_blr/` root

```bash
# Full run (OmniParser + LLM)
python -m action_agent.main --input action_agent/examples/sample_events.json

# Skip OmniParser — LLM only (useful for testing without GPU / weights)
python -m action_agent.main --input action_agent/examples/sample_events.json --skip-omniparser

# Save output
python -m action_agent.main --input events.json --output algorithm.txt

# Verbose logging
python -m action_agent.main --input events.json -v

# Pipe from stdin
cat events.json | python -m action_agent.main
```

### As a Python library

```python
import sys
sys.path.insert(0, "/path/to/hackaton_blr")

from action_agent import ActionRecordingAgent

agent = ActionRecordingAgent()           # loads OmniParser on first use
# or: ActionRecordingAgent(skip_omniparser=True)  for LLM-only mode

data = {
    "data": [
        {
            "action": {
                "type": "MOUSE_EVENT",
                "payload": {"action": "click", "button": "left",
                            "position_x": 0.5, "position_y": 0.3}
            },
            "screenshot": "data:image/jpeg;base64,..."
        },
        {
            "action": {
                "type": "KEYBOARD_EVENT",
                "payload": {"action": "text", "text": "python"}
            },
            "image": "data:image/jpeg;base64,..."
        }
    ]
}

algorithm = agent.process(data)
print(algorithm)
```

---

## Input Format

```json
{
  "data": [
    {
      "action": {
        "type": "MOUSE_EVENT",
        "payload": {
          "action": "click",
          "button": "left",
          "position_x": 0.019,
          "position_y": 0.027
        }
      },
      "screenshot": "data:image/jpeg;base64,..."
    },
    {
      "action": {
        "type": "KEYBOARD_EVENT",
        "payload": { "action": "text", "text": "python" }
      },
      "image": "data:image/jpeg;base64,..."
    }
  ]
}
```

**Notes:**
- `position_x` / `position_y` are expected to be **normalized 0–1**. Values > 1 are guarded automatically.
- Use `screenshot` key for mouse events, `image` key for keyboard events (both are accepted).
- An empty `""` screenshot silently skips OmniParser and falls back to LLM-only step generation.

---

## Configuration

Edit [`config.py`](config.py) to change:

| Variable | Default | Description |
|---|---|---|
| `OMNIPARSER_ROOT` | `../OmniParser` | Path to OmniParser repo |
| `BOX_THRESHOLD` | `0.05` | Min detection confidence |
| `IOU_THRESHOLD` | `0.7` | Box deduplication overlap |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Ollama endpoint |
| `LLM_MODEL` | `llama3.1:8b` | Model name |
| `LLM_TEMPERATURE` | `0.2` | Generation temperature |
