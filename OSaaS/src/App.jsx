/**
 * App.jsx
 *
 * Root of the React application.
 *
 * - InstanceManager: manages headless OS instances (no UI)
 * - StatusMonitor:   minimal read-only status panel (kept for dev visibility)
 *
 * The full single-instance UI (VirtualDesktop, ControlPanel, HeaderBar) is
 * intentionally NOT rendered here. All those components are preserved in
 * src/components/ for use by the first pattern-learning model.
 */

import InstanceManager from '@/api/InstanceManager';
import StatusMonitor   from '@/components/StatusMonitor';

export default function App() {
  return (
    <>
      {/* Headless instance orchestrator — renders no visible DOM */}
      <InstanceManager />

      {/* Dev-facing status panel */}
      <StatusMonitor />
    </>
  );
}
