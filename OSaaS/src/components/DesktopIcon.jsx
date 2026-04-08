/**
 * DesktopIcon.jsx
 *
 * Renders a desktop icon. Accepts either:
 *   - A named emoji key ('this-pc', 'folder', …)
 *   - An absolute asset path starting with '/' → rendered as <img>
 */

import { useState } from 'react';
import { useOS } from '@/kernel/OSContext';

const ICON_EMOJI = {
  'this-pc':     '🖥️',
  'folder':      '📁',
  'trash-empty': '🗑️',
  'python-main': '🐍',
  'settings':    '⚙️',
};

export default function DesktopIcon({ icon, label, onDoubleClick, style }) {
  const { state } = useOS();
  const [selected, setSelected] = useState(false);

  const safeId = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const isImage = icon?.startsWith('/');

  return (
    <div
      data-osaas-id={`desktop-icon-${safeId}`}
      data-osaas-label={`Desktop icon: ${label}`}
      className="desktop-icon"
      tabIndex={0}
      onClick={() => setSelected(true)}
      onDoubleClick={onDoubleClick}
      onBlur={() => setSelected(false)}
      style={{
        position:      'absolute',  // grid positions are absolute
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        width:         76,
        padding:       '6px 4px',
        borderRadius:  4,
        cursor:        'default',
        userSelect:    'none',
        outline:       'none',
        background:    selected ? 'rgba(0,120,212,0.35)' : 'transparent',
        color:         '#fff',
        fontFamily:    state.visualConfig.fontFamily,
        ...style,
      }}
    >
      {isImage ? (
        <img
          src={icon}
          alt={label}
          draggable={false}
          style={{ width: 32, height: 32, marginBottom: 5, objectFit: 'contain', pointerEvents: 'none' }}
        />
      ) : (
        <span style={{ fontSize: 30, lineHeight: 1, marginBottom: 5, pointerEvents: 'none' }}>
          {ICON_EMOJI[icon] ?? '📄'}
        </span>
      )}
      <span style={{
        textAlign:     'center',
        textShadow:    '1px 1px 3px rgba(0,0,0,0.8)',
        fontSize:      11,
        maxWidth:      72,
        wordBreak:     'break-word',
        lineHeight:    1.3,
        pointerEvents: 'none',
      }}>
        {label}
      </span>
    </div>
  );
}
