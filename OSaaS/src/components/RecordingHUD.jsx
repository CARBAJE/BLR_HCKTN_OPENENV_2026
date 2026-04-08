/**
 * RecordingHUD.jsx
 *
 * Panel de grabación para generar datasets en formato DOMAgent:
 *   { instruction, dom: [{text, type, x, y}], clicked_node_idx, action }
 *
 * Flujo:
 *   1. El usuario escribe la instrucción en el campo de texto
 *   2. Hace click / doble-click sobre el OS
 *   3. Se captura el DOM normalizado y se resuelve el índice del elemento clickeado
 *   4. "Exportar dataset" descarga el JSON completo
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useOS } from '@/kernel/OSContext';

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

export default function RecordingHUD({ instanceId, onRestart }) {
  const { screenRef, getElementMap } = useOS();

  const [instruction, setInstruction] = useState('');
  const [dataset, setDataset]         = useState([]);
  const [lastStep, setLastStep]       = useState(null);

  const datasetRef    = useRef([]);
  const instructionRef = useRef('');

  // Keep ref in sync so event handlers always see the latest value
  useEffect(() => { instructionRef.current = instruction; }, [instruction]);

  // ── Event listeners sobre el OS ─────────────────────────────────────────────

  const enqueue = useCallback((normX, normY, isDouble) => {
    const elements = getElementMap();

    const dom = elements.map((el) => ({
      text: el.label,
      type: inferType(el.id),
      x:    parseFloat((el.cx / SCREEN_W).toFixed(4)),
      y:    parseFloat((el.cy / SCREEN_H).toFixed(4)),
    }));

    // Closest element center to the click point
    let clicked_node_idx = 0;
    let minDist = Infinity;
    dom.forEach((domEl, i) => {
      const d = Math.hypot(domEl.x - normX, domEl.y - normY);
      if (d < minDist) { minDist = d; clicked_node_idx = i; }
    });

    const step = {
      instruction:       instructionRef.current || '(sin instrucción)',
      dom,
      clicked_node_idx,
      action: isDouble ? 'DOUBLE_CLICK' : 'CLICK',
    };

    datasetRef.current = [...datasetRef.current, step];
    setDataset([...datasetRef.current]);
    setLastStep(step);
  }, [getElementMap]);

  useEffect(() => {
    let el      = null;
    let timerId = null;

    const onPointer = (e) => {
      if (e.type === 'click' && e.detail >= 2) return; // skip synthetic from dblclick
      const rect   = el.getBoundingClientRect();
      const normX  = parseFloat(((e.clientX - rect.left) / rect.width).toFixed(4));
      const normY  = parseFloat(((e.clientY - rect.top)  / rect.height).toFixed(4));
      enqueue(normX, normY, e.type === 'dblclick');
    };

    const attach = () => {
      el = screenRef.current;
      if (!el) { timerId = setTimeout(attach, 100); return; }
      el.addEventListener('click',    onPointer);
      el.addEventListener('dblclick', onPointer);
    };

    attach();
    return () => {
      clearTimeout(timerId);
      if (el) {
        el.removeEventListener('click',    onPointer);
        el.removeEventListener('dblclick', onPointer);
      }
    };
  }, [screenRef, enqueue]);

  // ── Export ───────────────────────────────────────────────────────────────────

  const exportDataset = () => {
    if (datasetRef.current.length === 0) return;
    const blob = new Blob(
      [JSON.stringify(datasetRef.current, null, 2)],
      { type: 'application/json' },
    );
    const url  = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
      href:     url,
      download: `dataset-${Date.now()}.json`,
    });
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearDataset = () => {
    datasetRef.current = [];
    setDataset([]);
    setLastStep(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasSteps = dataset.length > 0;

  return (
    <div style={{
      position:   'fixed',
      bottom:     0, left: 0, right: 0,
      background: '#0c0c18',
      borderTop:  '1px solid #1a1a30',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      zIndex:     9999,
    }}>

      {/* Last step preview */}
      {lastStep && (
        <div style={{
          padding:     '5px 20px',
          borderBottom: '1px solid #12121f',
          display:     'flex',
          gap:         12,
          alignItems:  'baseline',
          fontSize:    11,
          color:       '#555',
          overflow:    'hidden',
        }}>
          <span style={{ color: lastStep.action === 'DOUBLE_CLICK' ? '#e5c07b' : '#61afef', flexShrink: 0 }}>
            {lastStep.action}
          </span>
          <span style={{ color: '#4ec9b0', flexShrink: 0 }}>
            idx {lastStep.clicked_node_idx}
          </span>
          <span style={{ color: '#888', flexShrink: 0 }}>
            "{lastStep.dom[lastStep.clicked_node_idx]?.text}"
          </span>
          <span style={{ color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            ← {lastStep.instruction}
          </span>
        </div>
      )}

      {/* Controls row */}
      <div style={{
        height:     52,
        display:    'flex',
        alignItems: 'center',
        padding:    '0 20px',
        gap:        12,
      }}>
        {/* Recording indicator */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#e74c3c', boxShadow: '0 0 6px #e74c3c',
          flexShrink: 0,
        }} />

        {/* Instruction input */}
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()} // don't forward to OS
          placeholder="Escribe la instrucción antes de hacer click…"
          style={{
            flex:        1,
            background:  '#12121f',
            border:      '1px solid #2a2a3a',
            borderRadius: 5,
            color:       '#ddd',
            fontSize:    13,
            padding:     '6px 12px',
            outline:     'none',
            minWidth:    0,
          }}
        />

        {/* Step count */}
        <span style={{
          color:     hasSteps ? '#e74c3c' : '#333',
          fontSize:  14,
          fontWeight:'bold',
          minWidth:  60,
          flexShrink: 0,
          textAlign: 'right',
        }}>
          {dataset.length} paso{dataset.length !== 1 ? 's' : ''}
        </span>

        <button
          onClick={onRestart}
          style={btnStyle('#1a1a2a', '#666')}
        >
          ↺ Reiniciar OS
        </button>

        <button
          onClick={clearDataset}
          disabled={!hasSteps}
          style={btnStyle('#1a1a2a', hasSteps ? '#e07b7b' : '#333')}
        >
          ✕ Limpiar
        </button>

        <button
          onClick={exportDataset}
          disabled={!hasSteps}
          style={btnStyle(
            hasSteps ? '#2563eb' : '#1a1a2a',
            hasSteps ? '#fff'    : '#333',
            hasSteps,
          )}
        >
          ↓ Exportar dataset
        </button>
      </div>
    </div>
  );
}

function btnStyle(bg, color, pointer = true) {
  return {
    background:   bg,
    color,
    border:       '1px solid #2a2a3a',
    padding:      '7px 16px',
    borderRadius: 5,
    cursor:       pointer ? 'pointer' : 'default',
    fontSize:     13,
    fontWeight:   color === '#fff' ? 'bold' : 'normal',
    flexShrink:   0,
  };
}
