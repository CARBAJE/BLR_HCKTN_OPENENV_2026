"""
reducer.py — Pure state-machine for the simulated OS.

Port of OSaaS/src/kernel/reducer.js to Python.
(state, action) -> new_state  — no side effects.
"""

from __future__ import annotations

import copy
import json
import math
import random


def _default_window_geometry(win_id: int, w: int = 620, h: int = 440) -> dict:
    return {
        "x": 60 + (win_id % 6) * 28,
        "y": 40 + (win_id % 5) * 20,
        "w": w,
        "h": h,
    }


def _random_geometry(cw: int = 1024, ch: int = 768) -> dict:
    w = random.randint(400, 800)
    h = random.randint(300, 600)
    max_x = max(0, cw - w - 50)
    max_y = max(0, ch - h - 50)
    x = random.randint(20, max(20, max_x + 20))
    y = random.randint(20, max(20, max_y + 20))
    return {"x": x, "y": y, "w": w, "h": h}


def _set_focused(stack: list, target_id: int) -> list:
    return [{**w, "focused": w["id"] == target_id} for w in stack]


def _clone_fs(fs: dict) -> dict:
    return json.loads(json.dumps(fs))


# ──────────────────────────────────────────────────────────────────────────────

def reduce(state: dict, action: dict) -> dict:
    """Apply an action to the OS state and return the new state."""
    a_type = action.get("type", "")

    # ── Window management ─────────────────────────────────────────────────────

    if a_type == "OPEN_WINDOW":
        win_id = state["nextWinId"]
        geo = _random_geometry()
        new_win = {
            "id": win_id,
            "title": action.get("title", "Window"),
            "component": action.get("component", ""),
            "x": action.get("x", geo["x"]),
            "y": action.get("y", geo["y"]),
            "w": action.get("w", geo["w"]),
            "h": action.get("h", geo["h"]),
            "focused": True,
            "props": action.get("props", {}),
        }
        return {
            **state,
            "windowsStack": _set_focused(state["windowsStack"], win_id) + [new_win],
            "nextWinId": win_id + 1,
            "focusedWindowId": win_id,
            "startMenuOpen": False,
            "lastAction": f"OPEN_WINDOW_{action.get('component', '')}",
        }

    if a_type == "CLOSE_WINDOW":
        remaining = [w for w in state["windowsStack"] if w["id"] != action.get("id")]
        new_focus = remaining[-1]["id"] if remaining else None
        return {
            **state,
            "windowsStack": remaining,
            "focusedWindowId": new_focus,
            "lastAction": "CLOSE_WINDOW",
        }

    if a_type == "FOCUS_WINDOW":
        target = action.get("id")
        return {
            **state,
            "windowsStack": [
                {**w, "focused": w["id"] == target, "minimized": False}
                if w["id"] == target
                else {**w, "focused": False}
                for w in state["windowsStack"]
            ],
            "focusedWindowId": target,
            "lastAction": "FOCUS_WINDOW",
        }

    if a_type == "MINIMIZE_WINDOW":
        target = action.get("id")
        new_stack = [
            {**w, "minimized": True, "focused": False} if w["id"] == target else w
            for w in state["windowsStack"]
        ]
        new_focus = next(
            (w["id"] for w in new_stack if not w.get("minimized") and w["id"] != target),
            None,
        )
        return {
            **state,
            "windowsStack": new_stack,
            "focusedWindowId": new_focus,
            "lastAction": "MINIMIZE_WINDOW",
        }

    if a_type == "MAXIMIZE_WINDOW":
        target = action.get("id")
        new_stack = []
        for w in state["windowsStack"]:
            if w["id"] != target:
                new_stack.append(w)
            elif w.get("maximized"):
                prev = w.get("prevGeometry", {})
                new_stack.append({**w, "maximized": False, **prev})
            else:
                new_stack.append({
                    **w,
                    "maximized": True,
                    "prevGeometry": {"x": w["x"], "y": w["y"], "w": w["w"], "h": w["h"]},
                })
        return {**state, "windowsStack": new_stack, "lastAction": "MAXIMIZE_WINDOW"}

    # ── Start Menu ────────────────────────────────────────────────────────────

    if a_type == "TOGGLE_START":
        return {
            **state,
            "startMenuOpen": not state["startMenuOpen"],
            "lastAction": "TOGGLE_START",
        }

    if a_type == "CLOSE_START":
        return {**state, "startMenuOpen": False}

    # ── Terminal ──────────────────────────────────────────────────────────────

    if a_type == "TERMINAL_INPUT":
        return {**state, "terminalInput": action.get("value", "")}

    if a_type == "TERMINAL_EXEC":
        raw = state["terminalInput"].strip()
        args = raw.split()
        cmd = args[0].lower() if args else ""
        lines = list(state["terminalLines"])
        lines[-1] = f"{state['currentDir']}> {raw}"
        output: list[str] = []

        if not raw:
            pass
        elif cmd in ("cls", "clear"):
            lines.clear()
        elif cmd == "echo":
            output = [" ".join(args[1:])]
        elif cmd in ("dir", "ls"):
            output = [
                f" Directory of {state['currentDir']}",
                "",
                "  <DIR>  .    ",
                "  <DIR>  ..   ",
                "         python-3.12.0-amd64.exe    24,576 KB",
            ]
        elif cmd in ("python", "python3"):
            if "Python" in state["installedApps"]:
                output = [
                    "Python 3.12.0 (tags/v3.12.0:0fb18b0, Oct  2 2023, 13:03:39)",
                    ">>> ",
                ]
            else:
                output = [
                    "'python' is not recognized as an internal or external command,",
                    "operable program or batch file.",
                ]
        elif cmd == "path":
            output = [state["environmentVariables"]["PATH"]]
        elif cmd == "set":
            output = [f"{k}={v}" for k, v in state["environmentVariables"].items()]
        elif cmd == "cd":
            output = [state["currentDir"]]
        else:
            output = [
                f"'{args[0]}' is not recognized as an internal or external command,",
                "operable program or batch file.",
            ]

        return {
            **state,
            "terminalLines": lines + output + ["", f"{state['currentDir']}> "],
            "terminalInput": "",
            "lastAction": "TERMINAL_EXEC",
        }

    # ── Python Installation ───────────────────────────────────────────────────

    if a_type == "INSTALL_PYTHON_COMPLETE":
        new_env = dict(state["environmentVariables"])
        if action.get("addPath"):
            new_env["PATH"] = new_env["PATH"] + ";C:\\Python312;C:\\Python312\\Scripts"

        new_apps = list(state["installedApps"])
        if "Python" not in new_apps:
            new_apps.append("Python")

        new_fs = _clone_fs(state["fileSystem"])
        new_fs["C:"]["children"]["Python312"] = {
            "type": "folder",
            "children": {
                "python.exe": {"type": "file", "size": "98 KB"},
                "pythonw.exe": {"type": "file", "size": "97 KB"},
                "pip.exe": {"type": "file", "size": "84 KB"},
                "LICENSE.txt": {"type": "file", "size": "12 KB"},
                "README.txt": {"type": "file", "size": "4 KB"},
                "Scripts": {"type": "folder", "children": {}},
                "Lib": {"type": "folder", "children": {}},
                "DLLs": {"type": "folder", "children": {}},
            },
        }
        return {
            **state,
            "fileSystem": new_fs,
            "environmentVariables": new_env,
            "installedApps": new_apps,
            "lastAction": "INSTALL_PYTHON_COMPLETE",
        }

    # ── Misc ──────────────────────────────────────────────────────────────────

    if a_type == "CLIPBOARD_SET":
        return {**state, "clipboard": action.get("text", ""), "lastAction": "CLIPBOARD_SET"}

    if a_type == "SET_ENV_VAR":
        return {
            **state,
            "environmentVariables": {
                **state["environmentVariables"],
                action["key"]: action["value"],
            },
            "lastAction": "SET_ENV_VAR",
        }

    if a_type == "WRITE_FILE":
        new_fs = _clone_fs(state["fileSystem"])
        node = new_fs["C:"]
        path_parts = action.get("filePath", [])
        for part in path_parts[1:-1]:
            node = node.get("children", {}).get(part)
            if node is None:
                break
        if node is not None and path_parts:
            filename = path_parts[-1]
            if filename in node.get("children", {}):
                node["children"][filename]["content"] = action.get("content", "")
        return {**state, "fileSystem": new_fs, "lastAction": "WRITE_FILE"}

    # Default: return state unchanged
    return state
