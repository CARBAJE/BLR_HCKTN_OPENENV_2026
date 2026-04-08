/**
 * rl-viewer-main.jsx
 *
 * Optional live viewer for RL training.
 *
 * Polls /rl/episode (task info) and /rl/os-state (HeadlessOS state snapshot)
 * every 500 ms. When the OS state version changes (a window opened/closed,
 * start menu toggled, etc.) it remounts the OS with the new state so the
 * visual matches what the agent currently sees.
 *
 * Training works whether or not this page is open — it is purely a monitor.
 *
 * Open at: http://localhost:<PORT>/rl-viewer.html
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { OSProvider }         from '@/kernel/OSContext';
import VirtualDesktop         from '@/components/desktop/VirtualDesktop';
import '@/global.css';

const POLL_MS  = 500;
const PANEL_W  = 340;   // px — right stats panel
const HUD_H    = 0;

// ── Root ──────────────────────────────────────────────────────────────────────

function RLViewer() {
  const [episode,  setEpisode]  = useState(null);
  const [osSnap,   setOsSnap]   = useState(null);   // { version, state, dom }
  const lastVer  = useRef(-1);

  useEffect(() => {
    let running = true;

    async function tick() {
      if (!running) return;
      try {
        const [ep, os] = await Promise.all([
          fetch('/rl/episode').then(r => r.json()),
          fetch('/rl/os-state').then(r => r.json()),
        ]);

        // Carry lastInfo from episode response if present
        setEpisode(ep.active ? ep : null);

        // Only update the OS snapshot when the state actually changed
        if (os.version !== lastVer.current) {
          lastVer.current = os.version;
          setOsSnap(os);
        }
      } catch { /* server not ready */ }
    }

    tick();
    const iv = setInterval(tick, POLL_MS);
    return () => { running = false; clearInterval(iv); };
  }, []);

  // Scale the 1280×720 OS to fit the left panel
  const osColW = window.innerWidth - PANEL_W;
  const scale  = Math.min(osColW / 1280, window.innerHeight / 720);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#000' }}>

      {/* ── Left: OS visualization ─────────────────────────────────────── */}
      <div style={{
        flex:           `0 0 ${osColW}px`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     '#0a0a0a',
        overflow:       'hidden',
        position:       'relative',
      }}>
        {osSnap ? (
          // key=version forces full remount when OS state changes (new window, etc.)
          <div style={{
            width:           1280,
            height:          720,
            transform:       `scale(${scale})`,
            transformOrigin: 'center center',
            flexShrink:      0,
            pointerEvents:   'none',   // viewer is read-only
          }}>
            <OSSnapshot key={osSnap.version} initialState={osSnap.state} />
          </div>
        ) : (
          <div style={{ color: '#333', fontFamily: 'monospace', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div>Waiting for RL training…</div>
            <div style={{ fontSize: 11, color: '#222', marginTop: 8 }}>
              python train.py --mode rl --server http://localhost:PORT
            </div>
          </div>
        )}

        {/* Task overlay at top-left of OS area */}
        {episode && (
          <div style={{
            position:   'absolute',
            top:        8,
            left:       8,
            background: 'rgba(0,0,0,0.75)',
            color:      '#fff',
            fontFamily: 'monospace',
            fontSize:   11,
            padding:    '4px 8px',
            borderRadius: 4,
            pointerEvents: 'none',
          }}>
            🎯 {episode.instruction}
          </div>
        )}
      </div>

      {/* ── Right: stats + DOM panel ───────────────────────────────────── */}
      <StatsPanel episode={episode} dom={osSnap?.dom ?? []} />
    </div>
  );
}

// ── OS snapshot renderer ──────────────────────────────────────────────────────
// Receives the HeadlessOS state as initialState and renders it via OSProvider.
// No APIBridgeMount — read-only, no polling.

function OSSnapshot({ initialState }) {
  return (
    <OSProvider initialState={initialState}>
      <VirtualDesktop />
    </OSProvider>
  );
}

// ── Stats + DOM panel ─────────────────────────────────────────────────────────

function StatsPanel({ episode, dom }) {
  const [history,    setHistory]    = useState([]);   // { reward, info }
  const [epCount,    setEpCount]    = useState(0);

  useEffect(() => {
    if (episode?.step === 1) setEpCount(n => n + 1);
  }, [episode?.step === 1]);

  useEffect(() => {
    if (episode?.lastReward != null) {
      setHistory(h => [...h.slice(-49), { r: episode.lastReward, info: episode.lastInfo }]);
    }
  }, [episode?.step]);

  const rewards      = history.map(h => h.r);
  const successRate  = rewards.length
    ? ((rewards.filter(r => r >= 1.0).length / rewards.length) * 100).toFixed(1)
    : null;

  const lastInfo = history.at(-1)?.info;

  return (
    <div style={{
      width:         PANEL_W,
      flexShrink:    0,
      background:    '#0d0d0d',
      borderLeft:    '1px solid #1a1a1a',
      display:       'flex',
      flexDirection: 'column',
      fontFamily:    'monospace',
      fontSize:      11,
      color:         '#aaa',
      overflow:      'hidden',
    }}>

      {/* Episode info */}
      <Section title="Episode">
        {episode ? (
          <>
            <Row label="Status"  value={episode.done ? 'Done' : 'Running'} color={episode.done ? '#888' : '#4caf50'} />
            <Row label="Task"    value={episode.instruction} color="#fff" small />
            <Row label="Target"  value={`"${episode.targetText}"`} color="#f5a623" />
            <Row label="Step"    value={`${episode.step} / 30`} />
            <Row label="Episodes" value={epCount} />
            {successRate && <Row label="Hit rate" value={`${successRate}%`} color="#7ec8e3" />}
          </>
        ) : (
          <div style={{ color: '#333', padding: '8px 0' }}>No active episode</div>
        )}
      </Section>

      {/* Last reward breakdown */}
      {episode?.lastReward != null && (
        <Section title="Last reward breakdown">
          <RewardBar
            value={episode.lastReward}
            label={`Total: ${episode.lastReward.toFixed(3)}`}
            color={episode.lastReward >= 1 ? '#4caf50' : episode.lastReward > 0 ? '#f5a623' : '#555'}
          />
          {lastInfo && (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <ComponentRow label="element × action" value={lastInfo.element_score * lastInfo.action_score} max={1.0}  color="#7ec8e3" />
              <ComponentRow label="visibility bonus" value={lastInfo.visibility_bonus} max={0.05}  color="#4caf50" />
              <ComponentRow label="state change"     value={lastInfo.state_change}     max={0.03}  color="#9b59b6" />
              <ComponentRow label="proximity"        value={lastInfo.proximity}        max={0.1}   color="#f5a623" />
              <ComponentRow label="exploration"      value={lastInfo.exploration ?? 0} max={0.12}  color="#e91e63" />
            </div>
          )}
        </Section>
      )}

      {/* Sparkline */}
      {rewards.length > 1 && (
        <Section title={`Reward history (last ${rewards.length})`}>
          <Sparkline values={rewards} />
        </Section>
      )}

      {/* DOM element list */}
      <Section title={`DOM elements (${dom.length})`} grow>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {dom.length === 0 && <div style={{ color: '#333' }}>No DOM yet</div>}
          {dom.map((el, i) => (
            <div key={i} style={{
              display:      'flex',
              gap:          6,
              padding:      '2px 0',
              borderBottom: '1px solid #111',
              alignItems:   'baseline',
            }}>
              <span style={{ color: '#444', minWidth: 22, textAlign: 'right' }}>{i}</span>
              <span style={{ color: typeColor(el.type), minWidth: 52, fontSize: 10 }}>{el.type}</span>
              <span style={{ color: '#ccc', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{el.text}</span>
              <span style={{ color: '#555', fontSize: 10 }}>{el.x?.toFixed(2)},{el.y?.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Section({ title, children, grow }) {
  return (
    <div style={{
      borderBottom: '1px solid #1a1a1a',
      padding:      '8px 10px',
      ...(grow ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : {}),
    }}>
      <div style={{ color: '#444', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, color = '#aaa', small }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', gap: 8 }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ color, textAlign: 'right', fontSize: small ? 10 : 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}

function RewardBar({ value, label, color }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: '#555', fontSize: 10 }}>reward</span>
        <span style={{ color, fontWeight: 'bold' }}>{label}</span>
      </div>
      <div style={{ background: '#1a1a1a', borderRadius: 2, height: 6, overflow: 'hidden' }}>
        <div style={{ background: color, width: `${Math.min(value, 1) * 100}%`, height: '100%', transition: 'width 0.2s' }} />
      </div>
    </div>
  );
}

function ComponentRow({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: '#444', width: 110, fontSize: 10, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: '#1a1a1a', borderRadius: 2, height: 4 }}>
        <div style={{ background: value > 0 ? color : '#222', width: `${Math.min(pct, 100)}%`, height: '100%', transition: 'width 0.2s' }} />
      </div>
      <span style={{ color: value > 0 ? color : '#333', width: 36, textAlign: 'right', fontSize: 10 }}>
        {value > 0 ? `+${value.toFixed(3)}` : '—'}
      </span>
    </div>
  );
}

function Sparkline({ values }) {
  const max = Math.max(...values.map(Math.abs), 0.1);
  return (
    <svg width="100%" height={40} style={{ display: 'block' }}>
      {values.map((v, i) => {
        const x  = (i / Math.max(values.length - 1, 1)) * 100;
        const h  = Math.abs(v) / max * 34;
        const y  = v >= 0 ? 38 - h : 38;
        const color = v >= 1 ? '#4caf50' : v < 0 ? '#f44336' : '#888';
        return <rect key={i} x={`${x}%`} width={3} y={y} height={Math.max(h, 1)} fill={color} />;
      })}
      <line x1="0" y1="38" x2="100%" y2="38" stroke="#222" strokeWidth={1} />
    </svg>
  );
}

function typeColor(type) {
  switch (type) {
    case 'button':  return '#7ec8e3';
    case 'icon':    return '#f5a623';
    case 'menuitem':return '#4caf50';
    case 'window':  return '#9b59b6';
    case 'taskbar': return '#e67e22';
    case 'tab':     return '#1abc9c';
    default:        return '#666';
  }
}

// ── Mount ─────────────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><RLViewer /></React.StrictMode>,
);
