# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HackathonIndia project with two components:
- **`OSaaS/`** — React+Vite OS simulator that acts as the RL training environment
- **`dom_agent/`** — PyTorch GNN+RL agent that learns to navigate the simulated OS

The agent observes the OS as a DOM graph, selects an element (node) and an action (CLICK / DOUBLE_CLICK / KEYBOARD_EVENT), and receives a reward signal from the environment.

---

## OSaaS (Environment Server)

### Commands
```bash
cd OSaaS
npm install          # install dependencies
npm run dev          # start dev server at http://localhost:5173
npm run build        # production build
npm run lint         # ESLint on src/
```

### Architecture

The Vite dev server (`vite.config.js`) is also the RL environment API. A custom Vite plugin (`osaasApiPlugin`) handles all HTTP routes:

**RL training endpoints (headless — no browser required):**
- `POST /reset` — reset episode; accepts `{ instruction }` body to fix the task
- `GET /state` — returns `{ dom, instruction }` where `dom` is a list of `{ text, type, x, y }`
- `POST /step` — accepts `{ action, node_idx, x, y }`; returns `{ reward, done, info }`

**Multi-instance browser API (for external agents using a real browser):**
- `POST /api/createOS` → `{ instanceId }`
- `POST /api/execute` — dispatches reducer actions to a browser instance
- `GET /api/poll?instanceId=` — browser polls this to receive pending commands
- `POST /api/result` — browser posts command results back

**Viewer:**
- `GET /rl-viewer` — redirects to `rl-viewer.html`, which polls `/rl/episode` and `/rl/os-state` every 500 ms to show a live OS snapshot during training

### State machine

The OS runs as a pure reducer in two modes:
1. **Browser mode** (`src/kernel/reducer.js` + `OSContext.jsx`): React state via `useReducer`; `useAPIBridge.js` polls `/api/poll` and calls `executeCommand` / `getElementMap` (real `getBoundingClientRect` DOM reads)
2. **Headless mode** (`HeadlessOS` class in `vite.config.js`): same `reducer.js` imported into Node.js; derives a synthetic DOM layout from state geometry without any browser. Used by all RL endpoints.

`createInitialState()` in `src/kernel/initialState.js` generates a randomized visual config (taskbar position, accent colour, wallpaper) and a synthetic filesystem. Downloads always contains `python-3.12.0-amd64.exe`.

### Reward components (all clamped to `[0, 1]`)
| Component | Max | Condition |
|---|---|---|
| `element_score × action_score` | 1.0 | Clicked correct element with correct action type |
| `visibility_bonus` | 0.05 | Target became visible after the action |
| `state_change` | 0.03 | OS state object reference changed |
| `proximity` | 0.1 | Clicked near (< 0.3 norm) the target element |
| `exploration` | 0.12 | New icons appeared (0.04 per new icon, cap 3) |

Desktop icons require `DOUBLE_CLICK`; everything else uses `CLICK`.

### RL Tasks
Defined in `RL_TASKS` array in `vite.config.js`. Each entry has `{ instruction, targetText }`. `POST /reset` matches the caller's instruction against this list (exact → keyword → last-word fallback).

---

## dom_agent (Agent)

### Setup
```bash
cd dom_agent
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Commands
```bash
# Behavioural Cloning on trajectory recordings
python train.py --mode imitation --recordings_dir recordings/ --epochs 50 --bc_checkpoint agent_bc.pt

# RL fine-tuning (OSaaS must be running)
python train.py --mode rl --server http://localhost:5173 \
    --pretrained agent_bc.pt --episodes 1000 --rl_checkpoint agent_rl.pt

# Inference (OSaaS must be running)
python inference.py --server http://localhost:5173 \
    --instruction "Open the Terminal" --weights agent_rl.pt

# Stochastic inference (samples action distribution instead of argmax)
python inference.py ... --stochastic
```

### Model architecture (`model.py`)
```
Instruction string
      │
SentenceTransformer (all-MiniLM-L6-v2, SBERT_DIM=384)
      │
 (SBERT_DIM,)         DOM JSON list
                           │
                     dom_to_graph()
                     torch_geometric.Data
                     node feats = text_emb (384) + (x, y)
                     edges = sequential + spatial proximity (PROX_THRESH=0.25)
                           │
                     NodeEncoder (MLP 386→128)
                           │
                     GATEncoder (2× GATConv, 4 heads, HIDDEN_DIM=128)
                           │
              PointerHead (cross-attention instruction vs nodes)
              → log-softmax over N nodes  (dynamic size)
                           │
                     ActionHead (linear, 3 classes)
                     CLICK / DOUBLE_CLICK / KEYBOARD_EVENT
```

`DEVICE` is auto-detected (`cuda` if available, else `cpu`). All tensors and the model are moved to `DEVICE`. SentenceTransformer is initialized with `device=str(DEVICE)`. Tensor outputs from SentenceTransformer must be `.clone()`'d before use in autograd (inference_mode boundary).

### Training details (`train.py`)
- **BC**: `AdamW`, node loss weight 0.8 / action loss weight 0.2, instruction augmentation (8 paraphrases per sample)
- **RL**: REINFORCE with entropy regularization (`entropy_coef=0.05`), moving-average baseline (`baseline_alpha=0.05`), `REPEAT_PENALTY=-0.2` applied when the same `node_idx` is chosen consecutively
- Action type is **sampled** (not argmax) during RL rollout to allow DOUBLE_CLICK exploration

### Recording format (`recordings/`)
```json
[
  {
    "instruction": "Click the Login button",
    "dom": [{"text": "Login", "type": "button", "x": 0.75, "y": 0.85}],
    "clicked_node_idx": 0,
    "action": "CLICK"
  }
]
```

### Inference output format
```
[START]
[STEP] {"step": 1, "action": "CLICK", "target": {"index": 0, "text": "...", "type": "button"}, "x": 0.75, "y": 0.85, "reward": 1.0, "done": true}
[END]
```
`[START]`/`[STEP]`/`[END]` is the required OpenEnv log format for the hackathon.

---

## Key cross-cutting constraints

- **Rewards must be in `[0, 1]`** — enforced via `Math.min(1.0, ...)` in `/step`. The `-0.2` repeat penalty is training-only (applied in `train.py` after receiving the env reward).
- **`reducer.js` and `initialState.js` must stay pure** (no DOM APIs, no browser globals) so they can be imported by Node.js in `vite.config.js`.
- **HeadlessOS version counter** increments only when `this.state !== prevState` (reference check). `CLOSE_START` on an already-closed menu must be guarded by `if (this.state.startMenuOpen)` to avoid false-positive state-change rewards.
- **Variable-size DOM**: the model rebuilds the graph at every step; `node_idx` is relative to the DOM snapshot at that step.
