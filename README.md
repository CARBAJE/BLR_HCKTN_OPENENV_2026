---
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

# OpenEnv React OS

A simulated Operating System environment for training GUI agents via Reinforcement Learning. The OS exposes a structured HTTP API so that agents can observe the desktop as a DOM graph, issue mouse/keyboard actions, and receive reward signals — all without a real browser.

---

## Components

| Component | Description |
|---|---|
| `OSaaS/` | React + Vite OS simulator — the RL environment server |
| `dom_agent/` | PyTorch GNN + RL agent (GAT + PointerHead) that navigates the OS |
| `action_agent/` | Recording agent — converts event logs into human-readable algorithms |

---

## Docker (Hugging Face Spaces)

The Space runs the environment API server on port `8000`.

```bash
docker build -t openenv-react-os .
docker run -p 8000:8000 openenv-react-os
```

The container exposes:
- `GET  /health` — liveness probe
- All RL endpoints (see API section below)

---

## RL Environment API

Base URL: `http://localhost:5173` (dev) / `http://localhost:8000` (Docker)

### POST /reset

Starts a new episode with a randomly selected task.

```bash
curl -X POST http://localhost:5173/reset
# {"status": "ok"}
```

Pass `{ "instruction": "Open the Terminal" }` in the body to fix the task instead of randomizing it.

### GET /state

Returns the current DOM snapshot and active instruction.

```bash
curl http://localhost:5173/state
```

```json
{
  "instruction": "Open the Terminal",
  "dom": [
    { "text": "Start",    "type": "button", "x": 0.023, "y": 0.958 },
    { "text": "Terminal", "type": "icon",   "x": 0.039, "y": 0.083 }
  ]
}
```

Each DOM element has:
- `text` — human-readable label
- `type` — `button`, `icon`, `menuitem`, `tab`, `input`, `window`, …
- `x`, `y` — normalized coordinates (0–1) relative to 1280×720

### POST /step

Executes an action and returns the reward.

```bash
curl -X POST http://localhost:5173/step \
  -H "Content-Type: application/json" \
  -d '{"action": "DOUBLE_CLICK", "x": 0.039, "y": 0.083, "node_idx": 1}'
```

```json
{ "reward": 1.0, "done": true }
```

| Field | Type | Description |
|---|---|---|
| `action` | string | `CLICK`, `DOUBLE_CLICK`, or `KEYBOARD_EVENT` |
| `x`, `y` | float 0–1 | Normalized click coordinates |
| `node_idx` | int | Index in the DOM array from the last `/state` call |

Episodes terminate when `done: true` or after 30 steps.

### Reward components

| Component | Max | Condition |
|---|---|---|
| Element × action match | 1.0 | Correct element clicked with correct action type |
| Visibility bonus | 0.05 | Target became visible after action |
| State change | 0.03 | OS state reference changed |
| Proximity | 0.10 | Click within 0.3 normalized distance of target |
| Exploration | 0.12 | New icons appeared (0.04 × new icons, cap 3) |

> Desktop icons require `DOUBLE_CLICK`; everything else uses `CLICK`.

### Available tasks

| Instruction | Target element |
|---|---|
| Click the Start button | Start |
| Open the Terminal | Terminal |
| Open the Explorer | This PC |
| Open System Settings | System Settings |
| Open the Downloads folder | Downloads |
| Open the Recycle Bin | Recycle Bin |

---

## Multi-Instance API

For agents using a real browser or running parallel episodes:

```bash
# Create an instance
curl -X POST http://localhost:5173/api/createOS
# {"ok": true, "instanceId": "550e8400-..."}

# Execute a command
curl -X POST http://localhost:5173/api/execute \
  -H "Content-Type: application/json" \
  -d '{"instanceId": "550e8400-...", "type": "MOUSE_EVENT", "payload": {"action": "CLICK", "position_x": 30, "position_y": 30}}'

# Destroy the instance
curl -X POST http://localhost:5173/api/destroyOS \
  -d '{"instanceId": "550e8400-..."}'
```

See `OSaaS/API.md` for the full reference.

---

## DOM Navigation Agent (`dom_agent/`)

A Graph Attention Network agent trained with Behavioural Cloning + REINFORCE.

### Architecture

```
Instruction (text)
      │
SentenceTransformer (all-MiniLM-L6-v2)
      │ 384-d
      │                DOM JSON list
      │                     │
      │               dom_to_graph()
      │               torch_geometric.Data
      │               Nodes: text_emb(384) + (x, y)
      │               Edges: sequential + spatial proximity
      │                     │
      │               NodeEncoder (MLP → 128-d)
      │                     │
      │               GATEncoder (2× GATConv, 4 heads)
      │                     │
      └──────► PointerHead (cross-attention)
               log-softmax over N nodes  (dynamic)
                    │
               ActionHead → CLICK / DOUBLE_CLICK / KEYBOARD_EVENT
```

### Setup

```bash
cd dom_agent
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

### Training

```bash
# Behavioural Cloning
python train.py --mode imitation \
    --recordings_dir recordings/ \
    --epochs 50 \
    --bc_checkpoint agent_bc.pt

# RL fine-tuning (OSaaS must be running)
python train.py --mode rl \
    --server http://localhost:5173 \
    --pretrained agent_bc.pt \
    --episodes 1000 \
    --rl_checkpoint agent_rl.pt
```

### Inference

```bash
python inference.py \
    --server http://localhost:5173 \
    --instruction "Open the Terminal" \
    --weights agent_rl.pt
```

Output format (OpenEnv log):
```
[START]
[STEP] {"step": 1, "action": "DOUBLE_CLICK", "target": {"index": 1, "text": "Terminal", "type": "icon"}, "x": 0.039, "y": 0.083, "reward": 1.0, "done": true}
[END]
```

### Hyperparameters

| Parameter | Default |
|---|---|
| `HIDDEN_DIM` | 128 |
| `GAT_HEADS` | 4 |
| `PROX_THRESH` | 0.25 |
| `SBERT_DIM` | 384 |
| `NUM_ACTIONS` | 3 |

> No GPU required — designed for 2 vCPU / 8 GB RAM.

---

## Quick Python Loop

```python
import requests

BASE = "http://localhost:5173"
requests.post(f"{BASE}/reset", json={"instruction": "Open the Terminal"})

for step in range(30):
    state = requests.get(f"{BASE}/state").json()
    dom, instruction = state["dom"], state["instruction"]

    # your agent picks node_idx here
    node_idx = 0

    result = requests.post(f"{BASE}/step", json={
        "action":   "CLICK",
        "x":        dom[node_idx]["x"],
        "y":        dom[node_idx]["y"],
        "node_idx": node_idx,
    }).json()

    print(f"[STEP {step+1}] reward={result['reward']} done={result['done']}")
    if result["done"]:
        break
```

---

## Repository Structure

```
.
├── OSaaS/              # React+Vite OS simulator + RL API server
│   ├── src/
│   │   ├── kernel/     # reducer.js, initialState.js (pure, Node-compatible)
│   │   └── components/ # React desktop UI
│   ├── vite.config.js  # Vite plugin with all HTTP routes + HeadlessOS
│   └── API.md          # Full API reference
├── dom_agent/          # GNN+RL agent
│   ├── model.py
│   ├── train.py
│   ├── inference.py
│   └── recordings/     # Trajectory JSON files for imitation learning
├── action_agent/       # Event-to-algorithm recording agent
├── Dockerfile          # Docker image for HF Spaces
└── README.md
```

---

## License

MIT
