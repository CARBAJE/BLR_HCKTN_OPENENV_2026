/**
 * StartMenu.jsx
 *
 * Always pinned: Terminal, File Explorer, System Settings.
 * Random pinned: 2 apps picked once at mount from OPTIONAL_POOL.
 * Position adapts to the current taskbar side.
 */

import { useState } from 'react';
import { useOS } from '@/kernel/OSContext';

const ALWAYS_PINNED = [
  { name: 'Terminal',        icon: '⬛', component: 'Terminal' },
  { name: 'File Explorer',   icon: '📁', component: 'Explorer' },
  { name: 'System Settings', icon: '⚙️', component: 'SystemSettings' },
];

const OPTIONAL_POOL = [
  { name: 'Python Installer', icon: '🐍', component: 'PythonInstaller' },
  { name: 'Notepad',          icon: '📝', component: 'TextViewer',
    props: { content: '', filename: 'new.txt', filePath: null } },
  { name: 'Downloads',        icon: '📥', component: 'Explorer',
    props: { initialPath: ['C:', 'Users', 'Admin', 'Downloads'] } },
  { name: 'Documents',        icon: '🗂️', component: 'Explorer',
    props: { initialPath: ['C:', 'Users', 'Admin', 'Documents'] } },
  { name: 'System Runner',    icon: '▶️',  component: 'SystemRunner',
    props: { filename: 'cmd.exe' } },
];

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function getMenuPosition(pos) {
  switch (pos) {
    case 'top':    return { top: 40, left: 0 };
    case 'left':   return { top: 0, left: 52 };
    case 'right':  return { top: 0, right: 52 };
    default:       return { bottom: 40, left: 0 };
  }
}

export default function StartMenu() {
  const { state, dispatch } = useOS();
  const { startMenuOpen, visualConfig } = state;
  const { taskbarPosition, fontFamily, accentColor } = visualConfig;

  // Computed once at mount — stable across renders
  const [pinnedApps] = useState(() => [
    ...ALWAYS_PINNED,
    ...pickRandom(OPTIONAL_POOL, 2),
  ]);

  if (!startMenuOpen) return null;

  const openApp = (app) => {
    dispatch({
      type:      'OPEN_WINDOW',
      title:     app.name,
      component: app.component,
      props:     app.props ?? {},
    });
    dispatch({ type: 'CLOSE_START' });
  };

  return (
    <div style={{
      position:      'absolute',
      ...getMenuPosition(taskbarPosition),
      width:         300,
      background:    'rgba(22, 22, 40, 0.97)',
      borderRadius:  10,
      border:        '1px solid rgba(255,255,255,0.12)',
      zIndex:        2000,
      padding:       14,
      boxSizing:     'border-box',
      fontFamily,
      backdropFilter:'blur(8px)',
    }}>
      {/* Header */}
      <div style={{
        color:        'rgba(255,255,255,0.45)',
        fontSize:     10,
        letterSpacing:1.5,
        padding:      '0 8px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 10,
        textTransform:'uppercase',
      }}>
        Pinned
      </div>

      {/* App grid */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap:                 6,
        marginBottom:        10,
      }}>
        {pinnedApps.map((app) => {
          const safeId = app.name.replace(/\s+/g, '-').toLowerCase();
          return (
            <div
              key={app.name}
              className="start-menu-item"
              onClick={() => openApp(app)}
              data-osaas-id={`start-menu-item-${safeId}`}
              data-osaas-label={`Start menu item: ${app.name}`}
              style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            6,
                padding:        '10px 6px',
                borderRadius:   7,
                cursor:         'pointer',
                color:          '#fff',
                fontSize:       11,
                textAlign:      'center',
                background:     'rgba(255,255,255,0.04)',
              }}
            >
              <span style={{ fontSize: 24, lineHeight: 1 }}>{app.icon}</span>
              <span style={{ lineHeight: 1.3 }}>{app.name}</span>
            </div>
          );
        })}
      </div>

      {/* Separator */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0 10px' }} />

      {/* Footer */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        8,
        padding:    '6px 10px',
        color:      'rgba(255,255,255,0.55)',
        fontSize:   12,
      }}>
        <span style={{ fontSize: 18 }}>👤</span>
        <span style={{ flex: 1 }}>Admin</span>
        <span style={{ fontSize: 16, cursor: 'pointer' }}>⏻</span>
      </div>
    </div>
  );
}
