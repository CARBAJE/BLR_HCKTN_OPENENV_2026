/**
 * OSApp.jsx
 *
 * A single headless OS instance.
 * Rendered into an off-screen container div by InstanceManager.
 *
 * Each instance:
 *   - Gets its own OSProvider (its own useReducer — isolated state)
 *   - Starts with a randomized visual config (createInitialState does this)
 *   - Runs its own polling loop via APIBridgeMount
 *   - Is invisible: the container div has opacity:0, pointer-events:none
 */

import { useMemo }         from 'react';
import { OSProvider }      from '@/kernel/OSContext';
import VirtualDesktop      from '@/components/desktop/VirtualDesktop';
import APIBridgeMount      from './APIBridgeMount';
import { createInitialState } from '@/kernel/initialState';

export default function OSApp({ instanceId }) {
  // createInitialState() called once per mount — memoized so re-renders
  // of InstanceManager don't accidentally reset state.
  const initialState = useMemo(() => createInitialState(), []);

  return (
    <OSProvider initialState={initialState}>
      {/* Fixed 1280×720 virtual screen — html2canvas captures this */}
      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        <VirtualDesktop />
      </div>
      {/* Bridge: polls the server and routes commands to this instance's kernel */}
      <APIBridgeMount instanceId={instanceId} />
    </OSProvider>
  );
}
