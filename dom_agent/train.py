"""
train.py — Training pipeline for DOMAgent

Modes
-----
  imitation  : Behavioral Cloning on JSON trajectory recordings.
  rl         : REINFORCE loop against a running FastAPI environment.

Usage
-----
  python train.py --mode imitation --recordings_dir recordings/
  python train.py --mode rl       --server http://localhost:8000 --episodes 500
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import torch
import torch.nn as nn
import torch.optim as optim
import requests

from model import DOMAgent, dom_to_graph, ACTION_MAP, DEVICE


# ── Reproducibility ───────────────────────────────────────────────────────────
torch.manual_seed(42)
random.seed(42)


# ────────────────────────────────────────────────────────────────────────────
# Instruction augmentation helpers
# ────────────────────────────────────────────────────────────────────────────
_PARAPHRASES = [
    lambda s: s,
    lambda s: s.lower(),
    lambda s: s.upper(),
    lambda s: "Please " + s,
    lambda s: "I need you to " + s,
    lambda s: s + " now",
    lambda s: "Can you " + s + "?",
    lambda s: "Task: " + s,
]


def augment_instruction(instruction: str) -> List[str]:
    """Return several surface variants of an instruction string."""
    variants = []
    for fn in _PARAPHRASES:
        try:
            variants.append(fn(instruction))
        except Exception:
            variants.append(instruction)
    return list(set(variants))


# ────────────────────────────────────────────────────────────────────────────
# Imitation (Behavioural Cloning)
# ────────────────────────────────────────────────────────────────────────────
def load_recordings(recordings_dir: str) -> List[Dict]:
    """
    Load all JSON trajectory files from a directory.

    Expected file format — list of step dicts:
    [
      {
        "instruction": "click the login button",
        "dom": [{"text":"Login","type":"button","x":0.5,"y":0.8}, ...],
        "clicked_node_idx": 0,
        "action": "CLICK"
      },
      ...
    ]
    """
    samples = []
    p = Path(recordings_dir)
    for f in sorted(p.glob("**/*.json")):
        try:
            data = json.loads(f.read_text())
            if isinstance(data, list):
                samples.extend(data)
            elif isinstance(data, dict):
                samples.append(data)
        except Exception as e:
            print(f"[WARN] Could not load {f}: {e}", file=sys.stderr)
    print(f"[INFO] Loaded {len(samples)} steps from {recordings_dir}")
    return samples


def bc_loss_fn(
    model: DOMAgent,
    sample: Dict,
    node_loss_fn: nn.CrossEntropyLoss,
    action_loss_fn: nn.CrossEntropyLoss,
    node_w: float = 0.8,
    action_w: float = 0.2,
) -> torch.Tensor:
    """Compute behavioural cloning loss for a single step."""
    instruction  = sample["instruction"]
    dom_elements = sample["dom"]
    target_node  = int(sample.get("clicked_node_idx", 0))
    target_action_str = sample.get("action", "CLICK")
    target_action_idx = {v: k for k, v in ACTION_MAP.items()}.get(
        target_action_str, 0
    )

    graph = dom_to_graph(dom_elements)
    n = graph.n_nodes

    # Guard: target node index must be within current DOM size
    if target_node >= n:
        target_node = n - 1

    node_log_probs, action_logits, _ = model(instruction, graph)

    # CrossEntropy expects (1, N) logits and (1,) target
    node_loss = node_loss_fn(
        node_log_probs.unsqueeze(0),          # (1, N)
        torch.tensor([target_node], device=DEVICE),
    )
    action_loss = action_loss_fn(
        action_logits.unsqueeze(0),           # (1, num_actions)
        torch.tensor([target_action_idx], device=DEVICE),
    )

    return node_w * node_loss + action_w * action_loss


def train_imitation(
    model: DOMAgent,
    recordings_dir: str,
    epochs: int = 20,
    lr: float = 3e-4,
    checkpoint_path: str = "agent_bc.pt",
    augment: bool = True,
) -> None:
    model = model.to(DEVICE)
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    node_loss_fn   = nn.CrossEntropyLoss()
    action_loss_fn = nn.CrossEntropyLoss()

    print(f"[BC] Training on device: {DEVICE}")
    samples = load_recordings(recordings_dir)
    if not samples:
        print("[WARN] No recording samples found. Skipping imitation training.")
        return

    model.train()
    for epoch in range(1, epochs + 1):
        random.shuffle(samples)
        total_loss = 0.0
        n_steps    = 0

        for sample in samples:
            instructions = (
                augment_instruction(sample["instruction"]) if augment
                else [sample["instruction"]]
            )
            for instr in instructions:
                aug_sample = {**sample, "instruction": instr}
                try:
                    optimizer.zero_grad()
                    loss = bc_loss_fn(
                        model, aug_sample, node_loss_fn, action_loss_fn
                    )
                    loss.backward()
                    nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                    optimizer.step()
                    total_loss += loss.item()
                    n_steps    += 1
                except Exception as e:
                    print(f"[WARN] Step skipped: {e}", file=sys.stderr)

        avg = total_loss / max(n_steps, 1)
        print(f"[BC] Epoch {epoch:03d}/{epochs} — avg loss: {avg:.4f}")

    torch.save(model.state_dict(), checkpoint_path)
    print(f"[BC] Checkpoint saved → {checkpoint_path}")


# ────────────────────────────────────────────────────────────────────────────
# RL (REINFORCE)
# ────────────────────────────────────────────────────────────────────────────
class RLEnvClient:
    """Thin HTTP client for the FastAPI environment."""

    def __init__(self, server_url: str, timeout: int = 10):
        self.base   = server_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path: str) -> Dict:
        r = requests.get(f"{self.base}{path}", timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def _post(self, path: str, payload: Dict = None) -> Dict:
        r = requests.post(
            f"{self.base}{path}",
            json=payload or {},
            timeout=self.timeout,
        )
        r.raise_for_status()
        return r.json()

    def reset(self) -> Dict:
        return self._post("/reset")

    def state(self) -> Dict:
        return self._get("/state")

    def step(self, action: Dict) -> Dict:
        return self._post("/step", action)


REPEAT_PENALTY = -0.2   # applied when the agent picks the same node twice in a row

def collect_episode(
    model: DOMAgent,
    env: RLEnvClient,
    instruction: str,
    max_steps: int = 20,
    step_penalty: float = -0.1,
) -> Tuple[List[torch.Tensor], List[float], List[torch.Tensor]]:
    """
    Roll out one episode with the current policy.
    Returns:
        log_probs  : list of log-prob tensors for selected nodes
        rewards    : corresponding float rewards (with step penalty fallback)
        entropies  : per-step entropy tensors for regularization
    """
    log_probs_list: List[torch.Tensor] = []
    rewards_list:   List[float]        = []
    entropies_list: List[torch.Tensor] = []

    state = env.state()
    dom   = state.get("dom", [])

    prev_node_idx: int | None = None   # track last chosen node for repeat penalty

    for _ in range(max_steps):
        if not dom:
            break

        graph = dom_to_graph(dom)
        # Keep model in train() mode — caller is responsible for setting it
        node_log_probs, action_logits, _ = model(instruction, graph)

        # Sample from the pointer distribution (exploration)
        probs     = node_log_probs.exp()
        node_idx  = torch.multinomial(probs, 1).item()
        log_p     = node_log_probs[node_idx]

        # Per-step entropy: encourages exploration and provides gradient signal
        entropy = -(probs * node_log_probs).sum()

        # Sample action type to allow exploring DOUBLE_CLICK and KEYBOARD_EVENT
        action_probs = torch.softmax(action_logits, dim=-1)
        action_idx   = torch.multinomial(action_probs, 1).item()
        action_str   = ACTION_MAP[action_idx]

        x, y = graph.coords[node_idx].tolist()

        try:
            result = env.step({
                "action":    action_str,
                "x":         x,
                "y":         y,
                "node_idx":  int(node_idx),
            })
        except Exception as e:
            print(f"[WARN] /step error: {e}", file=sys.stderr)
            break

        reward = result.get("reward")
        # If env doesn't return reward (e.g. OSaaS server), apply step penalty
        if reward is None:
            reward = step_penalty
        reward = float(reward)

        # Penalize repeated selection of the same node — forces exploration
        if int(node_idx) == prev_node_idx:
            reward += REPEAT_PENALTY
        prev_node_idx = int(node_idx)

        done   = bool(result.get("done", False))

        log_probs_list.append(log_p)
        rewards_list.append(reward)
        entropies_list.append(entropy)

        if done:
            break

        # Refresh DOM for next step
        try:
            state = env.state()
            dom   = state.get("dom", [])
        except Exception:
            break

    return log_probs_list, rewards_list, entropies_list


def compute_returns(rewards: List[float], gamma: float = 0.99) -> List[float]:
    G, returns = 0.0, []
    for r in reversed(rewards):
        G = r + gamma * G
        returns.insert(0, G)
    return returns


def train_rl(
    model: DOMAgent,
    server_url: str,
    episodes: int = 500,
    lr: float = 1e-4,
    gamma: float = 0.99,
    checkpoint_path: str = "agent_rl.pt",
    instruction: str = "Complete the task shown on screen",
    max_steps: int = 20,
    save_every: int = 50,
    entropy_coef: float = 0.05,
    baseline_alpha: float = 0.05,
) -> None:
    model = model.to(DEVICE)
    optimizer = optim.Adam(model.parameters(), lr=lr)
    env = RLEnvClient(server_url)
    print(f"[RL] Training on device: {DEVICE}")
    # Moving-average baseline to reduce REINFORCE variance
    reward_baseline = 0.0

    for ep in range(1, episodes + 1):
        # Reset environment
        try:
            env.reset()
        except Exception as e:
            print(f"[RL] /reset failed: {e}", file=sys.stderr)
            continue

        # Try to get instruction from env (optional field)
        try:
            state       = env.state()
            ep_instr    = state.get("instruction", instruction)
            ep_dom      = state.get("dom", [])
        except Exception:
            ep_instr = instruction
            ep_dom   = []

        if not ep_dom:
            print(f"[RL] Ep {ep}: empty DOM, skipping.", file=sys.stderr)
            continue

        # Roll out episode
        model.train()
        log_probs, rewards, entropies = collect_episode(model, env, ep_instr, max_steps)

        if not log_probs:
            continue

        total_reward = sum(rewards)

        # Update moving-average baseline
        reward_baseline += baseline_alpha * (total_reward - reward_baseline)

        returns  = compute_returns(rewards, gamma)
        returns_t = torch.tensor(returns, dtype=torch.float, device=DEVICE)

        # Subtract baseline to reduce variance
        returns_t = returns_t - reward_baseline

        # Normalise for training stability (only when std > 0)
        if len(returns_t) > 1 and returns_t.std() > 1e-6:
            returns_t = (returns_t - returns_t.mean()) / (
                returns_t.std() + 1e-8
            )

        # REINFORCE loss: -log_pi * G
        policy_loss = torch.stack(
            [-lp * G for lp, G in zip(log_probs, returns_t)]
        ).sum()

        # Entropy bonus: encourages exploration, ensures non-zero gradient
        entropy_loss = -entropy_coef * torch.stack(entropies).mean()

        total_loss = policy_loss + entropy_loss

        optimizer.zero_grad()
        total_loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        print(
            f"[RL] Ep {ep:04d}/{episodes} "
            f"| steps={len(rewards)} "
            f"| reward={total_reward:.2f} "
            f"| policy_loss={policy_loss.item():.4f} "
            f"| entropy={(-entropy_loss / entropy_coef).item():.3f}"
        )

        if ep % save_every == 0:
            torch.save(model.state_dict(), checkpoint_path)
            print(f"[RL] Checkpoint → {checkpoint_path}")

    torch.save(model.state_dict(), checkpoint_path)
    print(f"[RL] Final checkpoint → {checkpoint_path}")


# ────────────────────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train DOMAgent")
    p.add_argument(
        "--mode", choices=["imitation", "rl"], required=True,
        help="Training mode: 'imitation' or 'rl'"
    )
    # Imitation args
    p.add_argument("--recordings_dir", default="recordings",
                   help="Directory with JSON trajectory files")
    p.add_argument("--epochs", type=int, default=20)
    p.add_argument("--no_augment", action="store_true",
                   help="Disable instruction augmentation")
    p.add_argument("--bc_checkpoint", default="agent_bc.pt")
    # RL args
    p.add_argument("--server", default="http://localhost:8000",
                   help="FastAPI env server URL")
    p.add_argument("--episodes", type=int, default=500)
    p.add_argument("--rl_checkpoint", default="agent_rl.pt")
    p.add_argument("--pretrained", default=None,
                   help="Load pretrained weights before RL")
    p.add_argument("--instruction", default="Complete the task on screen",
                   help="Default instruction for RL episodes")
    p.add_argument("--max_steps", type=int, default=20)
    p.add_argument("--lr", type=float, default=None)
    return p.parse_args()


def main() -> None:
    args = parse_args()
    model = DOMAgent()

    if args.mode == "imitation":
        lr = args.lr or 3e-4
        train_imitation(
            model,
            recordings_dir=args.recordings_dir,
            epochs=args.epochs,
            lr=lr,
            checkpoint_path=args.bc_checkpoint,
            augment=not args.no_augment,
        )

    elif args.mode == "rl":
        if args.pretrained and os.path.exists(args.pretrained):
            model.load_state_dict(torch.load(args.pretrained, map_location="cpu"))
            print(f"[RL] Loaded weights from {args.pretrained}")
        lr = args.lr or 1e-4
        train_rl(
            model,
            server_url=args.server,
            episodes=args.episodes,
            lr=lr,
            checkpoint_path=args.rl_checkpoint,
            instruction=args.instruction,
            max_steps=args.max_steps,
        )


if __name__ == "__main__":
    main()
