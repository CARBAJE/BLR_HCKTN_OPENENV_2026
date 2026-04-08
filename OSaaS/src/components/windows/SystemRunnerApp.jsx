/**
 * SystemRunnerApp.jsx
 *
 * Generic "program is running" window opened when the agent
 * double-clicks any .exe file. Confirms the action visually.
 */

export default function SystemRunnerApp({ filename = 'program.exe' }) {
  return (
    <div style={{
      height:         '100%',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            18,
      background:     '#1a1a2e',
      padding:        32,
      fontFamily:     '"Segoe UI", system-ui, sans-serif',
      color:          '#ccc',
    }}>
      {/* Icon */}
      <img
        src="/assets/icons/exe_1.png"
        alt="exe"
        style={{ width: 48, height: 48, objectFit: 'contain', opacity: 0.85 }}
      />

      {/* Title */}
      <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', textAlign: 'center' }}>
        Running {filename}
      </div>

      {/* Progress bar */}
      <div style={{
        width:        320,
        background:   'rgba(255,255,255,0.08)',
        borderRadius: 4,
        height:       8,
        overflow:     'hidden',
        border:       '1px solid rgba(255,255,255,0.12)',
      }}>
        <div style={{
          width:        '65%',
          height:       '100%',
          background:   'linear-gradient(90deg, #0078d4, #4ec9b0)',
          borderRadius: 4,
        }} />
      </div>

      {/* Status line */}
      <div style={{ fontSize: 12, color: '#666', letterSpacing: 1 }}>
        Initializing...
      </div>
    </div>
  );
}
