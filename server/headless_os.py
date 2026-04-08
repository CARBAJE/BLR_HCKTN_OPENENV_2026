"""
headless_os.py — Pure-Python headless OS simulation.

Port of the HeadlessOS class from OSaaS/vite.config.js.
Runs the state machine and derives DOM layout from state.
No browser, no Node.js, no React.
"""

from __future__ import annotations

import math
import random
from typing import Dict, List, Optional

from server.initial_state import create_initial_state
from server.reducer import reduce

# ── Constants ─────────────────────────────────────────────────────────────────

HL_SW = 1280        # screen width
HL_SH = 720         # screen height
HL_THICK = 40       # taskbar thickness (px)

BASE_ICONS = ["This PC", "Downloads", "System Settings", "Recycle Bin"]
START_APPS = ["Terminal", "File Explorer", "System Settings", "Downloads", "Notepad"]


class HeadlessOS:
    """Simulates the OS without any browser. Pure Python."""

    def __init__(self) -> None:
        self._init()

    def reset(self) -> None:
        self._init()

    def _init(self) -> None:
        self.state: dict = create_initial_state()
        self.icon_positions: Dict[str, Dict[str, float]] = self._generate_icon_positions()
        self.version: int = 0

    # ── Layout helpers ────────────────────────────────────────────────────────

    def _desktop_bounds(self) -> dict:
        pos = self.state["visualConfig"]["taskbarPosition"]
        if pos == "bottom":
            return {"x": 0, "y": 0, "w": HL_SW, "h": HL_SH - HL_THICK}
        if pos == "left":
            return {"x": HL_THICK, "y": 0, "w": HL_SW - HL_THICK, "h": HL_SH}
        if pos == "right":
            return {"x": 0, "y": 0, "w": HL_SW - HL_THICK, "h": HL_SH}
        # top (default)
        return {"x": 0, "y": HL_THICK, "w": HL_SW, "h": HL_SH - HL_THICK}

    def _start_btn_center(self) -> dict:
        pos = self.state["visualConfig"]["taskbarPosition"]
        if pos == "bottom":
            return {"cx": 44, "cy": HL_SH - 20}
        if pos == "left":
            return {"cx": 20, "cy": 44}
        if pos == "right":
            return {"cx": HL_SW - 20, "cy": 44}
        return {"cx": 44, "cy": 20}  # top

    def _start_menu_items(self) -> List[dict]:
        pos = self.state["visualConfig"]["taskbarPosition"]
        ITEM_W, ITEM_H, PER_ROW = 88, 44, 3
        if pos == "bottom":
            menu_y = HL_SH - HL_THICK - PER_ROW * ITEM_H - 10
        else:
            menu_y = HL_THICK + 10
        items = []
        for i, name in enumerate(START_APPS):
            items.append({
                "label": name,
                "x": (10 + (i % PER_ROW) * ITEM_W + ITEM_W / 2) / HL_SW,
                "y": (menu_y + (i // PER_ROW) * ITEM_H + ITEM_H / 2) / HL_SH,
            })
        return items

    def _generate_icon_positions(self) -> Dict[str, Dict[str, float]]:
        d = self._desktop_bounds()
        margin = 60
        desk_children = (
            self.state.get("fileSystem", {})
            .get("C:", {}).get("children", {})
            .get("Users", {}).get("children", {})
            .get("Admin", {}).get("children", {})
            .get("Desktop", {}).get("children", {})
        )
        icons = list(BASE_ICONS) + list(desk_children.keys())
        positions = {}
        for name in icons:
            avail_w = max(1, d["w"] - 2 * margin)
            avail_h = max(1, d["h"] - 2 * margin)
            positions[name] = {
                "x": (d["x"] + margin + random.random() * avail_w) / HL_SW,
                "y": (d["y"] + margin + random.random() * avail_h) / HL_SH,
            }
        return positions

    # ── DOM builder ───────────────────────────────────────────────────────────

    def get_dom(self) -> List[dict]:
        els: List[dict] = []
        btn = self._start_btn_center()
        tb_pos = self.state["visualConfig"]["taskbarPosition"]
        is_horiz = tb_pos in ("top", "bottom")

        # Start button
        els.append({"text": "Start Button", "type": "button",
                     "x": btn["cx"] / HL_SW, "y": btn["cy"] / HL_SH})

        # Desktop icons
        for name, p in self.icon_positions.items():
            els.append({"text": f"Desktop icon: {name}", "type": "icon",
                         "x": p["x"], "y": p["y"]})

        # Start menu items (when open)
        if self.state["startMenuOpen"]:
            for item in self._start_menu_items():
                els.append({"text": f"Start menu item: {item['label']}",
                             "type": "menuitem", "x": item["x"], "y": item["y"]})

        # Windows
        for i, win in enumerate(self.state["windowsStack"]):
            if win.get("minimized"):
                continue

            title_cy = win["y"] + 14
            els.append({"text": f"Window title bar: {win['title']}", "type": "window",
                         "x": (win["x"] + win["w"] / 2) / HL_SW, "y": title_cy / HL_SH})
            els.append({"text": f"Minimize: {win['title']}", "type": "element",
                         "x": (win["x"] + win["w"] - 60) / HL_SW, "y": title_cy / HL_SH})
            els.append({"text": f"Maximize: {win['title']}", "type": "element",
                         "x": (win["x"] + win["w"] - 40) / HL_SW, "y": title_cy / HL_SH})
            els.append({"text": f"Close: {win['title']}", "type": "button",
                         "x": (win["x"] + win["w"] - 20) / HL_SW, "y": title_cy / HL_SH})

            # Taskbar slot
            slot = 100 + i * 80 + 40
            tb_cy = HL_SH - HL_THICK // 2 if tb_pos == "bottom" else HL_THICK // 2
            tb_cx = HL_THICK // 2 if tb_pos == "left" else HL_SW - HL_THICK // 2
            tb_x = slot if is_horiz else tb_cx
            tb_y = tb_cy if is_horiz else slot
            els.append({"text": f"Taskbar: {win['title']}", "type": "taskbar",
                         "x": tb_x / HL_SW, "y": tb_y / HL_SH})

            # Window content
            els.extend(self._window_content(win))

        return els

    def _window_content(self, win: dict) -> List[dict]:
        els: List[dict] = []
        x, y, w, h = win["x"], win["y"], win["w"], win["h"]
        comp = win.get("component", "")

        if comp == "Explorer":
            for j, folder in enumerate(["Desktop", "Downloads", "Documents", "AppData"]):
                els.append({"text": f"File: {folder}", "type": "element",
                             "x": (x + 80 + j * 80) / HL_SW, "y": (y + 80) / HL_SH})
            dl_children = (
                self.state.get("fileSystem", {})
                .get("C:", {}).get("children", {})
                .get("Users", {}).get("children", {})
                .get("Admin", {}).get("children", {})
                .get("Downloads", {}).get("children", {})
            )
            for j, fname in enumerate(list(dl_children.keys())[:5]):
                els.append({"text": f"File: {fname}", "type": "element",
                             "x": (x + 100) / HL_SW, "y": (y + 130 + j * 30) / HL_SH})

        if comp == "PythonInstaller":
            els.append({"text": "Add Python to PATH checkbox", "type": "element",
                         "x": (x + w * 0.3) / HL_SW, "y": (y + h * 0.70) / HL_SH})
            els.append({"text": "Install Now button", "type": "button",
                         "x": (x + w * 0.38) / HL_SW, "y": (y + h * 0.82) / HL_SH})
            els.append({"text": "Customize installation button", "type": "button",
                         "x": (x + w * 0.60) / HL_SW, "y": (y + h * 0.82) / HL_SH})

        if comp == "SystemSettings":
            els.append({"text": "System", "type": "tab",
                         "x": (x + w * 0.15) / HL_SW, "y": (y + 50) / HL_SH})
            els.append({"text": "Environment Variables", "type": "tab",
                         "x": (x + w * 0.40) / HL_SW, "y": (y + 50) / HL_SH})

        return els

    # ── Event handler ─────────────────────────────────────────────────────────

    def handle_action(self, node_idx: int, dom: List[dict], action: str) -> None:
        if node_idx < 0 or node_idx >= len(dom):
            return
        el = dom[node_idx]
        text = (el.get("text") or "").lower()
        is_double = action == "DOUBLE_CLICK"
        prev_state = self.state

        if text == "start button":
            self.state = reduce(self.state, {"type": "TOGGLE_START"})

        elif text.startswith("start menu item: "):
            self._open_app(text.replace("start menu item: ", ""))
            self.state = reduce(self.state, {"type": "CLOSE_START"})

        elif text.startswith("desktop icon: "):
            if is_double:
                self._open_app(text.replace("desktop icon: ", ""))
            if self.state["startMenuOpen"]:
                self.state = reduce(self.state, {"type": "CLOSE_START"})

        elif text.startswith("file: "):
            if is_double:
                self._open_app(text.replace("file: ", ""))

        elif text.startswith("close: "):
            title = text.replace("close: ", "")
            win = next((w for w in self.state["windowsStack"]
                        if w["title"].lower() == title), None)
            if win:
                self.state = reduce(self.state, {"type": "CLOSE_WINDOW", "id": win["id"]})

        elif text.startswith("minimize: "):
            title = text.replace("minimize: ", "")
            win = next((w for w in self.state["windowsStack"]
                        if w["title"].lower() == title), None)
            if win:
                self.state = reduce(self.state, {"type": "MINIMIZE_WINDOW", "id": win["id"]})

        elif text.startswith("taskbar: ") or text.startswith("window title bar: "):
            title = text.replace("taskbar: ", "").replace("window title bar: ", "")
            win = next((w for w in self.state["windowsStack"]
                        if w["title"].lower() == title), None)
            if win:
                self.state = reduce(self.state, {"type": "FOCUS_WINDOW", "id": win["id"]})

        elif self.state["startMenuOpen"]:
            self.state = reduce(self.state, {"type": "CLOSE_START"})

        # Bump version when state reference changed
        if self.state is not prev_state:
            self.version += 1

    def _open_app(self, name: str) -> None:
        n = name.lower()
        title = component = None
        if "terminal" in n or "cmd" in n:
            title, component = "Terminal", "Terminal"
        elif "explorer" in n or "this pc" in n:
            title, component = "File Explorer", "Explorer"
        elif "system settings" in n:
            title, component = "System Settings", "SystemSettings"
        elif "downloads" in n:
            title, component = "File Explorer", "Explorer"
        elif "notepad" in n:
            title, component = "Notepad", "Notepad"
        elif "recycle bin" in n:
            title, component = "Recycle Bin", "Explorer"
        elif "python" in n:
            title, component = "Python 3.12.0 Setup", "PythonInstaller"
        if title:
            self.state = reduce(self.state, {
                "type": "OPEN_WINDOW", "title": title, "component": component,
            })
