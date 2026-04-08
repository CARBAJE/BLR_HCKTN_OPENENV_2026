/**
 * InstanceManager.jsx
 *
 * Manages the lifecycle of all headless OS instances.
 * Runs as an invisible component at the top of the React tree.
 *
 * Every 500ms it polls GET /api/instances and reconciles:
 *   - New instanceId in server response → create container div + mount OSApp
 *   - instanceId gone from response    → unmount React root + remove div
 *
 * Container div spec (per instance):
 *   position: fixed
 *   width:    1280px   ← standard screenshot resolution
 *   height:   720px
 *   opacity:  0        ← invisible
 *   pointer-events: none
 *   top: -9999px       ← off-viewport (belt + suspenders with opacity)
 *   left: -9999px
 *
 * This ensures html2canvas can capture the DOM (needs real layout dimensions)
 * while nothing is visible to the user.
 */

import { useEffect, useRef } from 'react';
import { createRoot }        from 'react-dom/client';
import OSApp                 from './OSApp';

const RECONCILE_INTERVAL_MS = 500;

// Container dimensions that html2canvas will capture
const INSTANCE_WIDTH  = 1280;
const INSTANCE_HEIGHT = 720;

export default function InstanceManager() {
  // Map<instanceId, { root: ReactRoot, container: HTMLDivElement }>
  const rootsRef = useRef(new Map());

  useEffect(() => {
    async function reconcile() {
      let serverInstances;
      try {
        const res = await fetch('/api/instances');
        const data = await res.json();
        serverInstances = data.instances ?? [];
      } catch {
        return; // server not ready yet
      }

      const activeIds = new Set(serverInstances.map((i) => i.instanceId));

      // ── Create missing instances ──────────────────────────────────────────
      for (const instanceId of activeIds) {
        if (rootsRef.current.has(instanceId)) continue;

        const container = document.createElement('div');
        container.id = `osaas-instance-${instanceId}`;
        Object.assign(container.style, {
          position:      'fixed',
          top:           '-9999px',
          left:          '-9999px',
          width:         `${INSTANCE_WIDTH}px`,
          height:        `${INSTANCE_HEIGHT}px`,
          opacity:       '0',
          pointerEvents: 'none',
          overflow:      'hidden',
          zIndex:        '-1',
        });
        document.body.appendChild(container);

        const root = createRoot(container);
        root.render(<OSApp instanceId={instanceId} />);

        rootsRef.current.set(instanceId, { root, container });
        console.log(`[InstanceManager] Mounted instance: ${instanceId}`);
      }

      // ── Destroy removed instances ─────────────────────────────────────────
      for (const [instanceId, { root, container }] of rootsRef.current) {
        if (activeIds.has(instanceId)) continue;

        root.unmount();
        container.remove();
        rootsRef.current.delete(instanceId);
        console.log(`[InstanceManager] Unmounted instance: ${instanceId}`);
      }
    }

    const id = setInterval(reconcile, RECONCILE_INTERVAL_MS);
    reconcile(); // immediate first run
    return () => {
      clearInterval(id);
      // Cleanup all on unmount (e.g. hot reload)
      for (const [, { root, container }] of rootsRef.current) {
        root.unmount();
        container.remove();
      }
      rootsRef.current.clear();
    };
  }, []);

  return null;
}
