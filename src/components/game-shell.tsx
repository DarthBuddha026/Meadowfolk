'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import { attachInput, clearMovement, onInputAction } from '@/game/engine/input';
import { playSound, setMuted, unlockAudio } from '@/game/engine/sound';
import { playerState, requestTeleport } from '@/game/engine/world-state';
import {
  applyTool,
  bootAccount,
  enterOwnFarm,
  interact,
  joinFarm,
  rotateBuild,
  startClock,
  toggleBuild,
  undoBuild,
} from '@/game/state/director';
import { getFarm } from '@/game/state/farm-store';
import { hasIdentity, useProfile } from '@/game/state/profile-store';
import { useSession, type PanelId } from '@/game/state/session-store';
import { DoorTransition, Fade, Toast } from './hud/farm-hud';
import { Hud } from './hud/hud';
import { LoadingScreen } from './screens/loading-screen';
import { SetupScreen } from './screens/setup-screen';
import { TitleScreen } from './screens/title-screen';

const WorldCanvas = dynamic(() => import('./world/world-canvas').then((m) => m.WorldCanvas), { ssr: false });

const MIN_BOOT_MS = 1800;
const ARRIVAL_MS = 1600;

/** Panels the same key opens and closes. */
const TOGGLES: Partial<Record<string, PanelId>> = { bag: 'bag', coop: 'coop-play', help: 'help' };

/**
 * Screen flow: loading → title → (setup) → entering → play. The 3D world stays mounted underneath
 * every screen. Also the bridge from keys to the director.
 */
export function GameShell() {
  const screen = useSession((s) => s.screen);
  const setScreen = useSession((s) => s.setScreen);
  const muted = useProfile((s) => s.muted);
  const [worldReady, setWorldReady] = useState(false);
  const [bootDone, setBootDone] = useState(false);
  // A friend's link carries their farm code (?join=CODE).
  const [joinCode, setJoinCode] = useState<string | null>(() => {
    const code = new URLSearchParams(window.location.search).get('join');
    return code && /^[A-Za-z0-9]{6}$/.test(code) ? code.toUpperCase() : null;
  });
  /** What the setup screen leads to: a new farm, or a friend's. */
  const [after, setAfter] = useState<{ kind: 'new' } | { kind: 'join'; code: string }>({ kind: 'new' });

  useEffect(() => attachInput(), []);
  useEffect(() => setMuted(muted), [muted]);
  useEffect(() => {
    startClock();
    void bootAccount();
  }, []);

  // `?debug` exposes a tiny console API for testing.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    Object.assign(window, {
      __meadow: {
        teleport: requestTeleport,
        player: () => ({ ...playerState.position }),
        session: () => useSession.getState(),
        farm: getFarm,
        profile: () => useProfile.getState(),
      },
    });
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setBootDone(true), MIN_BOOT_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (screen === 'loading' && worldReady && bootDone) setScreen('title');
  }, [screen, worldReady, bootDone, setScreen]);

  // Arriving on your own farm.
  useEffect(() => {
    if (screen !== 'entering') return;
    clearMovement();
    const id = window.setTimeout(() => setScreen('play'), ARRIVAL_MS);
    return () => window.clearTimeout(id);
  }, [screen, setScreen]);

  // Keys → the director.
  useEffect(
    () =>
      onInputAction((action, n) => {
        const s = useSession.getState();
        if (s.screen !== 'play' || s.fade || s.transition) return;
        if (s.panel === 'pause') return; // the pause menu handles its own keys
        if (s.panel === 'morning' || s.panel === 'thanks') return; // these want an answer
        if (s.chatOpen) return;
        if (s.build.on) {
          if (action === 'build' || action === 'escape') toggleBuild();
          else if (action === 'rotate') rotateBuild();
          else if (action === 'undo') undoBuild();
          else if (action === 'erase') s.setBuild({ remove: !s.build.remove, piece: null });
          return;
        }
        const toggle = TOGGLES[action];
        if (toggle) {
          if (s.panel === toggle) s.closePanel();
          else if (!s.panel) s.openPanel(toggle);
          playSound(s.panel === toggle ? 'close' : 'open');
          return;
        }
        switch (action) {
          case 'interact':
            if (!s.panel && s.nearby) interact(s.nearby.id);
            break;
          case 'use':
            if (!s.panel) applyTool();
            break;
          case 'slot':
            if (!s.panel && n !== undefined) {
              s.setSlot(n);
              playSound('blip');
            }
            break;
          case 'build':
            if (!s.panel) toggleBuild();
            break;
          case 'chat':
            if (!s.panel && (s.net.status === 'hosting' || s.net.status === 'visiting')) s.setChatOpen(true);
            break;
          case 'escape':
            if (s.panel) {
              s.closePanel();
              playSound('close');
            } else {
              s.openPanel('pause');
              playSound('open');
            }
            break;
        }
      }),
    []
  );

  const newGame = useCallback(() => {
    unlockAudio();
    playSound('select');
    setAfter({ kind: 'new' });
    setScreen('setup');
  }, [setScreen]);

  const continueGame = useCallback(async () => {
    unlockAudio();
    playSound('select');
    await enterOwnFarm(false);
    setScreen('entering');
  }, [setScreen]);

  const join = useCallback(
    async (code: string) => {
      unlockAudio();
      playSound('select');
      if (!hasIdentity(useProfile.getState())) {
        setAfter({ kind: 'join', code });
        setScreen('setup');
        return;
      }
      if (!(await joinFarm(code))) return;
      setJoinCode(null);
      window.history.replaceState(null, '', window.location.pathname);
    },
    [setScreen]
  );

  const confirmSetup = useCallback(async () => {
    if (after.kind === 'join') {
      if (await joinFarm(after.code)) {
        setJoinCode(null);
        window.history.replaceState(null, '', window.location.pathname);
      } else setScreen('title');
      return;
    }
    await enterOwnFarm(true);
    setScreen('entering');
  }, [after, setScreen]);

  const onWorldReady = useCallback(() => setWorldReady(true), []);

  return (
    <main className="fixed inset-0">
      <div className="absolute inset-0">
        <WorldCanvas onReady={onWorldReady} />
      </div>

      <AnimatePresence>
        {screen === 'loading' && <LoadingScreen key="boot" text="Waking the meadow…" />}
        {screen === 'title' && <TitleScreen key="title" onNewGame={newGame} onContinue={continueGame} joinCode={joinCode} onJoin={join} />}
        {screen === 'setup' && <SetupScreen key="setup" onConfirm={confirmSetup} joining={after.kind === 'join'} />}
        {screen === 'entering' && <LoadingScreen key="arrive" text="Heading out to the farm…" />}
      </AnimatePresence>

      {screen === 'play' && <Hud />}
      <Toast />
      <DoorTransition />
      <Fade />
    </main>
  );
}
