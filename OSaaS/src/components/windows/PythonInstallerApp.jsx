/**
 * PythonInstallerApp.jsx — with data-osaas-id on all interactive elements
 *
 * States:
 *   0 — Welcome (checkbox "Add Python to PATH")
 *   1 — Progress bar
 *   2 — Success
 */

import { useState, useRef } from 'react';
import { useOS } from '@/kernel/OSContext';

const INSTALL_STEPS = [
  { label: 'Extracting files...',               threshold: 0  },
  { label: 'Installing core components...',      threshold: 28 },
  { label: 'Registering file associations...',   threshold: 55 },
  { label: 'Updating environment variables...',  threshold: 75 },
  { label: 'Finalizing installation...',         threshold: 90 },
];

function stepLabel(p) {
  for (let i = INSTALL_STEPS.length - 1; i >= 0; i--)
    if (p >= INSTALL_STEPS[i].threshold) return INSTALL_STEPS[i].label;
  return INSTALL_STEPS[0].label;
}

export default function PythonInstallerApp({ winId }) {
  const { state, dispatch } = useOS();
  const { visualConfig } = state;
  const { accentColor, fontFamily } = visualConfig;

  const [step,     setStep]     = useState(0);
  const [addPath,  setAddPath]  = useState(true);
  const [progress, setProgress] = useState(0);
  const timer = useRef(null);

  const startInstall = () => {
    setStep(1);
    let p = 0;
    timer.current = setInterval(() => {
      p += Math.random() * 7 + 2;
      if (p >= 100) {
        p = 100;
        clearInterval(timer.current);
        setTimeout(() => {
          dispatch({ type: 'INSTALL_PYTHON_COMPLETE', addPath });
          dispatch({ type: 'LOG_EVENT', event: { action: 'PYTHON_INSTALLED', addPath, timestamp: Date.now() } });
          setStep(2);
        }, 500);
      }
      setProgress(Math.round(Math.min(p, 100)));
    }, 100);
  };

  const center = {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100%', padding: 28,
    background: visualConfig.windowBg, fontFamily, boxSizing: 'border-box',
  };

  // ── Step 0: Welcome ─────────────────────────────────────────────────────────
  if (step === 0) return (
    <div style={center}>
      <span style={{ fontSize: 52, marginBottom: 10 }}>🐍</span>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>
        Python 3.12.0 (64-bit) Setup
      </h2>
      <p style={{ fontSize: 12, color: '#666', marginBottom: 24, textAlign: 'center', maxWidth: 380 }}>
        Select Install Now to install Python with default settings.
      </p>

      <div style={{
        width: '100%', maxWidth: 420, background: '#fff',
        border: '1px solid #d0d0d0', borderRadius: 5, padding: '14px 16px', marginBottom: 20,
      }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 10 }}>Optional Features</p>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: '#111' }}>
          <input
            data-osaas-id="path-checkbox"
            data-osaas-label="Add Python to PATH checkbox"
            type="checkbox"
            checked={addPath}
            onChange={(e) => setAddPath(e.target.checked)}
            style={{ marginTop: 2, width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
          />
          <span>
            <strong>Add Python 3.12 to PATH</strong>
            <br />
            <span style={{ color: '#666', fontSize: 11 }}>
              Allows running python.exe from any command prompt without the full path.
            </span>
          </span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          data-osaas-id="install-now-btn"
          data-osaas-label="Install Now button"
          onClick={startInstall}
          style={primaryBtn(accentColor)}
        >
          Install Now
        </button>
        <button
          data-osaas-id="customize-btn"
          data-osaas-label="Customize installation button"
          style={secondaryBtn}
        >
          Customize installation
        </button>
      </div>
    </div>
  );

  // ── Step 1: Progress ────────────────────────────────────────────────────────
  if (step === 1) return (
    <div style={center}>
      <span style={{ fontSize: 38, marginBottom: 12 }}>🐍</span>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', marginBottom: 20 }}>
        Installing Python 3.12.0...
      </h2>
      <div style={{
        width: '100%', maxWidth: 420, background: '#e0e0e0',
        borderRadius: 4, height: 22, overflow: 'hidden', marginBottom: 10,
      }}>
        <div style={{ width: `${progress}%`, height: '100%', background: accentColor }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 420, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: '#555' }}>{stepLabel(progress)}</span>
        <span style={{ fontSize: 11, color: '#555', fontWeight: 600 }}>{progress}%</span>
      </div>
    </div>
  );

  // ── Step 2: Success ─────────────────────────────────────────────────────────
  return (
    <div style={center}>
      <span style={{ fontSize: 54, marginBottom: 10 }}>✅</span>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#107c10', marginBottom: 6 }}>
        Setup was successful!
      </h2>
      <p style={{ fontSize: 13, color: '#333', marginBottom: 6 }}>
        Python 3.12.0 has been installed on your computer.
      </p>
      {addPath && (
        <div style={{
          background: '#e8f4e8', border: '1px solid #a8d5a8', borderRadius: 4,
          padding: '7px 14px', fontSize: 12, color: '#2a6a2a', marginBottom: 14, textAlign: 'center',
        }}>
          ✓ Python 3.12 was added to PATH
        </div>
      )}
      <p style={{ fontSize: 11, color: '#888', marginBottom: 18, textAlign: 'center' }}>
        Location: C:\Python312\python.exe
      </p>
      <div style={{
        fontFamily: '"Cascadia Code","Courier New",monospace',
        background: '#1e1e1e', color: '#4ec9b0', padding: '10px 18px',
        borderRadius: 5, fontSize: 12, marginBottom: 22, lineHeight: 1.7,
      }}>
        <span style={{ color: '#888' }}>C:\Users\Admin{'>'} </span>python --version<br />
        Python 3.12.0
      </div>
      <button
        data-osaas-id="close-installer-btn"
        data-osaas-label="Close installer button"
        onClick={() => dispatch({ type: 'CLOSE_WINDOW', id: winId })}
        style={primaryBtn(accentColor)}
      >
        Close
      </button>
    </div>
  );
}

const primaryBtn = (color) => ({
  background: color, color: '#fff', border: 'none',
  padding: '9px 28px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 500,
});
const secondaryBtn = {
  background: '#fff', color: '#333', border: '1px solid #bbb',
  padding: '9px 18px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
};
