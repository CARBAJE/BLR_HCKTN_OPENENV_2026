/**
 * OSContext.jsx
 *
 * OS Kernel context.
 * OSProvider now accepts an optional `initialState` prop so each headless
 * instance can start from its own randomized state (via createInitialState()).
 */

import {
  createContext, useContext, useReducer,
  useRef, useCallback, useState,
} from 'react';
import reducer                        from './reducer';
import { createInitialState }         from './initialState';

const OSContext = createContext(null);

export function useOS() {
  const ctx = useContext(OSContext);
  if (!ctx) throw new Error('useOS must be used inside <OSProvider>');
  return ctx;
}

export function OSProvider({ children, initialState }) {
  // Each provider instance gets its own reducer — completely isolated state
  const [state, dispatch] = useReducer(
    reducer,
    initialState ?? createInitialState()
  );

  const screenRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [visibleElements, setVisibleElements] = useState([]);

  // ── takeScreenshot ──────────────────────────────────────────────────────────
  const takeScreenshot = useCallback(async () => {
    if (!screenRef.current) return null;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(screenRef.current, {
        scale:      0.35,
        useCORS:    true,
        logging:    false,
        allowTaint: true,
      });
      const base64 = canvas.toDataURL('image/jpeg', 0.70);
      dispatch({ type: 'LOG_EVENT', event: { action: 'SCREENSHOT_TAKEN', timestamp: Date.now() } });
      return base64;
    } catch (err) {
      console.warn('[OSaaS] html2canvas failed, using fallback.', err);
      return _fallbackScreenshot(state.visualConfig.desktopBg);
    }
  }, [state.visualConfig.desktopBg]);

  // ── getElementMap ───────────────────────────────────────────────────────────
  const getElementMap = useCallback(() => {
    if (!screenRef.current) return [];
    const dr = screenRef.current.getBoundingClientRect();
    return [...screenRef.current.querySelectorAll('[data-osaas-id]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 || r.height > 0;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const x = Math.round(r.left - dr.left);
        const y = Math.round(r.top  - dr.top);
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        return { id: el.dataset.osaasId, label: el.dataset.osaasLabel || el.dataset.osaasId, x, y, w, h, cx: Math.round(x + w / 2), cy: Math.round(y + h / 2) };
      });
  }, []);

  // ── getVisibleElements — occlusion-aware ────────────────────────────────────
  const getVisibleElements = useCallback(() => {
    if (!screenRef.current) return [];
    const dr      = screenRef.current.getBoundingClientRect();
    const overlay = screenRef.current.querySelector('[data-osaas-overlay]');
    if (overlay) overlay.style.pointerEvents = 'none';

    const results = [...screenRef.current.querySelectorAll('[data-osaas-id]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        // Hit-test the center point — if the topmost element is this el or a descendant, it's visible
        const cx = r.left + r.width  / 2;
        const cy = r.top  + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        if (!top) return false;
        let node = top;
        while (node && node !== screenRef.current) {
          if (node === el) return true;
          node = node.parentElement;
        }
        return false;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id:    el.dataset.osaasId,
          label: el.dataset.osaasLabel || el.dataset.osaasId,
          x: Math.round(r.left - dr.left),
          y: Math.round(r.top  - dr.top),
        };
      });

    if (overlay) overlay.style.pointerEvents = '';
    return results;
  }, []);

  // ── Semantic hit-test ───────────────────────────────────────────────────────
  function findOsaasId(el) {
    let node = el;
    while (node && node !== screenRef.current) {
      if (node.dataset?.osaasId) return { id: node.dataset.osaasId, el: node };
      node = node.parentElement;
    }
    return { id: null, el };
  }

  function dispatchSemantic(id, targetEl, isDouble) {
    if (!id) return false;
    if (id === 'start-button') { dispatch({ type: 'TOGGLE_START' }); return true; }
    if (id.startsWith('taskbar-win-')) { dispatch({ type: 'FOCUS_WINDOW', id: parseInt(id.replace('taskbar-win-', ''), 10) }); return true; }
    if (id.startsWith('win-titlebar-')) { dispatch({ type: 'FOCUS_WINDOW', id: parseInt(id.replace('win-titlebar-', ''), 10) }); return true; }
    if (id.startsWith('win-close-')) { dispatch({ type: 'CLOSE_WINDOW', id: parseInt(id.replace('win-close-', ''), 10) }); return true; }
    if (id.startsWith('desktop-icon-')) {
      targetEl?.dispatchEvent(new MouseEvent(isDouble ? 'dblclick' : 'click', { bubbles: true, cancelable: true, detail: isDouble ? 2 : 1 }));
      return true;
    }
    if (id.startsWith('start-menu-item-')) {
      targetEl?.click();
      return true;
    }
    if (id.startsWith('settings-tab-')) {
      targetEl?.click();
      return true;
    }
    if (['install-now-btn','close-installer-btn','customize-btn','path-checkbox','terminal-input',
         'settings-close-btn'].includes(id)) {
      targetEl?.click();
      return true;
    }
    return false;
  }

  // ── executeCommand ──────────────────────────────────────────────────────────
  const executeCommand = useCallback((jsonPayload) => {
    const { type, payload = {} } = jsonPayload;
    const baseEvent = { action: type, timestamp: Date.now() };

    switch (type) {
      case 'OPEN_WINDOW':
        dispatch({ type: 'OPEN_WINDOW', title: payload.title, component: payload.component, w: payload.w, h: payload.h, props: payload.props });
        break;
      case 'CLOSE_WINDOW':   dispatch({ type: 'CLOSE_WINDOW',  id: payload.id }); break;
      case 'FOCUS_WINDOW':   dispatch({ type: 'FOCUS_WINDOW',  id: payload.id }); break;
      case 'MOUSE_EVENT': {
        const { action = 'CLICK', position_x, position_y, target } = payload;
        const isDouble = action === 'DOUBLE_CLICK';
        if (target === 'startButton') {
          dispatch({ type: 'TOGGLE_START' });
          dispatch({ type: 'LOG_EVENT', event: { ...baseEvent, action, target } });
          return;
        }
        // Support normalized coordinates (0-1) — if both values are in [0,1),
        // treat as fractional and multiply by container dimensions.
        let isNormalized = false;
        if (position_x !== undefined && position_y !== undefined && screenRef.current) {
          const dr = screenRef.current.getBoundingClientRect();
          isNormalized = position_x >= 0 && position_x < 1 && position_y >= 0 && position_y < 1;
          const pixelX = isNormalized ? position_x * dr.width  : position_x;
          const pixelY = isNormalized ? position_y * dr.height : position_y;
          const absX = dr.left + pixelX;
          const absY = dr.top  + pixelY;
          const overlay = screenRef.current.querySelector('[data-osaas-overlay]');
          if (overlay) overlay.style.pointerEvents = 'none';
          const rawEl = document.elementFromPoint(absX, absY);
          if (overlay) overlay.style.pointerEvents = '';
          if (rawEl) {
            const { id, el } = findOsaasId(rawEl);
            if (!dispatchSemantic(id, el, isDouble)) {
              rawEl.dispatchEvent(new MouseEvent(isDouble ? 'dblclick' : 'click', { view: window, bubbles: true, cancelable: true, clientX: absX, clientY: absY, detail: isDouble ? 2 : 1 }));
            }
          }
        }
        dispatch({ type: 'LOG_EVENT', event: { ...baseEvent, action, coords: { x: position_x, y: position_y }, normalized: isNormalized } });
        return;
      }
      case 'KEYBOARD_EVENT': {
        const { key, text } = payload;
        if (key === 'Enter')      dispatch({ type: 'TERMINAL_EXEC' });
        else if (key === 'Backspace') dispatch({ type: 'TERMINAL_INPUT', value: (state.terminalInput ?? '').slice(0, -1) });
        else if (key === 'Ctrl+C')  { dispatch({ type: 'CLIPBOARD_SET', text: state.terminalInput }); dispatch({ type: 'TERMINAL_INPUT', value: '' }); }
        else if (text) dispatch({ type: 'TERMINAL_INPUT', value: (state.terminalInput ?? '') + text });
        dispatch({ type: 'LOG_EVENT', event: { ...baseEvent, key, text } });
        return;
      }
      case 'RANDOMIZE_UI':   dispatch({ type: 'RANDOMIZE_UI' }); break;
      case 'CLIPBOARD_SET':  dispatch({ type: 'CLIPBOARD_SET', text: payload.text }); break;
      case 'SCREENSHOT':     /* no-op — just captures current visual state */ break;
      default:
        console.warn(`[OSaaS] Unknown command: "${type}"`);
        dispatch({ type: 'LOG_EVENT', event: { ...baseEvent, action: 'UNKNOWN_COMMAND', original: type } });
        return;
    }
    dispatch({ type: 'LOG_EVENT', event: baseEvent });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.terminalInput]);

  return (
    <OSContext.Provider value={{ state, dispatch, screenRef, mousePos, setMousePos, executeCommand, takeScreenshot, getElementMap, getVisibleElements, visibleElements, setVisibleElements }}>
      {children}
    </OSContext.Provider>
  );
}

function _fallbackScreenshot(bgColor = '#1e3a5f') {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 240;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 400, 240);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = '13px sans-serif';
  ctx.fillText(`OSaaS — ${new Date().toLocaleTimeString()}`, 12, 24);
  return c.toDataURL('image/jpeg', 0.8);
}
