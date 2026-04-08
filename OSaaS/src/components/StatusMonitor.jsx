/**
 * StatusMonitor.jsx
 *
 * Minimal developer-facing status panel.
 * Shows active instances, their state, and recent activity.
 * NOT part of the simulation — purely for observability during development.
 */

import { useState, useEffect } from 'react';

const MONO = '"Cascadia Code","Courier New",monospace';

export default function StatusMonitor() {
  const [status,    setStatus]    = useState(null);
  const [instances, setInstances] = useState([]);
  const [apiReady,  setApiReady]  = useState(false);
  const [tick,      setTick]      = useState(0);

  useEffect(() => {
    async function refresh() {
      try {
        const [s, i] = await Promise.all([
          fetch('/api/status').then((r) => r.json()),
          fetch('/api/instances').then((r) => r.json()),
        ]);
        setStatus(s);
        setInstances(i.instances ?? []);
        setApiReady(true);
      } catch {
        setApiReady(false);
      }
    }
    refresh();
    const id = setInterval(() => { refresh(); setTick((t) => t + 1); }, 1000);
    return () => clearInterval(id);
  }, []);

  const dot = (on) => (
    <span style={{ color: on ? '#22c55e' : '#f59e0b', marginRight: 5 }}>●</span>
  );

  return (
    <div style={{
      minHeight:   '100vh',
      background:  '#080810',
      color:       '#a0a0b0',
      fontFamily:  MONO,
      fontSize:    12,
      padding:     24,
      boxSizing:   'border-box',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ color: '#6366f1', fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
          OSaaS ENGINE v2.0
        </div>
        <div style={{ color: '#333', fontSize: 10, letterSpacing: 1 }}>
          OS AS A SERVICE — MULTI-INSTANCE MODE
        </div>
      </div>

      {/* API status */}
      <div style={{ marginBottom: 20, padding: '10px 14px', background: '#0f0f1a', borderRadius: 6, border: '1px solid #1e2040' }}>
        <div style={{ color: '#888', fontSize: 10, marginBottom: 6, letterSpacing: 1 }}>API STATUS</div>
        <div>{dot(apiReady)}{apiReady ? 'API ready — POST /api/createOS to start' : 'Connecting to API...'}</div>
        {status && (
          <div style={{ marginTop: 4, color: '#555' }}>
            Active instances: <span style={{ color: '#4ec9b0' }}>{status.activeInstances}</span>
            {'  ·  '}
            Service: <span style={{ color: '#dcdcaa' }}>{status.service}</span>
          </div>
        )}
      </div>

      {/* Instance list */}
      <div style={{ marginBottom: 16, color: '#888', fontSize: 10, letterSpacing: 1 }}>
        ACTIVE INSTANCES ({instances.length})
      </div>

      {instances.length === 0 ? (
        <div style={{ color: '#2a2a3a', padding: '20px 0', fontStyle: 'italic' }}>
          {'// No instances running. Call POST /api/createOS to create one.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {instances.map((inst) => (
            <InstanceCard key={inst.instanceId} inst={inst} />
          ))}
        </div>
      )}

      {/* Quick reference */}
      <div style={{ marginTop: 32, padding: '12px 14px', background: '#0a0a12', borderRadius: 6, border: '1px solid #1a1a2a' }}>
        <div style={{ color: '#555', fontSize: 10, marginBottom: 8, letterSpacing: 1 }}>QUICK REFERENCE</div>
        {[
          ['POST /api/createOS',  '{}',                                          'Create a new OS instance'],
          ['POST /api/execute',   '{ instanceId, type, payload, return? }',      'Send command to instance'],
          ['POST /api/destroyOS', '{ instanceId }',                              'Destroy instance + free memory'],
          ['GET  /api/instances', '',                                             'List all active instances'],
          ['GET  /api/status',    '',                                             'Health check'],
        ].map(([method, body, desc]) => (
          <div key={method} style={{ display: 'flex', gap: 12, marginBottom: 4, lineHeight: 1.7 }}>
            <span style={{ color: '#4ec9b0', minWidth: 240 }}>{method}</span>
            <span style={{ color: '#888',    minWidth: 260 }}>{body}</span>
            <span style={{ color: '#444' }}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InstanceCard({ inst }) {
  const age = Math.round((Date.now() - inst.createdAt) / 1000);
  return (
    <div style={{
      padding:      '10px 14px',
      background:   '#0f0f1a',
      borderRadius: 6,
      border:       '1px solid #1e2040',
      display:      'grid',
      gridTemplateColumns: '1fr auto',
      gap:          8,
    }}>
      <div>
        <span style={{ color: '#22c55e' }}>● </span>
        <span style={{ color: '#dcdcaa' }}>{inst.instanceId}</span>
      </div>
      <div style={{ color: '#444', fontSize: 11, textAlign: 'right' }}>
        {age}s ago · {inst.commandCount} cmd{inst.commandCount !== 1 ? 's' : ''}
        {inst.pendingCount > 0 && <span style={{ color: '#f59e0b' }}> · {inst.pendingCount} pending</span>}
      </div>
    </div>
  );
}
