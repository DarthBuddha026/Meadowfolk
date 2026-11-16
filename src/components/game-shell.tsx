'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { attachInput, clearMovement, onInputAction } from '@/game/engine/input';
import { getAmbientLevels, playSound, setMuted, unlockAudio } from '@/game/engine/sound';
import { playerState, requestTeleport } from '@/game/engine/world-state';
import { beginMission, interact, prepareMission, requestAdvance } from '@/game/state/mission-director';
import { getMissionContext, getPhase } from '@/game/state/mission-phase-machine';
import { hasIdentity, useProfile } from '@/game/state/profile-store';
import { useSession } from '@/game/state/session-store';
import { Hud } from './hud/hud';
import { HeroSetupScreen } from './screens/hero-setup-screen';
import { SignalLoading } from './screens/signal-loading';
import { TitleScreen } from './screens/title-screen';

const WorldCanvas = dynamic(() => import('./world/world-canvas').then((m) => m.WorldCanvas), { ssr: false });

const MIN_BOOT_MS = 1800;
const ARRIVAL_MS = 2600;

/**
 * Screen flow: loading → title → (hero setup) → arrival cinematic → play.
 * The 3D world stays mounted underneath every screen.
 */
export function GameShell() {
  const screen = useSession((s) => s.screen);
  const setScreen = useSession((s) => s.setScreen);
  const muted = useProfile((s) => s.muted);
  const [worldReady, setWorldReady] = useState(false);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => attachInput(), []);

  // `?debug` exposes a tiny console API for testing and level layout.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    Object.assign(window, {
      __trioe: {
        teleport: requestTeleport,
        phase: getPhase,
        mission: getMissionContext,
        player: () => ({ ...playerState.position }),
        session: () => useSession.getState(),
        ambient: getAmbientLevels,
      },
    });
  }, []);
  useEffect(() => setMuted(muted), [muted]);

  useEffect(() => {
    const id = window.setTimeout(() => setBootDone(true), MIN_BOOT_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (screen === 'loading' && worldReady && bootDone) setScreen('title');
  }, [screen, worldReady, bootDone, setScreen]);

  // Arrival cinematic → land in Junction.
  useEffect(() => {
    if (screen !== 'entering') return;
    clearMovement();
    const id = window.setTimeout(() => {
      setScreen('play');
      beginMission();
    }, ARRIVAL_MS);
    return () => window.clearTimeout(id);
  }, [screen, setScreen]);

  // Global keyboard actions.
  useEffect(
    () =>
      onInputAction((action) => {
        const s = useSession.getState();
        if (s.screen !== 'play') return;
        // Paused: the game (dialogue included) takes no keys; the pause menu handles its own Esc.
        if (s.panel === 'pause') return;
        switch (action) {
          case 'interact':
            if (s.dialogue) requestAdvance();
            else if (!s.panel && s.nearbyId) interact(s.nearbyId);
            break;
          case 'advance':
            if (s.dialogue) requestAdvance();
            break;
          case 'journal':
            if (s.dialogue) break;
            if (s.panel === 'journal') s.closePanel();
            else if (!s.panel) s.openPanel('journal');
            playSound(s.panel === 'journal' ? 'close' : 'open');
            break;
          case 'help':
            if (!s.dialogue && !s.panel) {
              s.openPanel('help');
              playSound('open');
            }
            break;
          case 'escape':
            // With no panel open — mid-conversation too — Esc pauses. Otherwise it closes the
            // panel; reflection is mandatory and the completion card has its own buttons.
            if (!s.panel && !s.transition) {
              s.openPanel('pause');
              playSound('open');
            } else if (s.panel && s.panel !== 'reflection' && getPhase() !== 'result') {
              s.closePanel();
              playSound('close');
            }
            break;
        }
      }),
    []
  );

  const newGame = useCallback(() => {
    unlockAudio();
    playSound('select');
    useProfile.getState().resetProfile();
    prepareMission();
    setScreen('hero-setup');
  }, [setScreen]);

  const continueGame = useCallback(() => {
    unlockAudio();
    playSound('select');
    prepareMission();
    setScreen(hasIdentity(useProfile.getState()) ? 'entering' : 'hero-setup');
  }, [setScreen]);

  const onWorldReady = useCallback(() => setWorldReady(true), []);

  return (
    <main className="fixed inset-0">
      <div className="absolute inset-0">
        <WorldCanvas onReady={onWorldReady} />
      </div>

      <AnimatePresence>
        {screen === 'loading' && <SignalLoading key="boot" text="Connecting to the System…" />}
        {screen === 'title' && (
          <TitleScreen key="title" onNewGame={newGame} onContinue={continueGame} />
        )}
        {screen === 'hero-setup' && <HeroSetupScreen key="setup" onConfirm={() => setScreen('entering')} />}
        {screen === 'entering' && <SignalLoading key="arrive" text="Responding to a signal…" />}
      </AnimatePresence>

      {screen === 'play' && <Hud />}
    </main>
  );
}
