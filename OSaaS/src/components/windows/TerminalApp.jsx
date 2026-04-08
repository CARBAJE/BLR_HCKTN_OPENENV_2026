/**
 * TerminalApp.jsx — terminal input tagged with data-osaas-id
 */

import { useEffect, useRef } from 'react';
import { useOS } from '@/kernel/OSContext';

const MONO = '"Cascadia Code", "Courier New", Courier, monospace';

export default function TerminalApp() {
  const { state, dispatch } = useOS();
  const { terminalLines, terminalInput, currentDir } = state;
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [terminalLines]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      dispatch({ type: 'TERMINAL_EXEC' });
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      dispatch({ type: 'CLIPBOARD_SET', text: terminalInput });
      dispatch({ type: 'TERMINAL_INPUT', value: '' });
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#0c0c0c', padding: '8px 10px', boxSizing: 'border-box',
    }}>
      <div style={{
        flex: 1, overflowY: 'auto',
        fontFamily: MONO, fontSize: 13, color: '#cccccc', lineHeight: 1.55,
      }}>
        {terminalLines.map((line, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap' }}>{line || '\u00A0'}</div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center',
        borderTop: '1px solid #222', paddingTop: 6, marginTop: 4, gap: 4,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 13, color: '#cccccc', flexShrink: 0 }}>
          {currentDir}{'>'}
        </span>
        <input
          data-osaas-id="terminal-input"
          data-osaas-label="Terminal input"
          value={terminalInput}
          onChange={(e) => dispatch({ type: 'TERMINAL_INPUT', value: e.target.value })}
          onKeyDown={handleKeyDown}
          autoFocus
          spellCheck={false}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontFamily: MONO, fontSize: 13, color: '#ffffff', caretColor: '#ffffff',
          }}
        />
      </div>
    </div>
  );
}
