/**
 * WinFrame.jsx — draggable window chrome with minimize / maximize / close
 *
 * Minimize  → hides window (still in taskbar, click to restore)
 * Maximize  → fills the desktop viewport; click again to restore
 * Dragging  → disabled when maximized
 */

import { useEffect, useRef } from 'react';
import { useOS } from '@/kernel/OSContext';

export default function WinFrame({ win, children }) {
  const { state, dispatch } = useOS();
  const { id, title, focused, x, y, w, h, maximized } = win;
  const { accentColor, taskbarPosition } = state.visualConfig;

  const dragging  = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, wx: 0, wy: 0 });

  const onTitleMouseDown = (e) => {
    if (e.target.closest('button')) return;
    if (maximized) return;                          // no drag when maximized
    dispatch({ type: 'FOCUS_WINDOW', id });
    dragging.current  = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, wx: x, wy: y };
  };

  useEffect(() => {
    const mm = (e) => {
      if (!dragging.current) return;
      const { mx, my, wx, wy } = dragStart.current;
      dispatch({ type: 'MOVE_WINDOW', id, x: wx + (e.clientX - mx), y: wy + (e.clientY - my) });
    };
    const mu = () => { dragging.current = false; };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup',   mu);
    return () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup',   mu);
    };
  }, [id]);

  // Maximized: fill desktop area, respecting taskbar so it stays visible.
  // Taskbar is horizontal (top/bottom) → 40px; vertical (left/right) → 52px.
  const TB_H = 40;  // horizontal taskbar height
  const TB_W = 52;  // vertical taskbar width

  const maximizedGeom = (() => {
    switch (taskbarPosition) {
      case 'top':
        return { left: 0, top: TB_H, width: '100%', height: `calc(100% - ${TB_H}px)` };
      case 'left':
        return { left: TB_W, top: 0, width: `calc(100% - ${TB_W}px)`, height: '100%' };
      case 'right':
        return { left: 0, top: 0, width: `calc(100% - ${TB_W}px)`, height: '100%' };
      default: // bottom
        return { left: 0, top: 0, width: '100%', height: `calc(100% - ${TB_H}px)` };
    }
  })();

  const frameStyle = maximized
    ? { position: 'absolute', ...maximizedGeom, zIndex: 550 }  // above icons (10), below taskbar (1000)
    : { position: 'absolute', left: x, top: y, width: w, height: h, zIndex: focused ? 500 : 400 };

  return (
    <div
      onMouseDown={() => dispatch({ type: 'FOCUS_WINDOW', id })}
      style={{
        ...frameStyle,
        display:       'flex',
        flexDirection: 'column',
        border:        `1px solid ${focused ? 'rgba(255,255,255,0.25)' : 'rgba(80,80,100,0.4)'}`,
        borderRadius:  maximized ? 0 : 6,
        overflow:      'hidden',
        boxShadow:     focused ? '0 12px 40px rgba(0,0,0,0.65)' : '0 4px 12px rgba(0,0,0,0.35)',
      }}
    >
      {/* Title bar */}
      <div
        data-osaas-id={`win-titlebar-${id}`}
        data-osaas-label={`Window title bar: ${title}`}
        onMouseDown={onTitleMouseDown}
        className="no-select"
        style={{
          height:     32,
          background: focused ? accentColor : '#3a3a4a',
          display:    'flex',
          alignItems: 'center',
          padding:    '0 8px',
          cursor:     maximized ? 'default' : 'move',
          flexShrink: 0,
          gap:        6,
        }}
      >
        <span style={{
          flex: 1, color: '#fff', fontSize: 12,
          fontWeight: 500, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </span>

        {/* Minimize */}
        <button
          data-osaas-id={`win-min-${id}`}
          data-osaas-label={`Minimize: ${title}`}
          className="win-ctrl"
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'MINIMIZE_WINDOW', id }); }}
          style={ctrlStyle}
        >─</button>

        {/* Maximize / Restore */}
        <button
          data-osaas-id={`win-max-${id}`}
          data-osaas-label={`${maximized ? 'Restore' : 'Maximize'}: ${title}`}
          className="win-ctrl"
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'MAXIMIZE_WINDOW', id }); }}
          style={ctrlStyle}
          title={maximized ? 'Restore' : 'Maximize'}
        >{maximized ? '❐' : '□'}</button>

        {/* Close */}
        <button
          data-osaas-id={`win-close-${id}`}
          data-osaas-label={`Close: ${title}`}
          className="win-ctrl win-ctrl-close"
          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'CLOSE_WINDOW', id }); }}
          style={ctrlStyle}
        >✕</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

const ctrlStyle = {
  background:     'rgba(255,255,255,0.12)',
  border:         'none',
  color:          '#fff',
  width:          24, height: 22,
  borderRadius:   3,
  cursor:         'pointer',
  fontSize:       11,
  display:        'flex',
  alignItems:     'center',
  justifyContent: 'center',
  flexShrink:     0,
};
