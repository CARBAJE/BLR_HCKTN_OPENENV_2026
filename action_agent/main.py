#!/usr/bin/env python3
"""
main.py — CLI entry point for the Action Recording Agent.

Usage examples
--------------
# From a JSON file:
python -m action_agent.main --input path/to/events.json

# From stdin (pipe):
cat events.json | python -m action_agent.main

# Skip OmniParser (no GPU / weights needed):
python -m action_agent.main --input events.json --skip-omniparser

# Save output to a file:
python -m action_agent.main --input events.json --output algorithm.txt

# Enable verbose logging:
python -m action_agent.main --input events.json -v
"""

import argparse
import json
import logging
import sys
import os

# Allow running as  python action_agent/main.py  from the hackaton_blr root
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from action_agent import ActionRecordingAgent  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="action_agent",
        description="Convert OSaaS event recordings into a human-readable algorithm.",
    )
    parser.add_argument(
        "--input", "-i",
        metavar="FILE",
        help="Path to JSON file containing the event list. Reads stdin if omitted.",
    )
    parser.add_argument(
        "--output", "-o",
        metavar="FILE",
        help="Write the algorithm to this file instead of stdout.",
    )
    parser.add_argument(
        "--skip-omniparser",
        action="store_true",
        help="Skip OmniParser (no model loading). Useful for testing the LLM pipeline.",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable DEBUG logging.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        datefmt="%H:%M:%S",
    )

    # ── Load input ─────────────────────────────────────────────────────────
    if args.input:
        with open(args.input, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    else:
        logging.info("Reading JSON from stdin …")
        data = json.load(sys.stdin)

    # ── Run agent ──────────────────────────────────────────────────────────
    agent = ActionRecordingAgent(skip_omniparser=args.skip_omniparser)
    algorithm = agent.process(data)

    # ── Output ────────────────────────────────────────────────────────────
    if args.output:
        with open(args.output, "w", encoding="utf-8") as fh:
            fh.write(algorithm)
        logging.info("Algorithm written to %s", args.output)
    else:
        print("\n" + "=" * 60)
        print("GENERATED ALGORITHM")
        print("=" * 60)
        print(algorithm)
        print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
