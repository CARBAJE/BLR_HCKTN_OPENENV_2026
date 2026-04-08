/**
 * ExplorerApp.jsx
 *
 * Windows Explorer-style file browser.
 * - Double-click folder → navigate into it
 * - Double-click .txt   → open TextViewerApp
 * - .exe / other files  → no action (icon only)
 * - Uses /assets/icons/file.png for file items
 */

import { useState } from 'react';
import { useOS } from '@/kernel/OSContext';

export default function ExplorerApp({ initialPath }) {
  const { state, dispatch } = useOS();
  const { fileSystem, visualConfig } = state;
  const { fontFamily, accentColor } = visualConfig;

  const [path, setPath] = useState(initialPath ?? ['C:', 'Users', 'Admin']);

  // Resolve current node
  let node = fileSystem['C:'];
  for (let i = 1; i < path.length; i++) {
    node = node?.children?.[path[i]];
    if (!node) break;
  }
  // Cap visible entries to stay within the 50-element budget
  const MAX_ENTRIES = 8;
  const allEntries = node?.children ? Object.entries(node.children) : [];
  const entries = allEntries.slice(0, MAX_ENTRIES);
  const truncated = allEntries.length > MAX_ENTRIES;

  const navigateTo = (index) => setPath(path.slice(0, index + 1));
  const openEntry  = (name, item) => {
    if (item.type === 'folder') {
      setPath([...path, name]);
      return;
    }
    // item.component overrides default behaviour (e.g. python installer)
    const component = item.component
      ?? (item.ext === 'txt' ? 'TextViewer'
        : item.ext === 'exe' ? 'SystemRunner'
        : null);

    if (component) {
      dispatch({
        type:      'OPEN_WINDOW',
        title:     component === 'PythonInstaller' ? 'Python 3.12.0 Setup' : name,
        component,
        props:     {
          content:  item.content ?? '',
          filename: name,
          filePath: [...path, name],   // full path for WRITE_FILE
        },
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily }}>

      {/* Toolbar */}
      <div style={{
        display:      'flex',
        alignItems:   'center',
        gap:          6,
        padding:      '5px 10px',
        background:   '#f5f5f5',
        borderBottom: '1px solid #ddd',
        flexShrink:   0,
      }}>
        {['←', '→', '↑'].map((s, i) => (
          <button key={i} style={navBtnStyle}>{s}</button>
        ))}

        {/* Address breadcrumb */}
        <div style={{
          flex:         1,
          display:      'flex',
          alignItems:   'center',
          gap:          2,
          background:   '#fff',
          border:       '1px solid #ccc',
          borderRadius: 3,
          padding:      '3px 8px',
          fontSize:     12,
          overflow:     'hidden',
        }}>
          {path.map((segment, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && <span style={{ color: '#aaa' }}>›</span>}
              <span
                onClick={() => navigateTo(i)}
                style={{ cursor: 'pointer', color: accentColor, whiteSpace: 'nowrap' }}
              >
                {segment}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        background:   '#eee',
        borderBottom: '1px solid #ddd',
        padding:      '2px 12px',
        fontSize:     11,
        color:        '#555',
        flexShrink:   0,
      }}>
        {allEntries.length} item{allEntries.length !== 1 ? 's' : ''}
      </div>

      {/* File grid */}
      <div style={{
        flex:         1,
        display:      'flex',
        flexWrap:     'wrap',
        gap:          4,
        padding:      12,
        alignContent: 'flex-start',
        overflowY:    'auto',
        background:   '#fff',
      }}>
        {entries.length === 0 && (
          <p style={{ color: '#999', fontSize: 12, padding: 4 }}>This folder is empty.</p>
        )}
        {entries.map(([name, item]) => (
          <FileItem
            key={name}
            name={name}
            item={item}
            onOpen={() => openEntry(name, item)}
          />
        ))}
        {truncated && (
          <div style={{
            width: '100%',
            padding: '4px 8px',
            fontSize: 11,
            color: '#999',
            fontStyle: 'italic',
          }}>
            … {allEntries.length - MAX_ENTRIES} more item{allEntries.length - MAX_ENTRIES !== 1 ? 's' : ''} not shown
          </div>
        )}
      </div>
    </div>
  );
}

// ─── File item ────────────────────────────────────────────────────────────────

function FileItem({ name, item, onOpen }) {
  const isImage = item.icon?.startsWith('/');
  const safeId  = name.replace(/[^a-z0-9]/gi, '-').toLowerCase();

  return (
    <div
      className="explorer-item"
      onDoubleClick={onOpen}
      data-osaas-id={`explorer-item-${safeId}`}
      data-osaas-label={`File: ${name}`}
      style={{
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        width:         80,
        padding:       '8px 4px',
        cursor:        'default',
        borderRadius:  4,
        textAlign:     'center',
      }}
    >
      {isImage ? (
        <img
          src={item.icon}
          alt={name}
          draggable={false}
          style={{ width: 32, height: 32, objectFit: 'contain' }}
        />
      ) : (
        <span style={{ fontSize: 28, lineHeight: 1 }}>
          {item.type === 'folder' ? '📁' : item.icon ?? '📄'}
        </span>
      )}
      <span style={{ marginTop: 4, fontSize: 11, color: '#222', wordBreak: 'break-word', lineHeight: 1.3 }}>
        {name}
      </span>
      {item.size && (
        <span style={{ fontSize: 10, color: '#999', marginTop: 1 }}>{item.size}</span>
      )}
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const navBtnStyle = {
  background:   '#f5f5f5',
  border:       '1px solid #ccc',
  borderRadius: 3,
  padding:      '2px 7px',
  cursor:       'pointer',
  fontSize:     13,
  color:        '#444',
};
