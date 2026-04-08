/**
 * ElementsPanel.jsx
 *
 * Panel derecho del viewer.
 * Muestra el DOM en formato DOMAgent: {text, type, x, y} con coordenadas
 * normalizadas 0-1, idéntico a lo que se graba en el dataset.
 * Se actualiza tras cada click.
 */

import { useState, useEffect, useCallback } from 'react';
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

const TYPE_COLOR = {
  button:   '#e06c75',
  icon:     '#61afef',
  menuitem: '#c678dd',
  tab:      '#56b6c2',
  input:    '#e5c07b',
  taskbar:  '#98c379',
  window:   '#abb2bf',
  element:  '#4b5263',
};

export default function ElementsPanel() {
  const { screenRef, getElementMap } = useOS();
  const [dom, setDom] = useState([]);

  const refresh = useCallback(() => {
    const elements = getElementMap();
    setDom(elements.map((el) => ({
      text: el.label,
      type: inferType(el.id),
      x:    parseFloat((el.cx / SCREEN_W).toFixed(4)),
      y:    parseFloat((el.cy / SCREEN_H).toFixed(4)),
      _idx: elements.indexOf(el),
    })));
  }, [getElementMap]);

  useEffect(() => {
    let el      = null;
    let timerId = null;

    const onPointer = () => refresh();

    const attach = () => {
      el = screenRef.current;
      if (!el) { timerId = setTimeout(attach, 100); return; }
      el.addEventListener('click',    onPointer);
      el.addEventListener('dblclick', onPointer);
      refresh(); // initial load
    };

    attach();
    return () => {
      clearTimeout(timerId);
      if (el) {
        el.removeEventListener('click',    onPointer);
        el.removeEventListener('dblclick', onPointer);
      }
    };
  }, [screenRef, refresh]);

  return (
    <div style={{
      flex:          '0 0 35%',
      height:        '100%',
      background:    '#0b0e14',
      borderLeft:    '1px solid #1c2230',
      display:       'flex',
      flexDirection: 'column',
      overflow:      'hidden',
      fontFamily:    '"Cascadia Code", "Courier New", monospace',
    }}>

      {/* Header */}
      <div style={{
        padding:      '10px 16px 8px',
        borderBottom: '1px solid #1c2230',
        flexShrink:   0,
        display:      'flex',
        alignItems:   'center',
        gap:          8,
      }}>
        <span style={{ color: '#4ec9b0', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          DOM
        </span>
        <span style={{
          background:   '#162230',
          color:        '#4ec9b0',
          fontSize:     10,
          padding:      '1px 7px',
          borderRadius: 10,
        }}>
          {dom.length}
        </span>
        <span style={{ color: '#2e3a4a', fontSize: 10, marginLeft: 'auto' }}>
          text · type · x · y
        </span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {dom.length === 0 ? (
          <p style={{ color: '#2e3a4a', fontSize: 11, padding: '12px 16px', margin: 0 }}>
            Haz click para cargar el DOM…
          </p>
        ) : (
          dom.map((el, i) => (
            <div
              key={i}
              style={{
                display:   'grid',
                gridTemplateColumns: '22px 1fr 70px 52px 52px',
                alignItems: 'center',
                gap:        6,
                padding:    '4px 12px',
                borderBottom: '1px solid #0d1018',
                background: i % 2 === 0 ? 'transparent' : '#0d1018',
                fontSize:   11,
              }}
            >
              {/* Index */}
              <span style={{ color: '#2e3a4a', textAlign: 'right' }}>{i}</span>

              {/* Text */}
              <span style={{
                color:         '#abb2bf',
                overflow:      'hidden',
                textOverflow:  'ellipsis',
                whiteSpace:    'nowrap',
              }}>
                {el.text}
              </span>

              {/* Type badge */}
              <span style={{
                color:        TYPE_COLOR[el.type] ?? '#4b5263',
                fontSize:     10,
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }}>
                {el.type}
              </span>

              {/* x */}
              <span style={{ color: '#4a6080', textAlign: 'right' }}>
                {el.x.toFixed(3)}
              </span>

              {/* y */}
              <span style={{ color: '#4a6080', textAlign: 'right' }}>
                {el.y.toFixed(3)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {dom.length > 0 && (
        <div style={{
          padding:    '5px 16px',
          borderTop:  '1px solid #1c2230',
          color:      '#2e3a4a',
          fontSize:   10,
          flexShrink: 0,
        }}>
          click o doble-click para actualizar
        </div>
      )}
    </div>
  );
}
