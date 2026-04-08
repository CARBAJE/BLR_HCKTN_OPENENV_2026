/**
 * viewer-main.jsx
 *
 * Entry point del viewer de grabación.
 * Accesible en: http://localhost:5173/viewer
 *
 * Crea automáticamente una instancia OS, la renderiza visible,
 * intercepta toda interacción del usuario y la graba como trayectoria.
 */

import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { OSProvider }         from '@/kernel/OSContext';
import VirtualDesktop         from '@/components/desktop/VirtualDesktop';
import APIBridgeMount         from '@/api/APIBridgeMount';
import RecordingHUD           from '@/components/RecordingHUD';
import ElementsPanel          from '@/components/ElementsPanel';
import { createInitialState } from '@/kernel/initialState';
import '@/global.css';

const HUD_H        = 80;  // 52px controls + ~28px preview row
const OS_COL_FRAC  = 0.65;   // left column takes 65% of viewport width

// ── App: gestiona el ciclo de vida de la instancia ───────────────────────────

function App() {
  const [instanceId, setInstanceId] = useState(null);
  const [error, setError]           = useState(null);
  const [restarting, setRestarting] = useState(false);

  const createInstance = () => {
    fetch('/api/createOS', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => { setInstanceId(data.instanceId); setRestarting(false); })
      .catch((e)  => { setError(e.message); setRestarting(false); });
  };

  useEffect(() => { createInstance(); }, []);

  const handleRestart = async (currentId) => {
    setRestarting(true);
    setInstanceId(null);
    if (currentId) {
      await fetch('/api/destroyOS', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ instanceId: currentId }),
      }).catch(() => {});
    }
    createInstance();
  };

  if (error) return (
    <div style={{ color: '#f55', fontFamily: 'monospace', padding: 24 }}>
      Error al crear instancia: {error}
    </div>
  );

  if (!instanceId) return (
    <div style={{ color: '#555', fontFamily: 'monospace', padding: 24 }}>
      {restarting ? 'Reiniciando simulación...' : 'Iniciando simulación...'}
    </div>
  );

  return <ViewerSession instanceId={instanceId} onRestart={handleRestart} />;
}

// ── ViewerSession: layout + OS + HUD ─────────────────────────────────────────

function ViewerSession({ instanceId, onRestart }) {
  const initialState = useMemo(() => createInitialState(), []);

  const osColW = window.innerWidth * OS_COL_FRAC;
  const scale  = Math.min(
    osColW / 1280,
    (window.innerHeight - HUD_H) / 720,
  );

  return (
    <OSProvider initialState={initialState}>
      {/* Main area: OS (left) + elements panel (right) */}
      <div style={{
        width:    '100vw',
        height:   `calc(100vh - ${HUD_H}px)`,
        display:  'flex',
        overflow: 'hidden',
      }}>
        {/* Left column — OS simulation */}
        <div style={{
          flex:           `0 0 ${OS_COL_FRAC * 100}%`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     '#000',
          overflow:       'hidden',
        }}>
          <div style={{
            width:           1280,
            height:          720,
            transform:       `scale(${scale})`,
            transformOrigin: 'center center',
            flexShrink:      0,
          }}>
            <VirtualDesktop />
          </div>
        </div>

        {/* Right column — visible elements panel */}
        <ElementsPanel />
      </div>

      <APIBridgeMount instanceId={instanceId} />

      <RecordingHUD
        instanceId={instanceId}
        onRestart={() => onRestart(instanceId)}
      />
    </OSProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);
