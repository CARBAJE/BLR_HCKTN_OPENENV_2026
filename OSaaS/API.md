# OSaaS HTTP API — v2.0 Multi-Instance

Base URL: `http://localhost:5173`

---

## Instance lifecycle

### POST /api/createOS

Creates a new isolated OS instance. Each instance starts with a **randomized
visual configuration** (taskbar position, accent color, font, desktop background).

```bash
curl -X POST http://localhost:5173/api/createOS
```

**Response:**
```json
{
  "ok":         true,
  "instanceId": "550e8400-e29b-41d4-a716-446655440000",
  "createdAt":  1712345678901,
  "message":    "OS instance created. Randomized visual config applied at startup."
}
```

---

### POST /api/destroyOS

Destroys an instance and releases all memory (React root unmounted, DOM removed).

```json
{ "instanceId": "550e8400-e29b-41d4-a716-446655440000" }
```

**Response:**
```json
{ "ok": true, "instanceId": "...", "message": "Instance destroyed and memory released." }
```

---

### GET /api/instances

Lists all active instances.

```json
{
  "ok":   true,
  "count": 3,
  "instances": [
    { "instanceId": "...", "createdAt": 1712345678901, "commandCount": 5, "pendingCount": 0 }
  ]
}
```

---

## POST /api/execute

Sends a command to a specific OS instance.

**Request body:**
```json
{
  "instanceId": "550e8400-e29b-41d4-a716-446655440000",
  "type":       "MOUSE_EVENT",
  "payload":    { "action": "CLICK", "position_x": 30, "position_y": 30 },
  "return":     false
}
```

| Field        | Type    | Required | Description |
|--------------|---------|----------|-------------|
| `instanceId` | string  | ✅       | Target instance |
| `type`       | string  | ✅       | Command type |
| `payload`    | object  | ✅       | Command parameters |
| `return`     | boolean | ❌       | `true` = skip screenshot. Default: `false` |

**Response:**
```json
{
  "ok":         true,
  "instanceId": "...",
  "timestamp":  1712345678901,
  "command":    { "type": "...", "payload": {} },
  "message":    "CLICK at (30, 30)",
  "state": {
    "installedApps":  ["Cmd", "Explorer", "Notepad"],
    "openWindows":    [],
    "environmentVariables": { "PATH": "..." },
    "visualConfig":   { "taskbarPosition": "bottom", "accentColor": "#e74c3c", ... },
    "lastAction":     "MOUSE_EVENT"
  },
  "screenshot": "data:image/jpeg;base64,..."
}
```

---

## Command types

```json
{ "type": "MOUSE_EVENT",    "payload": { "action": "CLICK",        "position_x": 30, "position_y": 30 } }
{ "type": "MOUSE_EVENT",    "payload": { "action": "DOUBLE_CLICK", "position_x": 50, "position_y": 50 } }
{ "type": "KEYBOARD_EVENT", "payload": { "text": "python" } }
{ "type": "KEYBOARD_EVENT", "payload": { "key": "Enter" } }
{ "type": "OPEN_WINDOW",    "payload": { "title": "Terminal", "component": "Terminal", "w": 580, "h": 360 } }
{ "type": "CLOSE_WINDOW",   "payload": { "id": 1 } }
{ "type": "FOCUS_WINDOW",   "payload": { "id": 1 } }
{ "type": "RANDOMIZE_UI",   "payload": {} }
{ "type": "CLIPBOARD_SET",  "payload": { "text": "hello" } }
```

---

## Python example — parallel instances

```python
import requests, time, base64, concurrent.futures

BASE = "http://localhost:5173"

def create():
    r = requests.post(f"{BASE}/api/createOS").json()
    return r["instanceId"]

def cmd(instance_id, payload, screenshot=True):
    body = {"instanceId": instance_id, **payload, "return": not screenshot}
    return requests.post(f"{BASE}/api/execute", json=body).json()

def destroy(instance_id):
    requests.post(f"{BASE}/api/destroyOS", json={"instanceId": instance_id})

def run_task(instance_id):
    """Install Python in one instance."""
    cmd(instance_id, {"type": "OPEN_WINDOW", "payload": {
        "title": "Python 3.12.0 Setup", "component": "PythonInstaller"}})
    time.sleep(0.5)
    # Click Install Now (use /api/execute with Map tab coords for your instance)
    r = cmd(instance_id, {"type": "MOUSE_EVENT",
        "payload": {"action": "CLICK", "position_x": 195, "position_y": 310}})
    return r

# Run 5 instances in parallel — each with its own random UI
instance_ids = [create() for _ in range(5)]
print(f"Created: {instance_ids}")

with concurrent.futures.ThreadPoolExecutor() as pool:
    results = list(pool.map(run_task, instance_ids))

for r in results:
    print(r["message"], "| Python:", "Python" in r["state"]["installedApps"])

# Save screenshot from first instance
img = base64.b64decode(results[0]["screenshot"].split(",")[1])
open("instance_0.jpg", "wb").write(img)

# Cleanup
for iid in instance_ids:
    destroy(iid)
print("All instances destroyed.")
```

---

## GET /api/status

```json
{ "ok": true, "service": "OSaaS Multi-Instance API", "version": "2.0.0", "activeInstances": 2 }
```

---

# RL Environment API — DOMAgent interface

Single-episode RL loop compatible with the `env_server.py` / `inference.py` reference implementation.
Only one episode is active at a time. All endpoints are at the root (no `/api/` prefix).

---

## POST /reset

Destroys any previous episode instance and creates a fresh one with a randomly selected task.

```bash
curl -X POST http://localhost:5173/reset
```

**Response:**
```json
{ "status": "ok" }
```

**Available tasks (chosen at random):**

| Instruction | Target element |
|---|---|
| Click the Start button | Start |
| Open the Terminal | Terminal |
| Open the Explorer | This PC |
| Open System Settings | System Settings |
| Open the Downloads folder | Downloads |
| Open the Recycle Bin | Recycle Bin |

---

## GET /state

Returns the current DOM (visible interactive elements with normalized coordinates) and the active instruction.

```bash
curl http://localhost:5173/state
```

**Response:**
```json
{
  "instruction": "Open the Terminal",
  "dom": [
    { "text": "Start",           "type": "button",  "x": 0.0234, "y": 0.9583 },
    { "text": "This PC",         "type": "icon",    "x": 0.0391, "y": 0.0833 },
    { "text": "Downloads",       "type": "icon",    "x": 0.0391, "y": 0.2083 },
    { "text": "System Settings", "type": "icon",    "x": 0.0391, "y": 0.3333 },
    { "text": "Recycle Bin",     "type": "icon",    "x": 0.0391, "y": 0.4583 }
  ]
}
```

**DOM element fields:**

| Field | Type | Description |
|---|---|---|
| `text` | string | Human-readable label of the element |
| `type` | string | `button`, `icon`, `menuitem`, `tab`, `input`, `taskbar`, `window`, `element` |
| `x` | float 0–1 | Normalized horizontal position (center of element, relative to 1280px width) |
| `y` | float 0–1 | Normalized vertical position (center of element, relative to 720px height) |

**Errors:**

```json
{ "error": "No active episode. Call POST /reset first." }
```

---

## POST /step

Executes an action on the active episode and returns the reward.

```bash
curl -X POST http://localhost:5173/step \
  -H "Content-Type: application/json" \
  -d '{ "action": "CLICK", "x": 0.0391, "y": 0.2083, "node_idx": 2 }'
```

**Request body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | string | ❌ | `"CLICK"` or `"DOUBLE_CLICK"`. Default: `"CLICK"` |
| `x` | float 0–1 | ✅ | Normalized X coordinate to click |
| `y` | float 0–1 | ✅ | Normalized Y coordinate to click |
| `node_idx` | int | ✅ | Index of the clicked element in the DOM array from the last `/state` call |

**Response:**
```json
{ "reward": 1.0, "done": true }
```

| Field | Type | Description |
|---|---|---|
| `reward` | float | `1.0` if `dom[node_idx].text` matches the task target, `0.0` otherwise |
| `done` | bool | `true` if reward is 1.0 or 30 steps have been reached |

---

## Python example — DOMAgent inference loop

```python
import requests

BASE = "http://localhost:5173"

# Reset episode
requests.post(f"{BASE}/reset")

for step in range(30):
    state = requests.get(f"{BASE}/state").json()
    dom         = state["dom"]
    instruction = state["instruction"]

    # ── your agent picks node_idx here ──
    node_idx = 0  # placeholder

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
