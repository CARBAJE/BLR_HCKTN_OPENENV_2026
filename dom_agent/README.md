# DOM Navigation Agent
Deep RL + GNN agent that navigates a simulated OS by treating the DOM as a graph.

## Architecture

```
Instruction (text)
      │
      ▼
SentenceTransformer          DOM JSON
  (all-MiniLM-L6-v2)           │
      │                         ▼
 (SBERT_DIM,)          dom_to_graph()
      │                  torch_geometric.Data
      │                  Nodes: text emb + (x,y)
      │                  Edges: hierarchy + proximity
      │                         │
      │                    NodeEncoder
      │                    (MLP, 128-d)
      │                         │
      │                    GATEncoder
      │                    (2× GATConv)
      │                         │
      └──────► PointerHead ◄────┘
               Cross-Attention
               log-softmax over N nodes
                    │
             argmax → node_idx
                    │
              (x, y) lookup
                    │
             ActionHead (CLICK /
             DOUBLE_CLICK /
             KEYBOARD_EVENT)
```

## Files

| File | Purpose |
|------|---------|
| `model.py` | Model architecture (NodeEncoder, GAT, PointerHead, ActionHead) |
| `train.py` | Imitation (BC) + RL (REINFORCE) training |
| `inference.py` | Production inference loop with `[START]/[STEP]/[END]` logs |
| `env_server.py` | FastAPI mock environment server |
| `recordings/` | JSON trajectory files for imitation learning |

## Requirements

```bash
pip install -r requirements.txt
```

> Designed for **2 vCPU / 8 GB RAM** — no GPU required.  
> `torch-geometric` CPU wheels are used; GAT runs efficiently on CPU.

## Quickstart

### 1. Start the environment server

```bash
uvicorn env_server:app --host 0.0.0.0 --port 8000
```

### 2. Imitation training (Behavioural Cloning)

```bash
python train.py \
    --mode imitation \
    --recordings_dir recordings/ \
    --epochs 30 \
    --bc_checkpoint agent_bc.pt
```

### 3. RL fine-tuning (REINFORCE)

```bash
python train.py \
    --mode rl \
    --server http://localhost:8000 \
    --pretrained agent_bc.pt \
    --episodes 500 \
    --rl_checkpoint agent_rl.pt
```

### 4. Run inference

```bash
python inference.py \
    --server http://localhost:8000 \
    --instruction "Click the Login button" \
    --weights agent_rl.pt \
    --max_steps 30
```

Expected stdout:
```
[START]
[STEP] {"step": 1, "action": "CLICK", "x": 0.75, "y": 0.85, "reward": 1.0, "done": true}
[END]
```

## Recording Format

Each trajectory JSON is a list of step dicts:

```json
[
  {
    "instruction": "Click the Login button",
    "dom": [
      {"text": "Cancel", "type": "button", "x": 0.2,  "y": 0.8},
      {"text": "Login",  "type": "button", "x": 0.75, "y": 0.85}
    ],
    "clicked_node_idx": 1,
    "action": "CLICK"
  }
]
```

Fields:
- `instruction` — natural language task description
- `dom` — list of interactive elements with normalised coordinates (0–1)
- `clicked_node_idx` — 0-based index of the element the human clicked
- `action` — one of `CLICK`, `DOUBLE_CLICK`, `KEYBOARD_EVENT`

## Variable-size DOM

The model handles DOM changes between steps automatically:
- `dom_to_graph()` rebuilds the graph fresh at each step
- GAT processes whatever N nodes are present
- Pointer Head outputs a distribution of length N (dynamic)
- If `clicked_node_idx ≥ N` it is clamped to `N-1`

## Hyperparameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| `HIDDEN_DIM` | 128 | Reduce to 64 to save RAM |
| `GAT_HEADS` | 4 | — |
| `PROX_THRESH` | 0.25 | Spatial edge threshold |
| `SBERT_DIM` | 384 | Fixed by model choice |
| `NUM_ACTIONS` | 3 | CLICK / DOUBLE_CLICK / KEYBOARD_EVENT |
