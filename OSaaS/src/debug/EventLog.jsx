/**
 * EventLog.jsx
 *
 * Log cronológico de eventos del Kernel.
 * Muestra acciones de ratón (con coordenadas), teclado y sistema.
 */

import { useOS } from '@/kernel/OSContext';

const MONO = '"Cascadia Code","Courier New",monospace';

export default function EventLog() {
  const { state } = useOS();
  const { eventLog } = state;

  return (
    <div
      style={{
        fontFamily:   MONO,
        fontSize:     11,
        maxHeight:    130,
        overflowY:    'auto',
        background:   '#080810',
        padding:      8,
        borderRadius: 5,
        color:        '#4ec9b0', // Color estilo terminal (cian/verde)
        lineHeight:   1.6,
      }}
    >
      {eventLog.length === 0 && (
        <span style={{ color: '#333' }}>{'// Awaiting events...'}</span>
      )}

      {eventLog.map((evt, i) => (
        <div
          key={i}
          style={{
            borderBottom: '1px solid #1a1a2e',
            paddingBottom: 2,
            marginBottom:  2,
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}
        >
          {/* Timestamp en gris oscuro */}
          <span style={{ color: '#555', flexShrink: 0 }}>
            {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>

          {/* Acción principal (MOUSE_EVENT, OPEN_WINDOW, etc) */}
          <span style={{ color: '#dcdcaa' }}>{evt.action}</span>

          {/* Detalles de Coordenadas (Si existen) */}
          {evt.coords && evt.coords.x !== undefined && (
            <span style={{ color: '#ce9178' }}>
               {`x=${Math.round(evt.coords.x)} y=${Math.round(evt.coords.y)}`}
            </span>
          )}

          {/* Detalles de Teclado */}
          {evt.key && (
            <span style={{ color: '#ce9178' }}>{`key="${evt.key}"`}</span>
          )}
          
          {evt.text && (
            <span style={{ color: '#6a9955' }}>{`"${evt.text}"`}</span>
          )}

          {/* Detalles específicos de Instalación */}
          {evt.addPath !== undefined && (
            <span style={{ color: '#9cdcfe' }}>{`addPath=${evt.addPath}`}</span>
          )}

          {/* Target antiguo (por compatibilidad) */}
          {evt.target && !evt.coords && (
            <span style={{ color: '#9cdcfe' }}>{`target=${evt.target}`}</span>
          )}

          {/* Errores */}
          {evt.error && (
            <span style={{ color: '#f44' }}>{`!! ERROR: ${evt.error}`}</span>
          )}
        </div>
      ))}
    </div>
  );
}