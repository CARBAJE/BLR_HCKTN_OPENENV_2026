/**
 * useAPIBridge.js
 *
 * Per-instance HTTP bridge.
 * Each headless OS instance runs this hook with its own instanceId.
 * Polls /api/poll?instanceId=xxx, executes commands, posts results.
 *
 * `return` attribute semantics:
 *   absent / false  →  include screenshot in response
 *   true            →  skip screenshot (faster)
 */

import { useEffect, useRef, useCallback } from 'react';

const POLL_MS       = 200;
const SETTLE_MS     = 80;

// ─── Human-readable message builder ──────────────────────────────────────────

function buildMessage(command, snapshot) {
  const { type, payload = {} } = command;
  switch (type) {
    case 'MOUSE_EVENT': {
      const a = payload.action || 'CLICK';
      if (payload.target === 'startButton') return `${a} → Start Button`;
      return `${a} at (${payload.position_x ?? '?'}, ${payload.position_y ?? '?'})`;
    }
    case 'KEYBOARD_EVENT':
      if (payload.key)  return `KEY "${payload.key}"`;
      if (payload.text) return `TYPE "${payload.text}"`;
      return 'KEYBOARD_EVENT';
    case 'OPEN_WINDOW':  return `Window opened → "${payload.title}" (${payload.component})`;
    case 'CLOSE_WINDOW': return `Window closed → id ${payload.id}`;
    case 'FOCUS_WINDOW': return `Window focused → id ${payload.id}`;
    case 'RANDOMIZE_UI': return `UI randomized → taskbar:${snapshot?.visualConfig?.taskbarPosition} accent:${snapshot?.visualConfig?.accentColor}`;
    case 'CLIPBOARD_SET': return `Clipboard → "${(payload.text || '').slice(0, 40)}"`;
    default: return `${type} executed`;
  }
}

function buildStateView(instanceId, state) {
  const visibleWindows = state.windowsStack.filter((w) => !w.minimized);
  const focused = visibleWindows.find((w) => w.focused)
    ?? visibleWindows[visibleWindows.length - 1];

  let current_view = 'desktop';
  if (focused) {
    const c = focused.component?.toLowerCase() ?? '';
    if (c.includes('explorer'))    current_view = 'explorer';
    else if (c.includes('terminal'))   current_view = 'terminal';
    else if (c.includes('textviewer')) current_view = 'textviewer';
    else current_view = c || 'desktop';
  }

  const explorerWin = visibleWindows.find((w) =>
    w.component?.toLowerCase().includes('explorer'),
  );
  const current_folder = explorerWin?.props?.initialPath
    ? explorerWin.props.initialPath.join('/')
    : null;

  // Desktop FS files
  const desktopChildren =
    state.fileSystem?.['C:']?.children?.Users?.children?.Admin?.children?.Desktop?.children ?? {};
  const downloadsChildren =
    state.fileSystem?.['C:']?.children?.Users?.children?.Admin?.children?.Downloads?.children ?? {};

  const mapEntries = (folder, basePath) =>
    Object.entries(folder).map(([name, item]) => ({
      name,
      type: item.type,
      ext:  item.ext  ?? null,
      icon: item.icon ?? null,
      path: `${basePath}/${name}`,
    }));

  const BASE_ICONS = ['This PC', 'Downloads', 'System Settings', 'Recycle Bin'];
  const visible_icons = [
    ...BASE_ICONS,
    ...(state.installedApps.includes('Python') ? ['Python 3.12'] : []),
    ...Object.keys(desktopChildren),
  ];

  return {
    ok:               true,
    instanceId,
    current_view,
    open_windows:     state.windowsStack.map((w) => ({
      id:        w.id,
      title:     w.title,
      component: w.component,
      focused:   w.focused   ?? false,
      minimized: w.minimized ?? false,
      maximized: w.maximized ?? false,
    })),
    current_folder,
    visible_icons,
    desktop_files:    mapEntries(desktopChildren,   'C:/Users/Admin/Desktop'),
    downloads_files:  mapEntries(downloadsChildren, 'C:/Users/Admin/Downloads'),
    installed_apps:   state.installedApps,
    taskbar_position: state.visualConfig.taskbarPosition,
    wallpaper:        state.visualConfig.wallpaper ?? null,
    timestamp:        new Date().toISOString(),
  };
}

function buildSnapshot(state) {
  return {
    installedApps:  state.installedApps,
    openWindows:    state.windowsStack.map((w) => ({ id: w.id, title: w.title, component: w.component })),
    environmentVariables: state.environmentVariables,
    visualConfig: {
      taskbarPosition: state.visualConfig.taskbarPosition,
      accentColor:     state.visualConfig.accentColor,
      fontFamily:      state.visualConfig.fontFamily,
      dpiScale:        state.visualConfig.dpiScale,
    },
    lastAction: state.lastAction,
  };
}

/**
 * Lightweight djb2 hash of a JSON-serialized snapshot.
 * Returns an 8-char hex string, e.g. "a3f92c01".
 * Stable: same state → same hash; any state change → different hash.
 */
function stateHash(snapshot) {
  const str = JSON.stringify({
    apps:    snapshot.installedApps,
    windows: snapshot.openWindows.map((w) => w.id + ':' + w.component),
    env:     snapshot.environmentVariables.PATH,
    taskbar: snapshot.visualConfig.taskbarPosition,
    last:    snapshot.lastAction,
  });
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const SCREEN_W = 1280;
const SCREEN_H = 720;

function inferType(id) {
  if (id === 'start-button')             return 'button';
  if (id.startsWith('desktop-icon-'))    return 'icon';
  if (id.startsWith('taskbar-win-'))     return 'taskbar';
  if (id.startsWith('win-titlebar-'))    return 'window';
  if (id.startsWith('win-close-'))       return 'button';
  if (id.startsWith('start-menu-item-')) return 'menuitem';
  if (id.startsWith('settings-tab-'))    return 'tab';
  if (id === 'terminal-input')           return 'input';
  if (id.endsWith('-btn'))               return 'button';
  return 'element';
}

export default function useAPIBridge({ instanceId, state, executeCommand, takeScreenshot, getElementMap }) {
  const stateRef     = useRef(state);
  const executingRef = useRef(false);
  const aliveRef     = useRef(true);

  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Process one command ───────────────────────────────────────────────────
  const processCommand = useCallback(async ({ commandId, command }) => {
    if (executingRef.current) return;
    executingRef.current = true;

    try {
      // GET_DOM: return visible interactive elements in normalized DOMAgent format
      if (command.type === 'GET_DOM') {
        const elements = getElementMap();
        // getElementMap returns {id, label, cx, cy} where cx/cy are pixel centers
        // relative to the screen container — works correctly for off-screen instances
        const dom = elements.map((el) => ({
          text: el.label,
          type: inferType(el.id),
          x:    parseFloat((el.cx / SCREEN_W).toFixed(4)),
          y:    parseFloat((el.cy / SCREEN_H).toFixed(4)),
        }));
        await fetch('/api/result', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ instanceId, commandId, result: { ok: true, dom } }),
        });
        return;
      }

      // GET_STATE: return current state without executing anything
      if (command.type === 'GET_STATE') {
        const result = buildStateView(instanceId, stateRef.current);
        await fetch('/api/result', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ instanceId, commandId, result }),
        });
        return;
      }

      const wantsScreenshot  = command.return !== true;
      // capture_before: true  → include screenshot_before in response (slower)
      // capture_before: false → skip before-screenshot (default, faster)
      const wantsBefore      = wantsScreenshot && command.capture_before === true;

      // Capture state BEFORE executing (only when explicitly requested)
      const screenshotBefore = wantsBefore ? await takeScreenshot() : undefined;

      executeCommand(command);
      await new Promise((r) => setTimeout(r, SETTLE_MS));

      const snapshot         = buildSnapshot(stateRef.current);
      const message          = buildMessage(command, snapshot);
      const screenshot       = wantsScreenshot ? await takeScreenshot() : undefined;

      const result = {
        ok:         true,
        instanceId,
        timestamp:  Date.now(),
        command:    { type: command.type, payload: command.payload },
        message,
        state_hash: stateHash(snapshot),
        state:      snapshot,
        ...(wantsScreenshot ? { screenshot } : {}),
        ...(wantsBefore     ? { screenshot_before: screenshotBefore } : {}),
      };

      await fetch('/api/result', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ instanceId, commandId, result }),
      });

    } catch (err) {
      await fetch('/api/result', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          instanceId, commandId,
          result: { ok: false, instanceId, error: err.message, timestamp: Date.now() },
        }),
      }).catch(() => {});
    } finally {
      executingRef.current = false;
    }
  }, [instanceId, executeCommand, takeScreenshot]);

  // ── Polling loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    aliveRef.current = true;

    async function poll() {
      if (!aliveRef.current) return;
      try {
        const res  = await fetch(`/api/poll?instanceId=${instanceId}`);
        const data = await res.json();
        if (data) await processCommand(data);
      } catch { /* server not ready or instance gone — retry next tick */ }
    }

    const id = setInterval(poll, POLL_MS);
    return () => { aliveRef.current = false; clearInterval(id); };
  }, [instanceId, processCommand]);

  // ── window.OSaaS (browser automation) ────────────────────────────────────
  // Keyed by instanceId so multiple instances don't overwrite each other
  useEffect(() => {
    if (!window.OSaaS) window.OSaaS = {};
    window.OSaaS[instanceId] = {
      execute: async (command) => {
        const wantsScreenshot = command.return !== true;
        const wantsBefore     = wantsScreenshot && command.capture_before === true;
        const screenshotBefore = wantsBefore ? await takeScreenshot() : undefined;
        executeCommand(command);
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        const snapshot = buildSnapshot(stateRef.current);
        const screenshot = wantsScreenshot ? await takeScreenshot() : undefined;
        return {
          ok:         true,
          instanceId,
          timestamp:  Date.now(),
          command:    { type: command.type, payload: command.payload },
          message:    buildMessage(command, snapshot),
          state_hash: stateHash(snapshot),
          state:      snapshot,
          ...(wantsScreenshot ? { screenshot } : {}),
          ...(wantsBefore     ? { screenshot_before: screenshotBefore } : {}),
        };
      },
      getState: () => buildSnapshot(stateRef.current),
    };
    return () => { if (window.OSaaS) delete window.OSaaS[instanceId]; };
  }, [instanceId, executeCommand, takeScreenshot]);
}
