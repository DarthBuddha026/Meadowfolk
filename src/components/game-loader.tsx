'use client';

import dynamic from 'next/dynamic';
import { LoadingScreen } from './screens/loading-screen';

/** WebGL + physics are browser-only — load the game shell on the client. */
const GameShell = dynamic(() => import('./game-shell').then((m) => m.GameShell), {
  ssr: false,
  loading: () => <LoadingScreen text="Waking the meadow…" />,
});

export function GameLoader() {
  return <GameShell />;
}
