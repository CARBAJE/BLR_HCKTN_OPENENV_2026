/**
 * VirtualDesktop.jsx
 *
 * Changes vs previous version:
 *  - Icons placed on a random non-colliding grid (useEffect on mount / icon set change)
 *  - Minimized windows are not rendered (only in taskbar)
 *  - Desktop icons read from fileSystem C:/Users/Admin/Desktop
 *  - TextViewerApp added to WINDOW_REGISTRY
 */

import { useState, useEffect } from 'react';
import { useOS } from '@/kernel/OSContext';
import DesktopIcon       from '../DesktopIcon';
import Taskbar           from '../Taskbar';
import StartMenu         from '../StartMenu';
import WinFrame          from '@/components/windows/WinFrame';
import TerminalApp       from '@/components/windows/TerminalApp';
import ExplorerApp       from '@/components/windows/ExplorerApp';
import PythonInstallerApp from '@/components/windows/PythonInstallerApp';
import SystemSettingsApp from '@/components/windows/SystemSettingsApp';
import TextViewerApp     from '@/components/windows/TextViewerApp';
import SystemRunnerApp   from '@/components/windows/SystemRunnerApp';

const WINDOW_REGISTRY = {
  Terminal:        TerminalApp,
  Explorer:        ExplorerApp,
  PythonInstaller: PythonInstallerApp,
  SystemSettings:  SystemSettingsApp,
  TextViewer:      TextViewerApp,
  SystemRunner:    SystemRunnerApp,
};

// Grid cell size (px). Icons are 76px wide; 90×96 gives comfortable spacing.
const CELL_W = 90;
const CELL_H = 96;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeGrid(icons, taskbarPosition) {
  const isH     = taskbarPosition === 'top' || taskbarPosition === 'bottom';
  const padLeft = taskbarPosition === 'left'  ? 56 : 4;
  const padTop  = taskbarPosition === 'top'   ? 44 : 4;
  const availW  = isH ? 1280 : 1280 - 52;
  const availH  = isH ? 720  - 42 : 720;

  const cols  = Math.max(1, Math.floor(availW / CELL_W));
  const rows  = Math.max(1, Math.floor(availH / CELL_H));

  const cells = shuffleArray(
    Array.from({ length: cols * rows }, (_, i) => [i % cols, Math.floor(i / cols)])
  );

  const positions = {};
  icons.forEach((ico, idx) => {
    if (idx >= cells.length) return;
    const [c, r] = cells[idx];
    positions[ico.label] = {
      left: padLeft + c * CELL_W,
      top:  padTop  + r * CELL_H,
    };
  });
  return positions;
}

function getDesktopPadding(pos) {
  return {
    paddingTop:    pos === 'top'    ? 40 : 0,
    paddingBottom: pos === 'bottom' ? 40 : 0,
    paddingLeft:   pos === 'left'   ? 52 : 0,
    paddingRight:  pos === 'right'  ? 52 : 0,
  };
}

export default function VirtualDesktop() {
  const { state, dispatch, screenRef, mousePos, setMousePos, getVisibleElements, setVisibleElements } = useOS();
  const { visualConfig, windowsStack, installedApps, fileSystem } = state;
  const { taskbarPosition, desktopBg, desktopBgImage, fontFamily } = visualConfig;

  // ── Build full icon list ──────────────────────────────────────────────────

  const desktopFolder =
    fileSystem?.['C:']?.children?.Users?.children?.Admin?.children?.Desktop?.children ?? {};

  const allIcons = [
    { icon: 'this-pc',     label: 'This PC',         component: 'Explorer' },
    { icon: 'folder',      label: 'Downloads',        component: 'Explorer',
      props: { initialPath: ['C:', 'Users', 'Admin', 'Downloads'] } },
    { icon: 'settings',    label: 'System Settings',  component: 'SystemSettings' },
    { icon: 'trash-empty', label: 'Recycle Bin',      component: null },
    ...(installedApps.includes('Python')
      ? [{ icon: 'python-main', label: 'Python 3.12', component: 'Terminal' }]
      : []),
    ...Object.entries(desktopFolder).map(([name, item]) => ({
      label:     name,
      icon:      item.type === 'folder' ? 'folder' : (item.icon ?? '/assets/icons/file.png'),
      component: item.type === 'folder' ? 'Explorer'
               : (item.component       // explicit override from FS
               ?? (item.ext === 'txt'  ? 'TextViewer'
                 : item.ext === 'exe'  ? 'SystemRunner'
                 : null)),
      props: item.type === 'folder'
        ? { initialPath: ['C:', 'Users', 'Admin', 'Desktop', name] }
        : {
            content:  item.content ?? '',
            filename: name,
            filePath: ['C:', 'Users', 'Admin', 'Desktop', name],
          },
    })),
  ];

  // ── Grid positions ────────────────────────────────────────────────────────

  const [positions, setPositions] = useState({});

  // Stable key: re-grid only when icon set or taskbar position changes
  const iconKey = allIcons.map((i) => i.label).sort().join('|');

  useEffect(() => {
    setPositions(computeGrid(allIcons, taskbarPosition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iconKey, taskbarPosition]);

  // ── Update visible elements after any click/dblclick ─────────────────────

  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const handle = () => {
      // Wait for React re-render triggered by the click to flush to DOM
      setTimeout(() => setVisibleElements(getVisibleElements()), 100);
    };
    el.addEventListener('click',    handle);
    el.addEventListener('dblclick', handle);
    return () => {
      el.removeEventListener('click',    handle);
      el.removeEventListener('dblclick', handle);
    };
  // screenRef.current is stable after mount; getVisibleElements/setVisibleElements are stable callbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleDesktopClick = (e) => {
    if (e.target === e.currentTarget || e.target.dataset.desktopBg) {
      dispatch({ type: 'CLOSE_START' });
    }
  };

  const handleMouseMove = (e) => {
    const rect = screenRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({
      x: Math.round(e.clientX - rect.left),
      y: Math.round(e.clientY - rect.top),
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={screenRef}
      data-desktop-bg="true"
      onClick={handleDesktopClick}
      onMouseMove={handleMouseMove}
      style={{
        position:           'relative',
        width:              '100%',
        height:             '100%',
        overflow:           'hidden',
        boxSizing:          'border-box',
        fontFamily,
        backgroundColor:    desktopBg,
        backgroundImage:    desktopBgImage ? `url(${desktopBgImage})` : 'none',
        backgroundSize:     'cover',
        backgroundPosition: 'center',
        backgroundRepeat:   'no-repeat',
        ...getDesktopPadding(taskbarPosition),
      }}
    >
      {/* Desktop icons — absolutely positioned via grid */}
      {allIcons.map((ico) => {
        const pos = positions[ico.label];
        if (!pos) return null;
        return (
          <DesktopIcon
            key={ico.label}
            icon={ico.icon}
            label={ico.label}
            style={pos}
            onDoubleClick={() => {
              if (!ico.component) return;
              dispatch({
                type:      'OPEN_WINDOW',
                title:     ico.label,
                component: ico.component,
                props:     ico.props ?? {},
              });
            }}
          />
        );
      })}

      {/* Window layer — skip minimized windows */}
      {windowsStack
        .filter((win) => !win.minimized)
        .map((win) => {
          const Content = WINDOW_REGISTRY[win.component];
          return Content ? (
            <WinFrame key={win.id} win={win}>
              <Content winId={win.id} {...win.props} />
            </WinFrame>
          ) : null;
        })}

      <Taskbar />
      <StartMenu />
      <MouseTracker pos={mousePos} />
    </div>
  );
}

function MouseTracker({ pos }) {
  return (
    <div
      data-osaas-overlay="1"
      style={{
        position:      'absolute',
        bottom:        44,
        right:         6,
        background:    'rgba(0,0,0,0.72)',
        border:        '1px solid rgba(255,255,255,0.15)',
        borderRadius:  5,
        padding:       '4px 10px',
        color:         '#4ec9b0',
        fontFamily:    '"Cascadia Code","Courier New",monospace',
        fontSize:      11,
        zIndex:        9000,
        pointerEvents: 'none',
        lineHeight:    1.6,
        whiteSpace:    'nowrap',
      }}
    >
      <span style={{ color: '#888' }}>x:</span>{' '}
      <span style={{ color: '#fff', minWidth: 30, display: 'inline-block' }}>{pos.x}</span>
      {'  '}
      <span style={{ color: '#888' }}>y:</span>{' '}
      <span style={{ color: '#fff' }}>{pos.y}</span>
    </div>
  );
}
