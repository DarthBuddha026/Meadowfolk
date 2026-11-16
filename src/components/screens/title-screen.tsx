'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { getHero } from '@/game/data';
import { playSound } from '@/game/engine/sound';
import { hasIdentity, useProfile } from '@/game/state/profile-store';
import { OptionsPanel } from './options-panel';

/** The TRIOE Smart Town Rescue logo artwork (transparent PNG), sized to fit short screens too. */
function TrioeLogo() {
  return (
    <h1 style={{ width: 'min(560px, 88vw, 62vh)' }}>
      <Image
        src="/images/trioe-smart-town-rescue-logo.png"
        alt="TRIOE Smart Town Rescue"
        width={955}
        height={439}
        priority
        className="h-auto w-full drop-shadow-[0_8px_14px_rgba(43,35,64,0.3)]"
      />
    </h1>
  );
}

interface Props {
  onNewGame: () => void;
  onContinue: () => void;
}

type View = 'menu' | 'confirm-new' | 'options';

/** Main menu: New Game, Continue (needs a saved hero), Options. */
export function TitleScreen({ onNewGame, onContinue }: Props) {
  const profile = useProfile();
  const hasSave = hasIdentity(profile);
  const hero = getHero(profile.heroId);
  const [view, setView] = useState<View>('menu');

  const show = (next: View) => {
    playSound(next === 'menu' ? 'close' : 'open');
    setView(next);
  };

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center overflow-y-auto p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      style={{ background: 'radial-gradient(ellipse at center, rgba(255,248,236,0.15) 0%, rgba(43,35,64,0.35) 100%)' }}
    >
      <AnimatePresence mode="wait">
        {view === 'options' ? (
          <OptionsPanel key="options" onBack={() => show('menu')} />
        ) : (
          <motion.div
            key="main"
            className="flex flex-col items-center text-center"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.4 }}
          >
            <TrioeLogo />
            <p className="paper mt-6 max-w-md px-5 py-3 text-base font-semibold text-ink-soft">
              Somewhere, a learner&apos;s project just failed. Their call for help is your mission.
            </p>

            {view === 'confirm-new' ? (
              <div className="paper mt-6 flex w-72 flex-col gap-3 px-5 py-4">
                <p className="font-display text-lg font-semibold">Start a new game?</p>
                <p className="-mt-2 text-sm text-ink-soft">Your hero {profile.heroName} and their Insight Gems will be cleared.</p>
                <button className="btn py-2 text-lg" onClick={onNewGame} autoFocus>
                  Start New Game
                </button>
                <button className="btn btn--ghost text-base" onClick={() => show('menu')}>
                  Cancel
                </button>
              </div>
            ) : (
              <nav className="mt-6 flex w-64 flex-col gap-3" aria-label="Main menu">
                <button
                  className="btn py-3 text-2xl"
                  onClick={hasSave ? () => show('confirm-new') : onNewGame}
                  autoFocus={!hasSave}
                >
                  New Game
                </button>
                <button
                  className="btn btn--teal flex-col py-2 text-2xl leading-tight"
                  onClick={onContinue}
                  disabled={!hasSave}
                  autoFocus={hasSave}
                >
                  Continue
                  <span className="font-body text-xs font-bold text-ink-soft">
                    {hasSave ? `${profile.heroName} · ${hero.name}` : 'No saved hero yet'}
                  </span>
                </button>
                <button className="btn btn--ghost py-2 text-xl" onClick={() => show('options')}>
                  Options
                </button>
              </nav>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
