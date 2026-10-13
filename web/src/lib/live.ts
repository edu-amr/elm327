import { useEffect, useState } from 'react';
import type { WireState } from '../../../src/session/wire';
import { openStream } from './api';

export interface Live {
  state: WireState;
  /** False while the stream is reconnecting. */
  connected: boolean;
}

/** Subscribes to the live stream; the first state comes from `initial`. */
export function useLive(initial: WireState): Live {
  const [live, setLive] = useState<Live>({ state: initial, connected: true });

  useEffect(
    () =>
      openStream(
        (state) => setLive((previous) => ({ ...previous, state })),
        (connected) => setLive((previous) => ({ ...previous, connected })),
      ),
    [],
  );

  return live;
}
