/**
 * ControlPanel.jsx
 *
 * Tabs:
 *   Quick    — one-click commands
 *   JSON API — raw command executor
 *   Map      — live element map (id, label, x, y, cx, cy)
 *   State    — kernel state view
 *   Log      — event log
 */

import { useState } from 'react';
import { useOS } from '@/kernel/OSContext';
import StateInspector from '../../debug/StateInspector';
import EventLog       from '../../debug/EventLog';

const TABS = ['Quick', 'JSON API', 'Map', 'State', 'Log'];

const JSON_EXAMPLES = [
  {
    label: 'CLICK (coords)',
    payload: { type: 'MOUSE_EVENT', payload: { action: 'CLICK', position_x: 38, position_y: 38 } },
  },
  {
    label: 'DOUBLE_CLICK (coords)',
    payload: { type: 'MOUSE_EVENT', payload: { action: 'DOUBLE_CLICK', position_x: 38, position_y: 38 } },
  },
  {
    label: 'Type text',
    payload: { type: 'KEYBOARD_EVENT', payload: { text: 'python' } },
  },
  {
    label: 'Press Enter',
    payload: { type: 'KEYBOARD_EVENT', payload: { key: 'Enter' } },
  },
  {
    label: 'Open Terminal',
    payload: { type: 'OPEN_WINDOW', payload: { title: 'Terminal', component: 'Terminal', w: 580, h: 360 } },
  },
  {
    label: 'Randomize UI',
    payload: { type: 'RANDOMIZE_UI', payload: {} },
  },
];

export default function ControlPanel() {
  const { state, executeCommand, takeScreenshot, getElementMap, mousePos } = useOS();
  const { visualConfig, installedApps } = state;
  const { accentColor, fontFamily } = visualConfig;

  const [activeTab,  setActiveTab]  = useState('Quick');
  const [jsonInput,  setJsonInput]  = useState('');
  const [jsonError,  setJsonError]  = useState('');
  const [lastShot,   setLastShot]   = useState(null);
  const [shotLoading,setShotLoading]= useState(false);
  const [elementMap, setElementMap] = useState([]);

  // ── Quick commands ──────────────────────────────────────────────────────────
  const quickCommands = [
    {
      label: '⬛  Terminal',
      run: () => executeCommand({ type: 'OPEN_WINDOW', payload: { title: 'Terminal', component: 'Terminal', w: 580, h: 360 } }),
    },
    {
      label: '📁  Explorer',
      run: () => executeCommand({ type: 'OPEN_WINDOW', payload: { title: 'File Explorer', component: 'Explorer', w: 680, h: 460 } }),
    },
    {
      label: '🐍  Installer',
      run: () => executeCommand({ type: 'OPEN_WINDOW', payload: { title: 'Python 3.12.0 Setup', component: 'PythonInstaller', w: 540, h: 420 } }),
    },
    {
      label: '⊞  Start Menu',
      run: () => executeCommand({ type: 'MOUSE_EVENT', payload: { action: 'CLICK', target: 'startButton' } }),
    },
    {
      label: '🎲  Randomize UI',
      run: () => executeCommand({ type: 'RANDOMIZE_UI', payload: {} }),
    },
    {
      label: shotLoading ? '⏳ Capturing…' : '📸  Screenshot',
      run: async () => {
        setShotLoading(true);
        const b64 = await takeScreenshot();
        setLastShot(b64);
        setShotLoading(false);
      },
    },
  ];

  // ── JSON executor ───────────────────────────────────────────────────────────
  const runJson = () => {
    setJsonError('');
    try { executeCommand(JSON.parse(jsonInput)); }
    catch (e) { setJsonError(`JSON parse error: ${e.message}`); }
  };

  const loadExample = (ex) => { setJsonInput(JSON.stringify(ex.payload, null, 2)); setJsonError(''); };

  // ── Element map refresh ─────────────────────────────────────────────────────
  const refreshMap = () => setElementMap(getElementMap());

  // ── Click on screenshot preview → generate command ──────────────────────────
  const handleShotClick = (e, actionType) => {
    if (!lastShot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // The preview image is scaled; we need to map back to real desktop coords.
    // We store the desktop dimensions when taking the screenshot (approximation via img natural size).
    const img = e.currentTarget;
    const scaleX = img.naturalWidth  / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const px = Math.round((e.clientX - rect.left) * scaleX / 0.6); // html2canvas scale=0.6
    const py = Math.round((e.clientY - rect.top)  * scaleY / 0.6);
    const cmd = { type: 'MOUSE_EVENT', payload: { action: actionType, position_x: px, position_y: py } };
    setJsonInput(JSON.stringify(cmd, null, 2));
    setActiveTab('JSON API');
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ flexShrink: 0, background: '#0f0f1a', borderTop: '1px solid #1e2040', padding: '10px 14px 12px', fontFamily }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <div style={{ flex: 1, color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 2 }}>
          ◈  OSaaS CONTROL INTERFACE
        </div>
        {/* Live mouse position */}
        <div style={{
          fontFamily: '"Cascadia Code","Courier New",monospace',
          fontSize: 10, color: '#4ec9b0', background: 'rgba(0,0,0,0.4)',
          padding: '2px 8px', borderRadius: 3, border: '1px solid #1e3040',
        }}>
          cursor: {mousePos.x}, {mousePos.y}
        </div>
        {/* Python indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: installedApps.includes('Python') ? '#27ae60' : '#c0392b',
          }} />
          <span style={{ fontSize: 10, color: '#666' }}>
            {installedApps.includes('Python') ? 'Python installed' : 'Python not installed'}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {TABS.map((tab) => (
          <button key={tab} className="ctrl-tab" onClick={() => setActiveTab(tab)} style={{
            background:   activeTab === tab ? accentColor : 'transparent',
            border:       activeTab === tab ? 'none' : '1px solid #2a2a3a',
            color:        activeTab === tab ? '#fff' : '#888',
            padding:      '4px 12px', borderRadius: 4,
            cursor:       'pointer', fontSize: 11, fontFamily,
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab: Quick Commands ─────────────────────────────────────────────── */}
      {activeTab === 'Quick' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            {quickCommands.map((cmd, i) => (
              <button key={i} className="quick-cmd" onClick={cmd.run}
                disabled={shotLoading && i === 5}
                style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ccc', padding: '7px 6px', borderRadius: 5,
                  cursor: 'pointer', fontSize: 11, fontFamily, textAlign: 'left',
                }}>
                {cmd.label}
              </button>
            ))}
          </div>

          {lastShot && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>
                Screenshot preview — click to generate CLICK command, double-click for DOUBLE_CLICK:
              </div>
              <img src={lastShot} alt="screenshot"
                onClick={(e) => handleShotClick(e, 'CLICK')}
                onDoubleClick={(e) => handleShotClick(e, 'DOUBLE_CLICK')}
                style={{
                  width: '100%', maxHeight: 180, objectFit: 'contain',
                  background: '#000', cursor: 'crosshair',
                  border: '1px solid #222', borderRadius: 4, display: 'block',
                }} />
              <a href={lastShot} download="osaas-screenshot.jpg"
                style={{ fontSize: 10, color: accentColor, display: 'block', marginTop: 4 }}>
                ↓ Download screenshot
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: JSON API ───────────────────────────────────────────────────── */}
      {activeTab === 'JSON API' && (
        <div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
            {JSON_EXAMPLES.map((ex) => (
              <button key={ex.label} onClick={() => loadExample(ex)} style={{
                background: 'transparent', border: '1px solid #2a2a3a',
                color: '#666', padding: '3px 8px', borderRadius: 3,
                cursor: 'pointer', fontSize: 10, fontFamily,
              }}>
                {ex.label}
              </button>
            ))}
          </div>

          <textarea value={jsonInput}
            onChange={(e) => { setJsonInput(e.target.value); setJsonError(''); }}
            rows={4}
            placeholder={'{\n  "type": "MOUSE_EVENT",\n  "payload": { "action": "CLICK", "position_x": 38, "position_y": 38 }\n}'}
            style={{
              width: '100%', background: '#0a0a14',
              border: `1px solid ${jsonError ? '#c0392b' : '#2a2a3a'}`,
              color: '#4ec9b0', padding: 8,
              fontFamily: '"Cascadia Code","Courier New",monospace',
              fontSize: 11, borderRadius: 4, resize: 'vertical',
              boxSizing: 'border-box', outline: 'none',
            }} />

          {jsonError && <div style={{ color: '#c0392b', fontSize: 10, marginTop: 4 }}>{jsonError}</div>}

          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={runJson} style={{
              background: accentColor, color: '#fff', border: 'none',
              padding: '5px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
            }}>Execute</button>
            <button onClick={() => { setJsonInput(''); setJsonError(''); }} style={{
              background: 'transparent', color: '#555', border: '1px solid #2a2a3a',
              padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
            }}>Clear</button>
          </div>

          <div style={{ marginTop: 8, fontSize: 10, color: '#333', lineHeight: 1.6 }}>
            Types: OPEN_WINDOW · CLOSE_WINDOW · FOCUS_WINDOW · MOUSE_EVENT · KEYBOARD_EVENT · RANDOMIZE_UI · CLIPBOARD_SET
          </div>
        </div>
      )}

      {/* ── Tab: Map ────────────────────────────────────────────────────────── */}
      {activeTab === 'Map' && (
        <ElementMapTab
          elementMap={elementMap}
          onRefresh={refreshMap}
          onClickItem={(item) => {
            const cmd = { type: 'MOUSE_EVENT', payload: { action: 'CLICK', position_x: item.cx, position_y: item.cy } };
            setJsonInput(JSON.stringify(cmd, null, 2));
            setActiveTab('JSON API');
          }}
          accentColor={accentColor}
          fontFamily={fontFamily}
        />
      )}

      {/* ── Tab: State ──────────────────────────────────────────────────────── */}
      {activeTab === 'State' && <StateInspector />}

      {/* ── Tab: Log ────────────────────────────────────────────────────────── */}
      {activeTab === 'Log' && <EventLog />}
    </div>
  );
}

// ─── Element Map tab ──────────────────────────────────────────────────────────

function ElementMapTab({ elementMap, onRefresh, onClickItem, accentColor, fontFamily }) {
  const MONO = '"Cascadia Code","Courier New",monospace';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, fontSize: 10, color: '#555', lineHeight: 1.5 }}>
          All interactive elements with their pixel coordinates relative to the desktop.
          Click a row to generate a CLICK command targeting its center (cx, cy).
        </div>
        <button onClick={onRefresh} style={{
          background: accentColor, color: '#fff', border: 'none',
          padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          flexShrink: 0,
        }}>
          ↻ Refresh
        </button>
      </div>

      {elementMap.length === 0 ? (
        <div style={{ color: '#333', fontSize: 11, fontFamily: MONO, padding: 4 }}>
          {'// Click "Refresh" to scan interactive elements'}
        </div>
      ) : (
        <div style={{ maxHeight: 130, overflowY: 'auto' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px 60px',
            gap: 4, fontSize: 9, color: '#444', fontFamily: MONO,
            padding: '2px 4px', borderBottom: '1px solid #1e2040', marginBottom: 2,
          }}>
            <span>id / label</span>
            <span style={{ textAlign: 'right' }}>x</span>
            <span style={{ textAlign: 'right' }}>y</span>
            <span style={{ textAlign: 'right', color: '#4ec9b0' }}>cx ←</span>
            <span style={{ textAlign: 'right', color: '#4ec9b0' }}>cy ←</span>
          </div>

          {elementMap.map((item, i) => (
            <div key={i}
              onClick={() => onClickItem(item)}
              title={`Click to target center (${item.cx}, ${item.cy})`}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px 60px',
                gap: 4, fontSize: 10, fontFamily: MONO,
                padding: '3px 4px', cursor: 'pointer', borderRadius: 3,
                borderBottom: '1px solid #0f0f1a',
                color: '#888',
              }}
              className="map-row"
            >
              <span style={{ color: '#dcdcaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={item.label}>
                {item.id}
              </span>
              <span style={{ textAlign: 'right', color: '#ce9178' }}>{item.x}</span>
              <span style={{ textAlign: 'right', color: '#ce9178' }}>{item.y}</span>
              <span style={{ textAlign: 'right', color: '#4ec9b0', fontWeight: 600 }}>{item.cx}</span>
              <span style={{ textAlign: 'right', color: '#4ec9b0', fontWeight: 600 }}>{item.cy}</span>
            </div>
          ))}
        </div>
      )}

      <style>{`.map-row:hover { background: rgba(255,255,255,0.05); color: #ccc !important; }`}</style>
    </div>
  );
}
