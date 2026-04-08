/**
 * TextViewerApp.jsx — editable Notepad-style viewer with Save.
 *
 * Props:
 *   filename  string    display name
 *   content   string    initial text from FS
 *   filePath  string[]  e.g. ['C:', 'Users', 'Admin', 'Desktop', 'notes.txt']
 *                       required for Save to persist back to the FS
 */

import { useState } from 'react';
import { useOS } from '@/kernel/OSContext';

export default function TextViewerApp({ filename = 'file.txt', content = '', filePath }) {
  const { dispatch } = useOS();
  const [text, setText]       = useState(content);
  const [saved, setSaved]     = useState(true);   // tracks unsaved changes

  const handleChange = (e) => {
    setText(e.target.value);
    setSaved(false);
  };

  const handleSave = () => {
    if (filePath) {
      dispatch({ type: 'WRITE_FILE', filePath, content: text });
    }
    setSaved(true);
  };

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      height:        '100%',
      background:    '#fff',
      fontFamily:    '"Courier New", monospace',
    }}>
      {/* Menu bar */}
      <div style={{
        background:   '#f0f0f0',
        borderBottom: '1px solid #ccc',
        padding:      '3px 10px',
        fontSize:     12,
        color:        '#444',
        flexShrink:   0,
        display:      'flex',
        alignItems:   'center',
        gap:          16,
      }}>
        {['File', 'Edit', 'Format', 'View', 'Help'].map((m) => (
          <span key={m} style={{ cursor: 'default', userSelect: 'none' }}>{m}</span>
        ))}

        <div style={{ flex: 1 }} />

        <button
          onClick={handleSave}
          disabled={saved}
          data-osaas-id="textviewer-save"
          data-osaas-label="Save file"
          style={{
            background:   saved ? 'transparent' : '#0078d4',
            color:        saved ? '#aaa' : '#fff',
            border:       saved ? '1px solid #ccc' : 'none',
            borderRadius: 3,
            padding:      '2px 12px',
            fontSize:     11,
            cursor:       saved ? 'default' : 'pointer',
            fontFamily:   '"Segoe UI", sans-serif',
          }}
        >
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Editable textarea */}
      <textarea
        value={text}
        onChange={handleChange}
        spellCheck={false}
        data-osaas-id="textviewer-textarea"
        data-osaas-label="Text editor content"
        style={{
          flex:       1,
          border:     'none',
          outline:    'none',
          resize:     'none',
          padding:    '12px 16px',
          fontSize:   13,
          lineHeight: 1.7,
          color:      '#111',
          fontFamily: '"Courier New", monospace',
          background: '#fff',
        }}
      />

      {/* Status bar */}
      <div style={{
        background:  '#f0f0f0',
        borderTop:   '1px solid #ccc',
        padding:     '2px 12px',
        fontSize:    10,
        color:       '#888',
        flexShrink:  0,
        display:     'flex',
        gap:         12,
      }}>
        <span>{filename}</span>
        <span>·</span>
        <span>{text.length} chars</span>
        {!saved && <span style={{ color: '#e67e22' }}>● unsaved</span>}
      </div>
    </div>
  );
}
