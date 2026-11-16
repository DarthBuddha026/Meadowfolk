'use client';

import dynamic from 'next/dynamic';
import { SignalLoading } from './screens/signal-loading';

/** WebGL + physics are browser-only — load the game shell on the client. */
const GameShell = dynamic(() => import('./game-shell').then((m) => m.GameShell), {
  ssr: false,
  loading: () => <SignalLoading text="Connecting to the System…" />,
});

export function GameLoader() {
  return <GameShell />;
}
