import { useState, useEffect } from 'react';
import { useOS } from '@/kernel/OSContext';

export default function HeaderBar() {
  const { state } = useOS();
  const [apiReady, setApiReady] = useState(false);

  // Ping the API once on mount to confirm it's reachable
  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((d) => setApiReady(d.ok === true))
      .catch(() => setApiReady(false));
  }, []);

  return (
    <div style={{
      height:       '40px',
      background:   '#0a0a14',
      borderBottom: '1px solid #1e1e2e',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      padding:      '0 20px',
      color:        '#a0a0b0',
      fontFamily:   'Inter, system-ui, sans-serif',
      fontSize:     '12px',
      zIndex:       3000,
      flexShrink:   0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <span style={{ color: '#6366f1', fontWeight: 'bold', letterSpacing: '1px' }}>
          OSaaS ENGINE v1.0
        </span>
        <div style={{ width: '1px', height: '16px', background: '#333' }} />
        <span>
          Kernel:{' '}
          <span style={{ color: '#22c55e' }}>● Operational</span>
        </span>
        <div style={{ width: '1px', height: '16px', background: '#333' }} />
        <span>
          API:{' '}
          <span style={{ color: apiReady ? '#22c55e' : '#f59e0b' }}>
            {apiReady ? '● Ready' : '● Connecting…'}
          </span>
        </span>
        {apiReady && (
          <span style={{ color: '#4ec9b0', fontFamily: '"Courier New",monospace', fontSize: 10 }}>
            POST /api/execute
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        <span>Session: <strong style={{ color: '#fff' }}>Admin_IT_Alpha</strong></span>
        <span>Last action: <em style={{ color: '#888' }}>{state.lastAction || 'None'}</em></span>
      </div>
    </div>
  );
}
