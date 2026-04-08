"""
model.py — DOM Navigation Agent
Architecture:
  1. DOM JSON  →  torch_geometric graph
  2. Node Encoder  (text embedding + coordinates)
  3. GAT  (2 layers of GATConv)
  4. Pointer Head  (cross-attention: instruction vs node vectors)
  5. Action Head  (linear classifier)
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor
from torch_geometric.data import Data
from torch_geometric.nn import GATConv
from sentence_transformers import SentenceTransformer

# ── Constants ────────────────────────────────────────────────────────────────
SBERT_MODEL  = "all-MiniLM-L6-v2"
SBERT_DIM    = 384          # output dim of all-MiniLM-L6-v2
COORD_DIM    = 2            # (x, y)
HIDDEN_DIM   = 128          # internal hidden size  (CPU-friendly)
GAT_HEADS    = 4
NUM_ACTIONS  = 3            # CLICK, DOUBLE_CLICK, KEYBOARD_EVENT
PROX_THRESH  = 0.25         # spatial proximity edge threshold (normalised)

ACTION_MAP   = {0: "CLICK", 1: "DOUBLE_CLICK", 2: "KEYBOARD_EVENT"}

# ── Device ───────────────────────────────────────────────────────────────────
DEVICE = torch.device("cpu" if torch.cuda.is_available() else "cpu")


# ── Text encoder (shared, loaded once) ───────────────────────────────────────
class TextEncoder:
    """Thin wrapper around SentenceTransformer that returns torch tensors."""

    _instance: Optional["TextEncoder"] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._model = SentenceTransformer(SBERT_MODEL, device=str(DEVICE))
            cls._instance._model.eval()
        return cls._instance

    @torch.no_grad()
    def encode(self, texts: List[str]) -> Tensor:
        """Returns (N, SBERT_DIM) float32 tensor on DEVICE."""
        embs = self._model.encode(
            texts,
            convert_to_tensor=True,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        # .clone() breaks out of inference_mode so tensors can be used in autograd
        return embs.to(DEVICE).clone()


# ── Graph builder ─────────────────────────────────────────────────────────────
def dom_to_graph(dom_elements: List[Dict]) -> Data:
    """
    Convert a list of DOM element dicts to a torch_geometric Data object.

    Each element: {"text": str, "type": str, "x": float, "y": float}

    Edges:
      • Sequential / tree hierarchy: i → i+1  (approximates DOM order)
      • Spatial proximity: bidirectional edge when Euclidean dist < PROX_THRESH
    """
    encoder = TextEncoder()
    n = len(dom_elements)

    # ── Node features ──────────────────────────────────────────────────────
    texts  = [el.get("text", "") or "" for el in dom_elements]
    coords = torch.tensor(
        [[el.get("x", 0.0), el.get("y", 0.0)] for el in dom_elements],
        dtype=torch.float,
        device=DEVICE,
    )  # (N, 2)

    text_embs = encoder.encode(texts)       # (N, SBERT_DIM) on DEVICE
    node_feats = torch.cat([text_embs, coords], dim=1)  # (N, SBERT_DIM+2)

    # ── Edges ──────────────────────────────────────────────────────────────
    src, dst = [], []

    # Sequential edges (tree hierarchy approximation)
    for i in range(n - 1):
        src += [i, i + 1]
        dst += [i + 1, i]

    # Spatial proximity edges
    coords_cpu = coords.cpu()               # proximity loop on CPU is fine
    for i in range(n):
        for j in range(i + 1, n):
            xi, yi = coords_cpu[i]
            xj, yj = coords_cpu[j]
            dist = math.sqrt((xi - xj) ** 2 + (yi - yj) ** 2)
            if dist < PROX_THRESH:
                src += [i, j]
                dst += [j, i]

    if src:
        edge_index = torch.tensor([src, dst], dtype=torch.long, device=DEVICE)
    else:
        # Isolated node: self-loops to avoid empty edge_index
        edge_index = torch.zeros((2, n), dtype=torch.long, device=DEVICE)
        edge_index[1] = torch.arange(n, device=DEVICE)

    # Store raw info for coordinate lookup later
    data = Data(x=node_feats, edge_index=edge_index)
    data.coords  = coords                   # (N, 2) on DEVICE
    data.n_nodes = n
    return data


# ── Node Encoder ─────────────────────────────────────────────────────────────
class NodeEncoder(nn.Module):
    """
    Projects (SBERT_DIM + 2) → HIDDEN_DIM with a 2-layer MLP.
    """

    def __init__(self):
        super().__init__()
        in_dim = SBERT_DIM + COORD_DIM
        self.mlp = nn.Sequential(
            nn.Linear(in_dim, HIDDEN_DIM),
            nn.LayerNorm(HIDDEN_DIM),
            nn.ReLU(),
            nn.Linear(HIDDEN_DIM, HIDDEN_DIM),
            nn.LayerNorm(HIDDEN_DIM),
            nn.ReLU(),
        )

    def forward(self, x: Tensor) -> Tensor:           # (N, in_dim) → (N, H)
        return self.mlp(x)


# ── GAT ──────────────────────────────────────────────────────────────────────
class GATEncoder(nn.Module):
    """Two-layer Graph Attention Network."""

    def __init__(self):
        super().__init__()
        self.conv1 = GATConv(
            in_channels=HIDDEN_DIM,
            out_channels=HIDDEN_DIM // GAT_HEADS,
            heads=GAT_HEADS,
            dropout=0.1,
            concat=True,
        )
        self.conv2 = GATConv(
            in_channels=HIDDEN_DIM,
            out_channels=HIDDEN_DIM,
            heads=1,
            dropout=0.1,
            concat=False,
        )
        self.norm1 = nn.LayerNorm(HIDDEN_DIM)
        self.norm2 = nn.LayerNorm(HIDDEN_DIM)

    def forward(self, x: Tensor, edge_index: Tensor) -> Tensor:
        h = self.conv1(x, edge_index)
        h = F.elu(self.norm1(h))
        h = self.conv2(h, edge_index)
        h = F.elu(self.norm2(h))
        return h                                        # (N, HIDDEN_DIM)


# ── Pointer Head (Cross-Attention) ────────────────────────────────────────────
class PointerHead(nn.Module):
    """
    Cross-attention between a single instruction vector and N node vectors.
    Returns a log-softmax distribution over N nodes.

    Attention:
        score_i = (W_q · instr)^T · (W_k · node_i) / sqrt(d_k)
        logits  = softmax(scores)
    """

    def __init__(self):
        super().__init__()
        # Instruction projection (SBERT_DIM → HIDDEN_DIM)
        self.instr_proj = nn.Linear(SBERT_DIM, HIDDEN_DIM)
        self.W_q = nn.Linear(HIDDEN_DIM, HIDDEN_DIM, bias=False)
        self.W_k = nn.Linear(HIDDEN_DIM, HIDDEN_DIM, bias=False)
        self.scale = math.sqrt(HIDDEN_DIM)

    def forward(self, instr_emb: Tensor, node_vecs: Tensor) -> Tensor:
        """
        instr_emb : (1, SBERT_DIM)  or  (SBERT_DIM,)
        node_vecs : (N, HIDDEN_DIM)
        Returns   : (N,)  log-probabilities
        """
        if instr_emb.dim() == 1:
            instr_emb = instr_emb.unsqueeze(0)         # (1, SBERT_DIM)

        q = self.W_q(self.instr_proj(instr_emb))       # (1, H)
        k = self.W_k(node_vecs)                         # (N, H)

        scores = (q @ k.T) / self.scale                 # (1, N)
        log_probs = F.log_softmax(scores.squeeze(0), dim=-1)  # (N,)
        return log_probs


# ── Action Head ───────────────────────────────────────────────────────────────
class ActionHead(nn.Module):
    """
    Classifies action type from the attended node representation.
    Returns logits over NUM_ACTIONS classes.
    """

    def __init__(self):
        super().__init__()
        # Instruction projection for action context
        self.instr_proj = nn.Linear(SBERT_DIM, HIDDEN_DIM)
        self.classifier = nn.Sequential(
            nn.Linear(HIDDEN_DIM * 2, HIDDEN_DIM),
            nn.ReLU(),
            nn.Linear(HIDDEN_DIM, NUM_ACTIONS),
        )

    def forward(
        self,
        instr_emb: Tensor,      # (SBERT_DIM,) or (1, SBERT_DIM)
        target_node: Tensor,    # (HIDDEN_DIM,) — the chosen node vector
    ) -> Tensor:                # (NUM_ACTIONS,) logits
        if instr_emb.dim() == 1:
            instr_emb = instr_emb.unsqueeze(0)
        instr_h = self.instr_proj(instr_emb).squeeze(0)    # (H,)
        combined = torch.cat([instr_h, target_node], dim=-1)  # (2H,)
        return self.classifier(combined)                    # (NUM_ACTIONS,)


# ── Full Agent Model ──────────────────────────────────────────────────────────
class DOMAgent(nn.Module):
    """
    End-to-end DOM navigation agent.

    Forward pass:
        instruction : str
        graph       : torch_geometric.data.Data   (from dom_to_graph)

    Returns:
        node_log_probs : (N,)           log p(node | instruction, DOM)
        action_logits  : (NUM_ACTIONS,) raw logits for action classification
        node_vecs      : (N, HIDDEN_DIM) for auxiliary use
    """

    def __init__(self):
        super().__init__()
        self.text_encoder = TextEncoder()
        self.node_encoder  = NodeEncoder()
        self.gat           = GATEncoder()
        self.pointer       = PointerHead()
        self.action_head   = ActionHead()

    def encode_instruction(self, instruction: str) -> Tensor:
        """Returns (SBERT_DIM,) tensor (no grad)."""
        with torch.no_grad():
            return self.text_encoder.encode([instruction])[0]

    def forward(
        self,
        instruction: str,
        graph: Data,
    ) -> Tuple[Tensor, Tensor, Tensor]:
        instr_emb = self.encode_instruction(instruction)   # (SBERT_DIM,)

        # 1. Node encoding
        node_h = self.node_encoder(graph.x)                # (N, H)

        # 2. GAT (handle isolated graphs gracefully)
        node_vecs = self.gat(node_h, graph.edge_index)     # (N, H)

        # 3. Pointer Head → node distribution
        node_log_probs = self.pointer(instr_emb, node_vecs)  # (N,)

        # 4. Action Head → action logits (use argmax node)
        best_node_idx = node_log_probs.argmax().item()
        target_vec = node_vecs[best_node_idx]              # (H,)
        action_logits = self.action_head(instr_emb, target_vec)  # (NUM_ACTIONS,)

        return node_log_probs, action_logits, node_vecs

    def predict(
        self,
        instruction: str,
        dom_elements: List[Dict],
    ) -> Dict:
        """
        High-level inference: returns action dict with coordinates.
        """
        graph = dom_to_graph(dom_elements)
        self.eval()
        with torch.no_grad():
            node_log_probs, action_logits, _ = self.forward(instruction, graph)

        node_idx    = node_log_probs.argmax().item()
        action_idx  = action_logits.argmax().item()
        action_str  = ACTION_MAP[action_idx]
        x, y        = graph.coords[node_idx].tolist()
        confidence  = node_log_probs[node_idx].exp().item()

        return {
            "node_idx":   node_idx,
            "action":     action_str,
            "x":          x,
            "y":          y,
            "confidence": confidence,
        }
