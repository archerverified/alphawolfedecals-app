'use client';

// Fires `vehicle_detail_opened` once when a vehicle detail page mounts (Goal 2a).
// Rendered (returns null) inside the Server Component detail route so the event
// is tied to a real page view. No-op when analytics is disabled.

import { useEffect, useRef } from 'react';
import { capture } from '../../lib/analytics';

type Props = {
  vehicleId: string;
  alphaWolfTplId: string | null;
};

export function DetailViewTracker({ vehicleId, alphaWolfTplId }: Props): null {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    capture('vehicle_detail_opened', {
      vehicle_id: vehicleId,
      alpha_wolf_tpl_id: alphaWolfTplId,
    });
  }, [vehicleId, alphaWolfTplId]);
  return null;
}
