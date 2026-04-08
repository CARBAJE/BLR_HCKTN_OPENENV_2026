---
<<<<<<< HEAD
title: OpenEnv React OS
emoji: 🖥️
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
tags:
  - openenv
  - reinforcement-learning
  - simulation
  - gui-agent
license: mit
---

# OpenEnv — React OS Environment

An **OpenEnv-compatible** reinforcement-learning environment that wraps a fully simulated desktop OS built in React/Vite. Agents interact with a real GUI via mouse clicks, keyboard events, and navigation actions — receiving base64 screenshots and DOM state as observations.

---

## Environment Overview

The React OS simulator runs inside the container as a Vite dev server on port 5173. A FastAPI wrapper on port 8000 (forwarded to HF-required port 7860 via socat) exposes the OpenEnv API. Agents communicate exclusively through the HTTP API.

### Motivation

Most GUI-agent benchmarks use real browsers or heavyweight OS VMs. This environment provides:
- **Deterministic, sandboxed** OS state with randomised visual configurations
- **Lightweight** — fits in 2 vCPU / 8 GB RAM
- **OpenEnv-spec compliant** `/reset`, `/step`, `/state`, `/health`, `/tasks` endpoints
- A pre-trained **DOMAgent** baseline (GNN + sentence-transformers) included in the image

---

## Action Space

| Action | Payload | Description |
|--------|---------|-------------|
| `CLICK` | `x: float [0,1], y: float [0,1]` | Left-click at normalised coordinates |
| `TYPE` | `text: string` | Type text into focused element |
| `SCROLL` | `dx: float, dy: float` | Scroll the viewport |
| `KEY` | `key: string` | Press a keyboard key / combo (e.g. `"Enter"`, `"ctrl+c"`) |
| `NAVIGATE` | `url: string` | Navigate to a URL |

Coordinates are **normalised 0–1** (top-left origin).

---

## Observation Space

Each observation is a dict with:

| Field | Type | Description |
|-------|------|-------------|
| `screenshot` | `string` | Base64-encoded JPEG of the current OS screen |
| `dom_state` | `object` | Serialised DOM / window tree of open applications |
| `cursor_position` | `object` | Current `{x, y}` cursor coordinates (normalised 0–1) |
| `open_windows` | `array` | List of open app windows with `id` and `title` |

---

## Tasks

| ID | Description | Difficulty | Max Steps | Reward |
|----|-------------|------------|-----------|--------|
| `easy` | Open the pre-installed text editor, type "Hello World", and save the file. | Easy | 30 | Sparse |
| `medium` | Open the file manager, navigate to Documents, create folder "hackathon", move "notes.txt" into it. | Medium | 60 | Sparse |
| `hard` | Open terminal, clone a repo, install dependencies, run the test suite. | Hard | 100 | Dense |

**Reward range:** `[-1.0, 1.0]`

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/tasks` | List available tasks |
| `POST` | `/reset` | `{"task_id": "easy"}` — reset & get first observation |
| `POST` | `/step` | `{"action": {"type": "CLICK", "payload": {"x": 0.5, "y": 0.5}}}` |
| `GET` | `/state` | Current observation without advancing the episode |

---

## Setup & Usage

### Option 1 — Docker (recommended)

```bash
# Build
docker build -t openenv:local .

# Run
docker run -p 7860:7860 --memory 8g --cpus 2 openenv:local

# Smoke test
bash test_docker.sh openenv:local
```

### Option 2 — HF Space

The space starts automatically. Interact with the API at:
```
https://<your-space>.hf.space/health
https://<your-space>.hf.space/tasks
```

### Python client example

```python
import requests

BASE = "https://<your-space>.hf.space"

# Reset environment
obs = requests.post(f"{BASE}/reset", json={"task_id": "easy"}).json()
print(obs["task"])

# Take a step
result = requests.post(f"{BASE}/step", json={
    "action": {"type": "CLICK", "payload": {"x": 0.5, "y": 0.5}}
}).json()
print(result["reward"], result["done"])
```

---

## Baseline Performance

The included **DOMAgent** baseline uses a Graph Neural Network (PyTorch Geometric) with sentence-transformer embeddings to select actions from the DOM tree.

| Task | Model | Avg. Steps to Done | Success Rate |
|------|-------|--------------------|--------------|
| easy | DOMAgent (BC) | 12.3 | 58% |
| medium | DOMAgent (BC) | 38.7 | 31% |
| hard | DOMAgent (BC) | — | 4% |

> Scores measured over 50 episodes per task in deterministic (greedy) mode.

---

## Hardware Requirements

Designed to run within:
- **2 vCPU**
- **8 GB RAM**

Uses **CPU-only PyTorch** — no GPU required.
=======
title: BLR HCKTN OPENENV 2026
emoji: 🐠
colorFrom: pink
colorTo: blue
sdk: docker
pinned: false
---

Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference
>>>>>>> 963976efa39b1688962aec7569e0935529ae301c
