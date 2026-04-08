"""
initial_state.py — Generates a randomized initial OS state.

Port of OSaaS/src/kernel/initialState.js to pure Python.
No browser APIs, no external dependencies.
"""

from __future__ import annotations

import copy
import random
import string

# ── Synthetic file-system helpers ─────────────────────────────────────────────

LOREM_WORDS = [
    "lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing",
    "elit", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore",
    "et", "dolore", "magna", "aliqua", "enim", "ad", "minim", "veniam",
    "quis", "nostrud", "exercitation", "ullamco", "laboris", "nisi",
    "aliquip", "ex", "ea", "commodo", "consequat",
]

ALL_TXT = [
    "notes.txt", "readme.txt", "log.txt", "report.txt", "config.txt",
    "memo.txt", "draft.txt", "summary.txt", "todo.txt", "ideas.txt",
    "changelog.txt", "instructions.txt", "license.txt", "data.txt",
]
ALL_EXE = [
    "setup.exe", "updater.exe", "launcher.exe",
    "helper.exe", "service.exe", "manager.exe",
]
ALL_FOLDERS = [
    "Projects", "Backup", "Work", "Personal", "Archive", "Media", "Assets",
]


def _lorem_ipsum(word_count: int = 60) -> str:
    words = [random.choice(LOREM_WORDS) for _ in range(word_count)]
    sentences, i = [], 0
    while i < len(words):
        chunk_len = 8 + random.randint(0, 7)
        chunk = words[i : i + chunk_len]
        chunk[0] = chunk[0].capitalize()
        sentences.append(" ".join(chunk) + ".")
        i += chunk_len
    return " ".join(sentences)


def _synthetic_files(folders: int = 1, txt: int = 3, exe: int = 1) -> dict:
    result = {}
    for name in random.sample(ALL_FOLDERS, min(folders, len(ALL_FOLDERS))):
        result[name] = {"type": "folder", "children": {}}
    for name in random.sample(ALL_TXT, min(txt, len(ALL_TXT))):
        result[name] = {
            "type": "file",
            "ext": "txt",
            "size": f"{1 + random.randint(0, 19)} KB",
            "content": _lorem_ipsum(50 + random.randint(0, 79)),
        }
    for name in random.sample(ALL_EXE, min(exe, len(ALL_EXE))):
        result[name] = {
            "type": "file",
            "ext": "exe",
            "size": f"{0.5 + random.random() * 4:.1f} MB",
        }
    return result


# ── File system factory ───────────────────────────────────────────────────────

def _build_file_system() -> dict:
    return {
        "C:": {
            "type": "drive",
            "children": {
                "Windows": {
                    "type": "folder",
                    "children": {"System32": {"type": "folder", "children": {}}},
                },
                "Users": {
                    "type": "folder",
                    "children": {
                        "Admin": {
                            "type": "folder",
                            "children": {
                                "Desktop": {
                                    "type": "folder",
                                    "children": _synthetic_files(folders=1, txt=2, exe=1),
                                },
                                "Downloads": {
                                    "type": "folder",
                                    "children": {
                                        "python-3.12.0-amd64.exe": {
                                            "type": "file",
                                            "ext": "exe",
                                            "size": "24.5 MB",
                                            "component": "PythonInstaller",
                                        },
                                        **_synthetic_files(folders=0, txt=1, exe=0),
                                    },
                                },
                                "Documents": {
                                    "type": "folder",
                                    "children": _synthetic_files(folders=1, txt=2, exe=0),
                                },
                                "AppData": {
                                    "type": "folder",
                                    "children": {
                                        "Local": {
                                            "type": "folder",
                                            "children": {
                                                "Temp": {"type": "folder", "children": {}},
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                "Program Files": {"type": "folder", "children": {}},
                "Program Files (x86)": {"type": "folder", "children": {}},
            },
        },
    }


# ── Visual config randomizer ─────────────────────────────────────────────────

TASKBAR_POSITIONS = ["top", "bottom", "left", "right"]
ACCENT_COLORS = [
    "#0078d4", "#e74c3c", "#27ae60", "#8e44ad",
    "#e67e22", "#16a085", "#c0392b", "#2980b9",
    "#d35400", "#1abc9c",
]
FONT_FAMILIES = [
    '"Segoe UI", system-ui, sans-serif',
    '"Courier New", monospace',
    '"Georgia", serif',
    'Arial, sans-serif',
]
DESKTOP_BGS = [
    "#1e3a5f", "#2d1b33", "#1a2e1a", "#2e2a1a",
    "#1a2a2e", "#1c1c2e", "#2a1a1a", "#1a1e2e",
]
TASKBAR_BGS = [
    "#1a1a2e", "#0d0d1a", "#1a2a1a",
    "#1a1a1a", "#2a1a2e", "#0a1a2a",
]
DPI_SCALES = [0.85, 1.0, 1.15, 1.25]
WALLPAPER_COUNT = 5


def _random_visual_config() -> dict:
    accent = random.choice(ACCENT_COLORS)
    bg_idx = 1 + random.randint(0, WALLPAPER_COUNT - 1)
    return {
        "accentColor": accent,
        "taskbarPosition": random.choice(TASKBAR_POSITIONS),
        "fontFamily": random.choice(FONT_FAMILIES),
        "desktopBg": random.choice(DESKTOP_BGS),
        "desktopBgImage": f"/assets/wallpapers/bg_{bg_idx}.jpg",
        "wallpaper": f"bg_{bg_idx}.jpg",
        "taskbarBg": random.choice(TASKBAR_BGS),
        "titleBg": accent,
        "windowBg": "#f0f0f0",
        "dpiScale": random.choice(DPI_SCALES),
    }


# ── Factory ───────────────────────────────────────────────────────────────────

def create_initial_state() -> dict:
    return {
        "fileSystem": _build_file_system(),
        "environmentVariables": {
            "PATH": "C:\\Windows\\System32;C:\\Windows",
            "USERPROFILE": "C:\\Users\\Admin",
            "TEMP": "C:\\Users\\Admin\\AppData\\Local\\Temp",
            "OS": "Windows_NT",
            "COMPUTERNAME": "DESKTOP-OSaaS",
        },
        "installedApps": ["Cmd", "Explorer", "Notepad"],
        "windowsStack": [],
        "visualConfig": _random_visual_config(),
        "startMenuOpen": False,
        "clipboard": "",
        "focusedWindowId": None,
        "nextWinId": 1,
        "terminalLines": [
            "Microsoft Windows [Version 10.0.22631.3880]",
            "(c) Microsoft Corporation. All rights reserved.",
            "",
            "C:\\Users\\Admin> ",
        ],
        "terminalInput": "",
        "currentDir": "C:\\Users\\Admin",
        "lastAction": None,
        "eventLog": [],
    }
