/**
 * StateInspector.jsx
 *
 * Read-only view of key OS state: environment variables,
 * installed apps, open windows, and visual config.
 */

import { useOS } from '@/kernel/OSContext';

const MONO = '"Cascadia Code","Courier New",monospace';

export default function StateInspector() {
  const { state } = useOS();
  const { environmentVariables, installedApps, windowsStack, visualConfig } = state;

  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize:   11,
        maxHeight:  130,
        overflowY:  'auto',
        background: '#080810',
        padding:    8,
        borderRadius: 5,
        color:      '#9cdcfe',
        lineHeight: 1.6,
      }}
    >
      <Section label="environmentVariables">
        {Object.entries(environmentVariables).map(([k, v]) => (
          <KV key={k} k={k} v={v.length > 68 ? v.slice(0, 68) + '…' : v} highlight={k === 'PATH'} />
        ))}
      </Section>

      <Section label="installedApps">
        <span style={{ color: '#ce9178' }}>[{installedApps.join(', ')}]</span>
      </Section>

      <Section label="openWindows">
        <span style={{ color: '#4ec9b0' }}>{windowsStack.length}</span>
        {windowsStack.map((w) => (
          <div key={w.id} style={{ paddingLeft: 12 }}>
            <span style={{ color: '#888' }}>#{w.id} </span>
            <span style={{ color: '#dcdcaa' }}>{w.title}</span>
            <span style={{ color: '#555' }}> ({w.w}×{w.h} @ {Math.round(w.x)},{Math.round(w.y)})</span>
          </div>
        ))}
      </Section>

      <Section label="visualConfig">
        <KV k="taskbarPosition" v={visualConfig.taskbarPosition} />
        <KV k="accentColor"     v={visualConfig.accentColor} />
        <KV k="dpiScale"        v={String(visualConfig.dpiScale)} />
      </Section>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: '#dcdcaa' }}>{label}:</div>
      <div style={{ paddingLeft: 10 }}>{children}</div>
    </div>
  );
}

function KV({ k, v, highlight }) {
  return (
    <div>
      <span style={{ color: '#9cdcfe' }}>{k}</span>
      <span style={{ color: '#555' }}>: </span>
      <span style={{ color: highlight ? '#4ec9b0' : '#ce9178' }}>{v}</span>
    </div>
  );
}
