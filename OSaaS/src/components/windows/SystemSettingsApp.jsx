/**
 * SystemSettingsApp.jsx — System Properties window
 *
 * Tabs:
 *   System      — OS info, computer name
 *   Environment — User and System environment variables (PATH focus)
 *
 * The "Environment Variables" sub-panel is the primary target for the
 * "Install Python and add to PATH" training task — agents can verify
 * PATH was updated after running the Python installer.
 */

import { useState } from 'react';
import { useOS } from '@/kernel/OSContext';

const TABS = ['System', 'Environment Variables'];

export default function SystemSettingsApp({ winId }) {
  const { state, dispatch } = useOS();
  const { visualConfig, environmentVariables, installedApps } = state;
  const { accentColor, fontFamily, windowBg } = visualConfig;

  const [activeTab, setActiveTab]     = useState('System');
  const [editKey,   setEditKey]       = useState(null);   // key being edited
  const [editValue, setEditValue]     = useState('');

  const pythonInstalled = installedApps.includes('Python');

  // ── helpers ────────────────────────────────────────────────────────────────
  const saveEdit = () => {
    if (!editKey) return;
    dispatch({
      type: 'SET_ENV_VAR',
      key:  editKey,
      value: editValue,
    });
    setEditKey(null);
    setEditValue('');
  };

  // ── styles ─────────────────────────────────────────────────────────────────
  const s = {
    root: {
      display: 'flex', flexDirection: 'column', height: '100%',
      background: windowBg, fontFamily, fontSize: 12, boxSizing: 'border-box',
    },
    tabBar: {
      display: 'flex', borderBottom: '1px solid #c0c0c0',
      background: '#f5f5f5', flexShrink: 0,
    },
    tab: (active) => ({
      padding: '7px 18px', cursor: 'pointer', fontSize: 12,
      borderBottom: active ? `2px solid ${accentColor}` : '2px solid transparent',
      color: active ? accentColor : '#444',
      fontWeight: active ? 600 : 400,
      background: 'transparent', border: 'none', outline: 'none',
      fontFamily,
    }),
    body: {
      flex: 1, overflowY: 'auto', padding: 16,
    },
    sectionTitle: {
      fontSize: 11, fontWeight: 700, color: '#666',
      textTransform: 'uppercase', letterSpacing: 1,
      marginBottom: 8, marginTop: 16,
    },
    infoRow: {
      display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start',
    },
    infoLabel: { color: '#666', minWidth: 140, flexShrink: 0 },
    infoValue: { color: '#111', wordBreak: 'break-all' },
    table: {
      width: '100%', borderCollapse: 'collapse', fontSize: 11.5,
      border: '1px solid #c8c8c8',
    },
    th: {
      background: accentColor, color: '#fff', padding: '5px 10px',
      textAlign: 'left', fontWeight: 600,
    },
    td: {
      padding: '5px 10px', borderBottom: '1px solid #e0e0e0',
      verticalAlign: 'top', wordBreak: 'break-all',
    },
    trAlt: { background: '#f9f9f9' },
    pathPill: {
      display: 'inline-block', background: '#e8f4e8',
      border: '1px solid #a8d5a8', borderRadius: 3,
      padding: '1px 6px', margin: '1px 2px', fontSize: 11,
      color: '#1a5c1a',
    },
    pathPillNormal: {
      display: 'inline-block', background: '#eef3fa',
      border: '1px solid #b0c8e8', borderRadius: 3,
      padding: '1px 6px', margin: '1px 2px', fontSize: 11,
      color: '#1a3a6a',
    },
    badge: {
      display: 'inline-block', background: '#107c10', color: '#fff',
      borderRadius: 10, padding: '1px 8px', fontSize: 10, fontWeight: 600,
      marginLeft: 6,
    },
    badgeWarn: {
      display: 'inline-block', background: '#c75000', color: '#fff',
      borderRadius: 10, padding: '1px 8px', fontSize: 10, fontWeight: 600,
      marginLeft: 6,
    },
    editInput: {
      width: '100%', boxSizing: 'border-box',
      border: `1px solid ${accentColor}`, borderRadius: 3,
      padding: '3px 6px', fontFamily, fontSize: 11.5,
      outline: 'none',
    },
    btnRow: { display: 'flex', gap: 6, marginTop: 6 },
    btnPrimary: {
      background: accentColor, color: '#fff', border: 'none',
      padding: '4px 12px', borderRadius: 3, cursor: 'pointer',
      fontSize: 11.5, fontFamily,
    },
    btnSecondary: {
      background: '#fff', color: '#333', border: '1px solid #bbb',
      padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
      fontSize: 11.5, fontFamily,
    },
  };

  // ── Tab: System ────────────────────────────────────────────────────────────
  const TabSystem = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20,
        background: '#fff', border: '1px solid #ddd', borderRadius: 5, padding: 14 }}>
        <span style={{ fontSize: 44 }}>🖥️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>
            Windows 10 Pro
            <span style={{ fontSize: 10, color: '#666', fontWeight: 400, marginLeft: 8 }}>
              Version 22H2 (OS Build 22631.3880)
            </span>
          </div>
          <div style={{ color: '#555', marginTop: 3 }}>OSaaS Simulation Engine</div>
        </div>
      </div>

      <div style={s.sectionTitle}>Computer Information</div>
      <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 5, padding: 12 }}>
        {[
          ['Computer name',     'DESKTOP-OSaaS'],
          ['Full computer name','DESKTOP-OSaaS.local'],
          ['Workgroup',         'WORKGROUP'],
          ['User',              'Admin'],
        ].map(([label, val]) => (
          <div key={label} style={s.infoRow}>
            <span style={s.infoLabel}>{label}</span>
            <span style={s.infoValue}>{val}</span>
          </div>
        ))}
      </div>

      <div style={s.sectionTitle}>Installed Applications</div>
      <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 5, padding: 12 }}>
        {installedApps.map((app) => (
          <div key={app} style={{ ...s.infoRow, alignItems: 'center' }}>
            <span style={{ fontSize: 18, marginRight: 8 }}>
              {app === 'Python' ? '🐍' : app === 'Explorer' ? '📁' : app === 'Cmd' ? '⬛' : '📦'}
            </span>
            <span style={s.infoValue}>{app}</span>
            {app === 'Python' && <span style={s.badge}>Installed</span>}
          </div>
        ))}
      </div>
    </div>
  );

  // ── Tab: Environment Variables ─────────────────────────────────────────────
  const TabEnv = () => {
    const pathEntries = (environmentVariables.PATH || '').split(';').filter(Boolean);
    const pythonPaths = pathEntries.filter((p) =>
      p.toLowerCase().includes('python') || p.toLowerCase().includes('scripts')
    );
    const hasPythonInPath = pythonPaths.length > 0;

    const otherVars = Object.entries(environmentVariables).filter(([k]) => k !== 'PATH');

    return (
      <div>
        {/* PATH section — highlighted because it's the key learning objective */}
        <div style={s.sectionTitle}>
          PATH
          {hasPythonInPath
            ? <span style={s.badge} data-osaas-id="python-in-path-badge" data-osaas-label="Python in PATH badge">✓ Python in PATH</span>
            : <span style={s.badgeWarn} data-osaas-id="python-not-in-path-badge" data-osaas-label="Python NOT in PATH badge">⚠ Python NOT in PATH</span>
          }
        </div>

        <div
          data-osaas-id="env-path-value"
          data-osaas-label="PATH environment variable value"
          style={{
            background: '#fff', border: `1px solid ${hasPythonInPath ? '#a8d5a8' : '#c8c8c8'}`,
            borderRadius: 5, padding: 10, marginBottom: 14,
          }}
        >
          <div style={{ marginBottom: 6, color: '#444', fontSize: 11 }}>
            Entries ({pathEntries.length}):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {pathEntries.map((entry, i) => {
              const isPython = entry.toLowerCase().includes('python');
              return (
                <span key={i} style={isPython ? s.pathPill : s.pathPillNormal}>
                  {entry}
                </span>
              );
            })}
          </div>

          {!pythonInstalled && (
            <div style={{ marginTop: 10, padding: '6px 10px', background: '#fff8e1',
              border: '1px solid #ffe082', borderRadius: 4, fontSize: 11, color: '#7a5500' }}>
              💡 Python is not installed. Open "Python Installer" from the Start Menu to install it.
            </div>
          )}
          {pythonInstalled && !hasPythonInPath && (
            <div style={{ marginTop: 10, padding: '6px 10px', background: '#fce4ec',
              border: '1px solid #ef9a9a', borderRadius: 4, fontSize: 11, color: '#b71c1c' }}>
              ⚠ Python was installed but "Add to PATH" was not checked. Re-run the installer with the option enabled.
            </div>
          )}
          {hasPythonInPath && (
            <div style={{ marginTop: 10, padding: '6px 10px', background: '#e8f5e9',
              border: '1px solid #a5d6a7', borderRadius: 4, fontSize: 11, color: '#1b5e20' }}>
              ✅ Python 3.12 is correctly added to PATH. You can run <code>python</code> from any terminal.
            </div>
          )}
        </div>

        {/* Other variables table */}
        <div style={s.sectionTitle}>Other Variables</div>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: '35%' }} data-osaas-id="env-table-header-name">Variable</th>
              <th style={s.th} data-osaas-id="env-table-header-value">Value</th>
            </tr>
          </thead>
          <tbody>
            {otherVars.map(([key, val], idx) => (
              <tr key={key} style={idx % 2 === 1 ? s.trAlt : {}}>
                <td style={{ ...s.td, fontWeight: 600, color: '#333' }}
                  data-osaas-id={`env-var-key-${key}`}
                  data-osaas-label={`Environment variable name: ${key}`}
                >
                  {key}
                </td>
                <td style={s.td}
                  data-osaas-id={`env-var-value-${key}`}
                  data-osaas-label={`Environment variable value for ${key}`}
                >
                  {editKey === key ? (
                    <>
                      <input
                        style={s.editInput}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                        data-osaas-id={`env-edit-input-${key}`}
                      />
                      <div style={s.btnRow}>
                        <button style={s.btnPrimary} onClick={saveEdit}
                          data-osaas-id={`env-save-btn-${key}`}>Save</button>
                        <button style={s.btnSecondary} onClick={() => setEditKey(null)}
                          data-osaas-id={`env-cancel-btn-${key}`}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <span
                      style={{ cursor: 'pointer', color: '#111' }}
                      onDoubleClick={() => { setEditKey(key); setEditValue(val); }}
                      title="Double-click to edit"
                    >
                      {val}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 10, color: '#888', fontSize: 11 }}>
          Double-click a value to edit it. Changes apply immediately to this session.
        </div>
      </div>
    );
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={s.root} data-osaas-id="system-settings-root" data-osaas-label="System Settings window">
      {/* Tab bar */}
      <div style={s.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            style={s.tab(activeTab === tab)}
            onClick={() => setActiveTab(tab)}
            data-osaas-id={`settings-tab-${tab.replace(/\s+/g, '-').toLowerCase()}`}
            data-osaas-label={`Settings tab: ${tab}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={s.body}>
        {activeTab === 'System'                && <TabSystem />}
        {activeTab === 'Environment Variables' && <TabEnv />}
      </div>

      {/* Footer */}
      <div style={{
        flexShrink: 0, padding: '8px 16px', borderTop: '1px solid #d0d0d0',
        background: '#f5f5f5', display: 'flex', justifyContent: 'flex-end', gap: 8,
      }}>
        <button
          data-osaas-id="settings-close-btn"
          data-osaas-label="Close System Settings button"
          onClick={() => dispatch({ type: 'CLOSE_WINDOW', id: winId })}
          style={{
            background: accentColor, color: '#fff', border: 'none',
            padding: '5px 20px', borderRadius: 3, cursor: 'pointer',
            fontSize: 12, fontFamily,
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
