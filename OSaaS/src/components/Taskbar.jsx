/**
 * Taskbar.jsx — with data-osaas-id on all interactive elements
 */

import { useState, useEffect } from 'react';
import { useOS } from '@/kernel/OSContext';

function getTaskbarStyle(pos, bg) {
  const base = { position: 'absolute', background: bg, display: 'flex', alignItems: 'center', zIndex: 1000 };
  switch (pos) {
    case 'top':   return { ...base, top: 0, left: 0, right: 0, height: 40, borderBottom: '1px solid rgba(255,255,255,0.08)' };
    case 'left':  return { ...base, left: 0, top: 0, bottom: 0, width: 52, flexDirection: 'column' };
    case 'right': return { ...base, right: 0, top: 0, bottom: 0, width: 52, flexDirection: 'column' };
    default:      return { ...base, bottom: 0, left: 0, right: 0, height: 40, borderTop: '1px solid rgba(255,255,255,0.08)' };
  }
}

export default function Taskbar() {
  const { state, dispatch } = useOS();
  const { visualConfig, windowsStack } = state;
  const { taskbarPosition, taskbarBg, accentColor, fontFamily } = visualConfig;
  const isH = taskbarPosition === 'top' || taskbarPosition === 'bottom';

  return (
    <div style={getTaskbarStyle(taskbarPosition, taskbarBg)}>
      {/* Start button */}
      <button
        data-osaas-id="start-button"
        data-osaas-label="Start Button"
        onClick={() => dispatch({ type: 'TOGGLE_START' })}
        style={{
          flexShrink:     0,
          background:     accentColor,
          border:         'none',
          color:          '#fff',
          cursor:         'pointer',
          fontWeight:     600,
          fontSize:       13,
          fontFamily,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            6,
          ...(isH
            ? { height: 40, padding: '0 18px' }
            : { width: 52, height: 44, padding: '4px 0', flexDirection: 'column', fontSize: 10 }
          ),
        }}
      >
        <span style={{ fontSize: 18 }}>⊞</span>
        {isH ? 'Start' : <span style={{ fontSize: 9 }}>Start</span>}
      </button>

      {/* Open windows */}
      <div
        style={{
          flex:          1,
          display:       'flex',
          flexDirection: isH ? 'row' : 'column',
          gap:           2,
          padding:       isH ? '0 6px' : '6px 4px',
          overflow:      'hidden',
        }}
      >
        {windowsStack.map((win) => (
          <button
            key={win.id}
            data-osaas-id={`taskbar-win-${win.id}`}
            data-osaas-label={`Taskbar: ${win.title}`}
            className="taskbar-btn"
            onClick={() => dispatch({ type: 'FOCUS_WINDOW', id: win.id })}
            style={{
              background:   win.focused ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)',
              border:       win.focused ? `1px solid ${accentColor}` : '1px solid rgba(255,255,255,0.12)',
              color:        '#fff',
              borderRadius: 3,
              cursor:       'pointer',
              fontSize:     11,
              fontFamily,
              whiteSpace:   'nowrap',
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              ...(isH
                ? { height: 32, padding: '0 12px', maxWidth: 140 }
                : { width: 44, height: 36, padding: '2px 0', fontSize: 9 }
              ),
            }}
          >
            {win.title}
          </button>
        ))}
      </div>

      {/* Clock */}
      <div style={{
        padding:    isH ? '0 14px' : '8px 0',
        color:      'rgba(255,255,255,0.75)',
        fontSize:   11,
        fontFamily,
        textAlign:  'center',
        flexShrink: 0,
      }}>
        <Clock />
      </div>
    </div>
  );
}

function Clock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const [t, setT] = useState(fmt);
  useEffect(() => { const id = setInterval(() => setT(fmt()), 1000); return () => clearInterval(id); }, []);
  return <>{t}</>;
}
