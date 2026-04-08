/**
 * vite.config.js
 *
 * OSaaS Multi-Instance API Plugin
 *
 * Instance lifecycle:
 *   POST /api/createOS              → { instanceId, config }
 *   POST /api/execute               → { instanceId, type, payload, return? }
 *   POST /api/destroyOS             → { instanceId }
 *   GET  /api/instances             → { instances: [{ instanceId, createdAt, commandCount }] }
 *   GET  /api/status                → health check
 *
 * Internal (browser ↔ server bridge):
 *   GET  /api/poll?instanceId=xxx   → next pending command for that instance
 *   POST /api/result                → { instanceId, commandId, result }
 *
 * Per-instance state in Node (no OS state here — that lives in the browser):
 *   instances Map<instanceId, InstanceMeta>
 *
 * InstanceMeta {
 *   instanceId:   string
 *   createdAt:    number
 *   commandCount: number
 *   pending:      Map<commandId, PendingCommand>
 *   // pending queue is FIFO; browser polls and takes one at a time
 * }
 *
 * PendingCommand {
 *   commandId: string
 *   command:   object          ← the full JSON payload from the caller
 *   resolve:   (result) => void
 *   reject:    (err)    => void
 *   timer:     NodeJS.Timeout  ← 30s timeout
 * }
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path  from 'path';
import { randomUUID } from 'crypto';
import osReducer        from './src/kernel/reducer.js';
import { createInitialState } from './src/kernel/initialState.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the expected action type for a given DOM element type.
 * Desktop icons require DOUBLE_CLICK to open; everything else uses CLICK.
 */
function getExpectedAction(elementType) {
  return elementType === 'icon' ? 'DOUBLE_CLICK' : 'CLICK';
}

/**
 * Returns true if any element in the DOM contains the target text.
 */
function targetVisible(dom, target) {
  return dom.some((el) => {
    const t = (el.text ?? '').toLowerCase();
    return t.includes(target) || target.includes(t);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data',  (c) => { raw += c; });
    req.on('end',   ()  => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type',                'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(data));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.statusCode = 204;
  res.end();
}

// ─── Headless OS simulation (no browser required for RL) ─────────────────────
//
// Runs the pure reducer in Node.js and derives a DOM element list from state.
// Used by the /reset, /state, /step RL endpoints so training works standalone.

const HL_SW    = 1280;
const HL_SH    = 720;
const HL_THICK = 40;   // taskbar thickness (px)

const HL_BASE_ICONS = ['This PC', 'Downloads', 'System Settings', 'Recycle Bin'];
const HL_START_APPS = ['Terminal', 'File Explorer', 'System Settings', 'Downloads', 'Notepad'];

class HeadlessOS {
  constructor() { this._init(); }

  reset() { this._init(); }

  _init() {
    this.state         = createInitialState();
    this.iconPositions = this._generateIconPositions();
    this.version       = 0;   // increments on every state-changing action
  }

  // ── Layout helpers ──────────────────────────────────────────────────────────

  _desktopBounds() {
    switch (this.state.visualConfig.taskbarPosition) {
      case 'bottom': return { x: 0,         y: 0,         w: HL_SW,           h: HL_SH - HL_THICK };
      case 'left':   return { x: HL_THICK,  y: 0,         w: HL_SW - HL_THICK, h: HL_SH };
      case 'right':  return { x: 0,         y: 0,         w: HL_SW - HL_THICK, h: HL_SH };
      default:       return { x: 0,         y: HL_THICK,  w: HL_SW,           h: HL_SH - HL_THICK }; // top
    }
  }

  _startBtnCenter() {
    switch (this.state.visualConfig.taskbarPosition) {
      case 'bottom': return { cx: 44,          cy: HL_SH - 20  };
      case 'left':   return { cx: 20,           cy: 44          };
      case 'right':  return { cx: HL_SW - 20,  cy: 44          };
      default:       return { cx: 44,           cy: 20          }; // top
    }
  }

  _startMenuItems() {
    const pos = this.state.visualConfig.taskbarPosition;
    const ITEM_W = 88, ITEM_H = 44, PER_ROW = 3;
    let menuY;
    switch (pos) {
      case 'bottom': menuY = HL_SH - HL_THICK - PER_ROW * ITEM_H - 10; break;
      default:       menuY = HL_THICK + 10; break;
    }
    return HL_START_APPS.map((name, i) => ({
      label: name,
      x: (10 + (i % PER_ROW) * ITEM_W + ITEM_W / 2) / HL_SW,
      y: (menuY + Math.floor(i / PER_ROW) * ITEM_H + ITEM_H / 2) / HL_SH,
    }));
  }

  _generateIconPositions() {
    const d = this._desktopBounds();
    const margin = 60;
    const deskFiles = Object.keys(
      this.state.fileSystem?.['C:']?.children?.Users?.children?.Admin?.children?.Desktop?.children ?? {},
    );
    const icons = [...HL_BASE_ICONS, ...deskFiles];
    const positions = {};
    for (const name of icons) {
      positions[name] = {
        x: (d.x + margin + Math.random() * Math.max(0, d.w - 2 * margin)) / HL_SW,
        y: (d.y + margin + Math.random() * Math.max(0, d.h - 2 * margin)) / HL_SH,
      };
    }
    return positions;
  }

  // ── DOM builder ─────────────────────────────────────────────────────────────

  getDom() {
    const els = [];
    const { cx, cy } = this._startBtnCenter();
    const { taskbarPosition: tbPos } = this.state.visualConfig;
    const isHoriz = tbPos === 'top' || tbPos === 'bottom';

    // Start button
    els.push({ text: 'Start Button', type: 'button', x: cx / HL_SW, y: cy / HL_SH });

    // Desktop icons
    for (const [name, p] of Object.entries(this.iconPositions)) {
      els.push({ text: `Desktop icon: ${name}`, type: 'icon', x: p.x, y: p.y });
    }

    // Start menu items (only when open)
    if (this.state.startMenuOpen) {
      for (const item of this._startMenuItems()) {
        els.push({ text: `Start menu item: ${item.label}`, type: 'menuitem', x: item.x, y: item.y });
      }
    }

    // Windows
    this.state.windowsStack.forEach((win, i) => {
      if (win.minimized) return;
      const titleCy = win.y + 14;
      els.push({ text: `Window title bar: ${win.title}`, type: 'window',  x: (win.x + win.w / 2)    / HL_SW, y: titleCy / HL_SH });
      els.push({ text: `Minimize: ${win.title}`,          type: 'element', x: (win.x + win.w - 60)   / HL_SW, y: titleCy / HL_SH });
      els.push({ text: `Maximize: ${win.title}`,          type: 'element', x: (win.x + win.w - 40)   / HL_SW, y: titleCy / HL_SH });
      els.push({ text: `Close: ${win.title}`,             type: 'button',  x: (win.x + win.w - 20)   / HL_SW, y: titleCy / HL_SH });

      // Taskbar slot
      const slot   = 100 + i * 80 + 40;
      const tbCy   = tbPos === 'bottom' ? HL_SH - HL_THICK / 2 : HL_THICK / 2;
      const tbCx   = tbPos === 'left'   ? HL_THICK / 2         : HL_SW - HL_THICK / 2;
      const [tbX, tbY] = isHoriz ? [slot, tbCy] : [tbCx, slot];
      els.push({ text: `Taskbar: ${win.title}`, type: 'taskbar', x: tbX / HL_SW, y: tbY / HL_SH });

      // Window content
      els.push(...this._windowContent(win));
    });

    return els;
  }

  _windowContent(win) {
    const els = [];
    const { x, y, w, h, component } = win;

    if (component === 'Explorer') {
      ['Desktop', 'Downloads', 'Documents', 'AppData'].forEach((f, i) => {
        els.push({ text: `File: ${f}`, type: 'element', x: (x + 80 + i * 80) / HL_SW, y: (y + 80) / HL_SH });
      });
      // Files inside Downloads
      const dlFiles = Object.keys(
        this.state.fileSystem?.['C:']?.children?.Users?.children?.Admin?.children?.Downloads?.children ?? {},
      );
      dlFiles.slice(0, 5).forEach((f, i) => {
        els.push({ text: `File: ${f}`, type: 'element', x: (x + 100) / HL_SW, y: (y + 130 + i * 30) / HL_SH });
      });
    }

    if (component === 'PythonInstaller') {
      els.push({ text: 'Add Python to PATH checkbox', type: 'element', x: (x + w * 0.3)  / HL_SW, y: (y + h * 0.70) / HL_SH });
      els.push({ text: 'Install Now button',           type: 'button',  x: (x + w * 0.38) / HL_SW, y: (y + h * 0.82) / HL_SH });
      els.push({ text: 'Customize installation button',type: 'button',  x: (x + w * 0.60) / HL_SW, y: (y + h * 0.82) / HL_SH });
    }

    if (component === 'SystemSettings') {
      els.push({ text: 'System',                type: 'tab', x: (x + w * 0.15) / HL_SW, y: (y + 50) / HL_SH });
      els.push({ text: 'Environment Variables', type: 'tab', x: (x + w * 0.40) / HL_SW, y: (y + 50) / HL_SH });
    }

    if (component === 'Terminal') {
      // Terminal prompt
      els.push({ text: 'Terminal input', type: 'element', x: (x + w * 0.5) / HL_SW, y: (y + h - 30) / HL_SH });

      // Built-in commands
      els.push({ text: 'Terminal cmd: dir',  type: 'button', x: (x + 100) / HL_SW, y: (y + 60) / HL_SH });
      els.push({ text: 'Terminal cmd: help', type: 'button', x: (x + 220) / HL_SW, y: (y + 60) / HL_SH });

      // Openable .txt files from Documents (the agent can click to run "open <file>")
      const docFiles = Object.keys(
        this.state.fileSystem?.['C:']?.children?.Users?.children?.Admin?.children?.Documents?.children ?? {},
      );
      docFiles.filter(f => f.endsWith('.txt')).slice(0, 4).forEach((f, i) => {
        els.push({
          text: `Terminal cmd: open ${f}`,
          type: 'button',
          x: (x + 100) / HL_SW,
          y: (y + 100 + i * 30) / HL_SH,
        });
      });
    }

    if (component === 'TextViewer') {
      const fname = win.props?.filename || win.title || 'file';
      els.push({ text: `TextViewer: ${fname}`, type: 'element', x: (x + w * 0.5) / HL_SW, y: (y + h * 0.5) / HL_SH });
      els.push({ text: 'Save button',          type: 'button',  x: (x + w * 0.9) / HL_SW, y: (y + 36) / HL_SH });
    }

    return els;
  }

  // ── Event handler ───────────────────────────────────────────────────────────

  handleAction(nodeIdx, dom, action) {
    const el   = dom[nodeIdx];
    if (!el) return;
    const text = (el.text ?? '').toLowerCase();
    const isDouble = action === 'DOUBLE_CLICK';
    const prevState = this.state;

    if (text === 'start button') {
      this.state = osReducer(this.state, { type: 'TOGGLE_START' });
    } else if (text.startsWith('start menu item: ')) {
      this._openApp(text.replace('start menu item: ', ''));
      this.state = osReducer(this.state, { type: 'CLOSE_START' });
    } else if (text.startsWith('desktop icon: ')) {
      if (isDouble) this._openApp(text.replace('desktop icon: ', ''));
      // Only close start menu if it was actually open — avoids spurious state diffs
      if (this.state.startMenuOpen) {
        this.state = osReducer(this.state, { type: 'CLOSE_START' });
      }
    } else if (text.startsWith('file: ')) {
      // Files inside Explorer windows: double-click opens the file/app
      if (isDouble) this._openApp(text.replace('file: ', ''));
    } else if (text.startsWith('terminal cmd: ')) {
      // Clickable terminal commands — set input and execute
      const cmd = text.replace('terminal cmd: ', '');
      this.state = osReducer(this.state, { type: 'TERMINAL_INPUT', value: cmd });
      this.state = osReducer(this.state, { type: 'TERMINAL_EXEC' });
    } else if (text.startsWith('close: ')) {
      const win = this.state.windowsStack.find(w => w.title.toLowerCase() === text.replace('close: ', ''));
      if (win) this.state = osReducer(this.state, { type: 'CLOSE_WINDOW', id: win.id });
    } else if (text.startsWith('minimize: ')) {
      const win = this.state.windowsStack.find(w => w.title.toLowerCase() === text.replace('minimize: ', ''));
      if (win) this.state = osReducer(this.state, { type: 'MINIMIZE_WINDOW', id: win.id });
    } else if (text.startsWith('taskbar: ') || text.startsWith('window title bar: ')) {
      const title = text.replace('taskbar: ', '').replace('window title bar: ', '');
      const win = this.state.windowsStack.find(w => w.title.toLowerCase() === title);
      if (win) this.state = osReducer(this.state, { type: 'FOCUS_WINDOW', id: win.id });
    } else if (this.state.startMenuOpen) {
      this.state = osReducer(this.state, { type: 'CLOSE_START' });
    }

    // Bump version whenever state actually changed (viewer detects this)
    if (this.state !== prevState) this.version++;
  }

  _openApp(name) {
    const n = name.toLowerCase();
    let title, component;
    if (n.includes('terminal') || n.includes('cmd'))             { title = 'Terminal';       component = 'Terminal';         }
    else if (n.includes('explorer') || n.includes('this pc'))    { title = 'File Explorer';  component = 'Explorer';         }
    else if (n.includes('system settings'))                      { title = 'System Settings';component = 'SystemSettings';   }
    else if (n.includes('downloads'))                            { title = 'File Explorer';  component = 'Explorer';         }
    else if (n.includes('notepad'))                              { title = 'Notepad';         component = 'Notepad';          }
    else if (n.includes('recycle bin'))                          { title = 'Recycle Bin';     component = 'Explorer';         }
    else if (n.includes('python'))                               { title = 'Python 3.12.0 Setup'; component = 'PythonInstaller'; }
    if (title) this.state = osReducer(this.state, { type: 'OPEN_WINDOW', title, component });
  }
}

// ─── RL environment tasks ─────────────────────────────────────────────────────

const RL_TASKS = [
  { instruction: 'Click the Start button',                                          targetText: 'Start'        },
  { instruction: 'Open the Terminal',                                               targetText: 'Terminal'     },
  { instruction: 'Open the Explorer',                                               targetText: 'This PC'      },
  { instruction: 'Open System Settings',                                            targetText: 'System Settings' },
  { instruction: 'Open the Downloads folder',                                       targetText: 'Downloads'    },
  { instruction: 'Open the Recycle Bin',                                            targetText: 'Recycle Bin'  },
  { instruction: "Click the 'Install Now' button in the Python Setup.",             targetText: 'Install Now'  },
  { instruction: 'Open the Python installer from Downloads',                        targetText: 'Install Now'  },
  { instruction: 'Open Notepad',                                                   targetText: 'Notepad'      },
  { instruction: 'Open the Documents folder',                                      targetText: 'Documents'    },
  { instruction: 'Open readme.txt using the Terminal',                             targetText: 'open readme.txt' },
];

const RL_MAX_STEPS = 30;

// ─── Plugin ───────────────────────────────────────────────────────────────────

function osaasApiPlugin() {
  /** @type {Map<string, { instanceId: string, createdAt: number, commandCount: number, pending: Map }>} */
  const instances = new Map();

  // Headless OS for RL training (no browser required)
  let headlessOs = new HeadlessOS();

  /**
   * Episode state for the RL environment interface (/reset, /state, /step).
   * @type {{ instruction: string, targetText: string, lastDom: Array, step: number, done: boolean } | null}
   */
  let episode = null;

  function getInstance(instanceId, res) {
    const inst = instances.get(instanceId);
    if (!inst) {
      json(res, 404, { ok: false, error: `Instance "${instanceId}" not found. Call POST /api/createOS first.` });
      return null;
    }
    return inst;
  }

  return {
    name: 'osaas-api',

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];

        // ── CORS preflight ──────────────────────────────────────────────────
        if (req.method === 'OPTIONS') { cors(res); return; }

        // ── GET /api/status ─────────────────────────────────────────────────
        if (url === '/api/status' && req.method === 'GET') {
          json(res, 200, {
            ok:               true,
            service:          'OSaaS Multi-Instance API',
            version:          '2.0.0',
            activeInstances:  instances.size,
            instanceIds:      [...instances.keys()],
          });
          return;
        }

        // ── POST /api/createOS ───────────────────────────────────────────────
        if (url === '/api/createOS' && req.method === 'POST') {
          const instanceId = randomUUID();
          instances.set(instanceId, {
            instanceId,
            createdAt:    Date.now(),
            commandCount: 0,
            pending:      new Map(),
          });
          console.log(`[OSaaS] Instance created: ${instanceId}  (total: ${instances.size})`);
          json(res, 201, {
            ok:         true,
            instanceId,
            createdAt:  instances.get(instanceId).createdAt,
            message:    'OS instance created. Randomized visual config applied at startup.',
          });
          return;
        }

        // ── POST /api/destroyOS ──────────────────────────────────────────────
        if (url === '/api/destroyOS' && req.method === 'POST') {
          let body;
          try { body = await readBody(req); } catch {
            json(res, 400, { ok: false, error: 'Invalid JSON body' }); return;
          }
          const { instanceId } = body;
          if (!instanceId) {
            json(res, 400, { ok: false, error: 'Missing instanceId' }); return;
          }
          const inst = instances.get(instanceId);
          if (!inst) {
            json(res, 404, { ok: false, error: `Instance "${instanceId}" not found` }); return;
          }
          // Reject all pending commands so callers don't hang forever
          for (const [, entry] of inst.pending) {
            clearTimeout(entry.timer);
            entry.reject(new Error(`Instance "${instanceId}" was destroyed`));
          }
          instances.delete(instanceId);
          console.log(`[OSaaS] Instance destroyed: ${instanceId}  (total: ${instances.size})`);
          json(res, 200, { ok: true, instanceId, message: 'Instance destroyed and memory released.' });
          return;
        }

        // ── GET /api/instances ───────────────────────────────────────────────
        if (url === '/api/instances' && req.method === 'GET') {
          json(res, 200, {
            ok:        true,
            count:     instances.size,
            instances: [...instances.values()].map((i) => ({
              instanceId:   i.instanceId,
              createdAt:    i.createdAt,
              commandCount: i.commandCount,
              pendingCount: i.pending.size,
            })),
          });
          return;
        }

        // ── POST /api/execute ────────────────────────────────────────────────
        if (url === '/api/execute' && req.method === 'POST') {
          let command;
          try { command = await readBody(req); } catch {
            json(res, 400, { ok: false, error: 'Invalid JSON body' }); return;
          }
          if (!command.instanceId) {
            json(res, 400, { ok: false, error: 'Missing instanceId. Include "instanceId" in the request body.' });
            return;
          }
          const inst = getInstance(command.instanceId, res);
          if (!inst) return;

          const commandId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          inst.commandCount++;

          const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              inst.pending.delete(commandId);
              reject(new Error('Timeout: browser instance did not respond within 90s'));
            }, 90_000);
            inst.pending.set(commandId, { commandId, command, resolve, reject, timer });
          }).catch((err) => ({ ok: false, error: err.message, instanceId: command.instanceId }));

          json(res, result.ok === false ? 504 : 200, result);
          return;
        }

        // ── GET /api/poll?instanceId=xxx  (internal: called by browser) ──────
        if (url === '/api/poll' && req.method === 'GET') {
          const instanceId = new URL(req.url, 'http://x').searchParams.get('instanceId');
          if (!instanceId || !instances.has(instanceId)) {
            json(res, 200, null); return;   // instance gone or not found → browser should stop
          }
          const inst = instances.get(instanceId);
          const next = inst.pending.entries().next();
          if (next.done) { json(res, 200, null); return; }
          const [commandId, { command }] = next.value;
          json(res, 200, { commandId, command });
          return;
        }

        // ── POST /api/result  (internal: called by browser) ──────────────────
        if (url === '/api/result' && req.method === 'POST') {
          let body;
          try { body = await readBody(req); } catch {
            json(res, 400, { ok: false, error: 'Invalid JSON body' }); return;
          }
          const { instanceId, commandId, result } = body;
          const inst = instances.get(instanceId);
          if (inst) {
            const entry = inst.pending.get(commandId);
            if (entry) {
              clearTimeout(entry.timer);
              inst.pending.delete(commandId);
              entry.resolve(result);
            }
          }
          json(res, 200, { ok: true });
          return;
        }

        // ── POST /reset  (RL env — headless, no browser needed) ─────────────
        if (url === '/reset' && req.method === 'POST') {
          let body = {};
          try { body = await readBody(req); } catch { /* empty body is fine */ }

          headlessOs.reset();

          // Allow caller to specify instruction; otherwise pick a random task
          let task;
          if (body.instruction) {
            // Try to find a matching task by instruction text (case-insensitive)
            const needle = body.instruction.toLowerCase();
            task = RL_TASKS.find(t => t.instruction.toLowerCase() === needle);
            // If no exact match, find by target keyword in the instruction
            if (!task) {
              task = RL_TASKS.find(t =>
                needle.includes(t.targetText.toLowerCase()) ||
                t.targetText.toLowerCase().split(' ').some(w => needle.includes(w))
              );
            }
            // Fallback: use the instruction as-is with a generic target
            if (!task) {
              const words = body.instruction.split(/\s+/);
              task = { instruction: body.instruction, targetText: words[words.length - 1] };
            }
          } else {
            task = RL_TASKS[Math.floor(Math.random() * RL_TASKS.length)];
          }

          episode = {
            instruction: task.instruction,
            targetText:  task.targetText,
            lastDom:     headlessOs.getDom(),
            step:        0,
            done:        false,
            lastReward:  null,
            lastInfo:    null,
          };
          console.log(`[OSaaS/RL] Episode reset → "${task.instruction}" (target: "${task.targetText}")`);
          json(res, 200, { status: 'ok', instruction: task.instruction });
          return;
        }

        // ── GET /state  (RL env — headless) ──────────────────────────────────
        if (url === '/state' && req.method === 'GET') {
          if (!episode) {
            json(res, 400, { error: 'No active episode. Call POST /reset first.' }); return;
          }
          episode.lastDom = headlessOs.getDom();
          json(res, 200, { dom: episode.lastDom, instruction: episode.instruction });
          return;
        }

        // ── POST /step  (RL env — headless) ──────────────────────────────────
        if (url === '/step' && req.method === 'POST') {
          let body;
          try { body = await readBody(req); } catch {
            json(res, 400, { error: 'Invalid JSON body' }); return;
          }
          if (!episode) {
            json(res, 400, { error: 'No active episode. Call POST /reset first.' }); return;
          }
          if (episode.done) {
            json(res, 200, { reward: 0.0, done: true }); return;
          }

          const { action = 'CLICK', node_idx = -1 } = body;
          episode.step++;

          const domBefore = episode.lastDom;
          const tgt       = episode.targetText.toLowerCase();

          // ── Was target already visible before this action? ────────────────
          const wasVisible = targetVisible(domBefore, tgt);

          // ── Apply action to OS, capture whether state changed ─────────────
          const verBefore = headlessOs.version;
          headlessOs.handleAction(node_idx, domBefore, action);
          const domAfter     = headlessOs.getDom();
          const stateChanged = headlessOs.version > verBefore;

          // ── Is target visible AFTER the action? (appearance bonus) ────────
          const nowVisible = targetVisible(domAfter, tgt);

          // ── A: element_score — did the agent click the target text? ───────
          const clickedEl   = domBefore[node_idx];
          let elementScore  = 0.0;
          let actionScore   = 1.0;
          if (clickedEl) {
            const clickedText = (clickedEl.text ?? '').toLowerCase();
            if (clickedText.includes(tgt) || tgt.includes(clickedText)) {
              elementScore = 1.0;
              // action_score: icons need DOUBLE_CLICK, everything else CLICK
              const expected = getExpectedAction(clickedEl.type);
              actionScore    = (action === expected) ? 1.0 : 0.4;
            }
          }

          // ── B: visibility_bonus — target appeared in DOM after action ─────
          // Rewards navigation steps that expose the target (e.g. open start menu)
          const visibilityBonus = (!wasVisible && nowVisible) ? 0.05 : 0.0;

          // ── C: state_change_bonus — any OS state change (interaction proof)
          // Encourages the agent to interact vs. clicking empty areas
          const stateChangeBonus = stateChanged ? 0.03 : 0.0;

          // ── D: proximity_reward — clicked near target but missed ──────────
          // Helps coordinate learning when the agent "almost" found the target
          let proximityReward = 0.0;
          if (elementScore === 0.0 && clickedEl) {
            const targetEl = domBefore.find((el) => {
              const t = (el.text ?? '').toLowerCase();
              return t.includes(tgt) || tgt.includes(t);
            });
            if (targetEl) {
              const dx   = (clickedEl.x ?? 0) - (targetEl.x ?? 0);
              const dy   = (clickedEl.y ?? 0) - (targetEl.y ?? 0);
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 0.3) proximityReward = 0.1 * (1 - dist / 0.3);
            }
          }

          // ── E: exploration_bonus — new icons appeared after action ────────
          // Rewards actions that expand the visible UI (open menus, windows, etc.)
          const iconsBefore  = new Set(domBefore.filter(el => el.type === 'icon').map(el => el.text));
          const newIconCount = domAfter.filter(el => el.type === 'icon' && !iconsBefore.has(el.text)).length;
          const explorationBonus = Math.min(newIconCount * 0.04, 0.12); // +0.04 per new icon, cap 3

          // ── Final reward — sum all components, clamp to [0, 1] ───────────
          const reward = Math.min(
            1.0,
            elementScore * actionScore + visibilityBonus + stateChangeBonus + proximityReward + explorationBonus,
          );

          // Episode ends on full success (element + correct action) or timeout
          const stepInfo = {
            element_score:    elementScore,
            action_score:     actionScore,
            visibility_bonus: visibilityBonus,
            state_change:     stateChangeBonus,
            proximity:        proximityReward,
            exploration:      explorationBonus,
          };

          const done = (elementScore * actionScore >= 1.0) || episode.step >= RL_MAX_STEPS;
          episode.done       = done;
          episode.lastReward = reward;
          episode.lastInfo   = stepInfo;
          episode.lastDom    = domAfter;

          json(res, 200, { reward, done, info: stepInfo });
          return;
        }

        // ── GET /viewer → viewer.html ────────────────────────────────────────
        if (url === '/viewer' && req.method === 'GET') {
          res.statusCode = 302;
          res.setHeader('Location', '/viewer.html');
          res.end();
          return;
        }

        // ── GET /rl-viewer → rl-viewer.html ──────────────────────────────────
        if (url === '/rl-viewer' && req.method === 'GET') {
          res.statusCode = 302;
          res.setHeader('Location', '/rl-viewer.html');
          res.end();
          return;
        }

        // ── GET /rl/episode  (RL viewer polls this) ──────────────────────────
        if (url === '/rl/episode' && req.method === 'GET') {
          if (!episode) {
            json(res, 200, { active: false });
            return;
          }
          json(res, 200, {
            active:      true,
            instruction: episode.instruction,
            targetText:  episode.targetText,
            step:        episode.step,
            done:        episode.done,
            lastReward:  episode.lastReward,
            lastInfo:    episode.lastInfo,
          });
          return;
        }

        // ── GET /rl/os-state  (viewer polls to render live OS snapshot) ───────
        if (url === '/rl/os-state' && req.method === 'GET') {
          json(res, 200, {
            version: headlessOs.version,
            state:   headlessOs.state,
            dom:     episode ? episode.lastDom : [],
          });
          return;
        }

        // ── GET /api/getState/:instanceId ────────────────────────────────────
        const stateMatch = url.match(/^\/api\/getState\/(.+)$/);
        if (stateMatch && req.method === 'GET') {
          const instanceId = stateMatch[1];
          const inst = instances.get(instanceId);
          if (!inst) {
            json(res, 404, { ok: false, error: `Instance "${instanceId}" not found` }); return;
          }

          // Request the current state snapshot from the browser instance
          const commandId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          inst.commandCount++;

          const result = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              inst.pending.delete(commandId);
              reject(new Error('Timeout: browser instance did not respond within 30s'));
            }, 30_000);
            inst.pending.set(commandId, {
              commandId,
              command: { instanceId, type: 'GET_STATE', payload: {}, return: true },
              resolve,
              reject,
              timer,
            });
          }).catch((err) => ({ ok: false, error: err.message }));

          json(res, result.ok === false ? 504 : 200, result);
          return;
        }

        next();
      });

      server.httpServer?.once('listening', () => {
        const addr = server.httpServer.address();
        const port = typeof addr === 'object' ? addr.port : 5173;
        console.log(`\n  ◈ OSaaS Multi-Instance API`);
        console.log(`    POST http://localhost:${port}/api/createOS`);
        console.log(`    POST http://localhost:${port}/api/execute    { instanceId, type, payload }`);
        console.log(`    POST http://localhost:${port}/api/destroyOS  { instanceId }\n`);
      });
    },
  };
}

// ─── Vite config ──────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [react(), osaasApiPlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      input: {
        main:      path.resolve(__dirname, 'index.html'),
        viewer:    path.resolve(__dirname, 'viewer.html'),
        rlViewer:  path.resolve(__dirname, 'rl-viewer.html'),
      },
    },
  },
});
