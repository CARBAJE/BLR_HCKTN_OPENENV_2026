/**
 * APIBridgeMount.jsx
 * Renders nothing. Mounts useAPIBridge inside an OSProvider tree.
 * Receives instanceId so each instance polls its own queue.
 */

import { useOS }      from '@/kernel/OSContext';
import useAPIBridge   from './useAPIBridge';

export default function APIBridgeMount({ instanceId }) {
  const { state, executeCommand, takeScreenshot, getElementMap } = useOS();
  useAPIBridge({ instanceId, state, executeCommand, takeScreenshot, getElementMap });
  return null;
}
