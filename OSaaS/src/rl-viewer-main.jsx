/**
 * rl-viewer-main.jsx
 *
 * Live stats monitor for RL training.
 * The OS simulation now runs fully headless in the Vite server (Node.js),
 * so this page just shows training progress — no browser rendering needed
 * for the agent to work.
 *
 * Usage (optional — training works without this page open):
 *   Open http://localhost:<PORT>/rl-viewer.html to monitor progress.
 */

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

const POLL_MS    = 400;
const MAX_LOG    = 60;

// ── Root ──────────────────────────────────────────────────────────────────────

function RLMonitor() {
  const [episode,  setEpisode]  = useState(null);
  const [log,      setLog]      = useState([]);
  const [epCount,  setEpCount]  = useState(0);
  const [successes,setSuccesses]= useState(0);
  const prevStep = useRef(-1);

  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const data = await fetch('/rl/episode').then(r => r.json());
        if (!data.active) { setEpisode(null); return; }

        setEpisode(data);

        // Log new steps
        if (data.step !== prevStep.current) {
          prevStep.current = data.step;
          if (data.step === 1) {
            setEpCount(n => n + 1);
            setLog(l => [`[EP] Task: "${data.instruction}"`, ...l].slice(0, MAX_LOG));
          }
          if (data.done) {
            const success = !data.done || data.step < 30; // heuristic
            if (success) setSuccesses(n => n + 1);
            setLog(l => [`  └─ done at step ${data.step}`, ...l].slice(0, MAX_LOG));
          }
        }
      } catch { /* server not ready */ }
    }, POLL_MS);
    return () => clearInterval(iv);
  }, []);

  const row = (label, val, color = '#ccc') => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #1a1a1a' }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ color }}>{val}</span>
    </div>
  );

  return (
    <div style={{ background: '#0a0a0a', color: '#ccc', fontFamily: 'monospace', fontSize: 12, minHeight: '100vh', padding: 16, display: 'flex', gap: 16 }}>

      {/* Left — stats */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <div style={{ color: episode ? '#4caf50' : '#f5a623', fontWeight: 'bold', marginBottom: 12, fontSize: 13 }}>
          {episode ? '▶ RL TRAINING ACTIVE' : '⏳ Waiting for training...'}
        </div>

        {!episode && (
          <div style={{ color: '#555', fontSize: 11, marginBottom: 16 }}>
            Run:<br/>
            <code style={{ color: '#888' }}>python train.py --mode rl \<br/>  --server http://localhost:PORT</code>
          </div>
        )}

        {episode && (
          <div style={{ background: '#111', borderRadius: 4, padding: 10, marginBottom: 12 }}>
            {row('Task',     episode.instruction, '#fff')}
            {row('Step',     episode.step)}
            {row('Done',     episode.done ? 'yes' : 'no', episode.done ? '#4caf50' : '#ccc')}
          </div>
        )}

        <div style={{ background: '#111', borderRadius: 4, padding: 10 }}>
          {row('Episodes',  epCount)}
          {row('Successes', successes, '#4caf50')}
          {row('Rate', epCount ? `${((successes/epCount)*100).toFixed(1)}%` : '—', '#4caf50')}
        </div>

        <div style={{ marginTop: 12, color: '#444', fontSize: 10 }}>
          The OS simulation runs headless in Node.js.<br/>
          This page is optional — training works without it.
        </div>
      </div>

      {/* Right — episode log */}
      <div style={{ flex: 1, background: '#111', borderRadius: 4, padding: 10, overflow: 'auto', maxHeight: '95vh' }}>
        <div style={{ color: '#555', marginBottom: 8 }}>Episode log</div>
        {log.length === 0 && <div style={{ color: '#333' }}>No episodes yet.</div>}
        {log.map((line, i) => (
          <div key={i} style={{ color: line.startsWith('[EP]') ? '#7ec8e3' : '#666', padding: '1px 0' }}>{line}</div>
        ))}
      </div>

    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><RLMonitor /></React.StrictMode>,
);
