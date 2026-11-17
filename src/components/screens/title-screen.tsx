'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { playSound } from '@/game/engine/sound';
import { hasIdentity, useProfile } from '@/game/state/profile-store';
import { OptionsPanel } from './options-panel';

/** The Meadowfolk logo artwork (transparent PNG), sized to fit short screens too. */
function MeadowfolkLogo() {
  return (
    <h1 style={{ width: 'min(620px, 92vw, 74vh)' }}>
      <Image
        src="/images/meadowfolk-logo.png"
        alt="Meadowfolk"
        width={1672}
        height={941}
        priority
        className="h-auto w-full drop-shadow-[0_10px_16px_rgba(43,35,64,0.28)]"
      />
    </h1>
  );
}

interface Props {
  onNewGame: () => void;
  onContinue: () => void;
  /** A join code from a friend's link (?join=CODE), if any. */
  joinCode: string | null;
  onJoin: (code: string) => void;
}

type View = 'menu' | 'confirm-new' | 'options';

/** Main menu: New Game, Continue, Options — and "Join <friend>'s farm" when opened from a join link. */
export function TitleScreen({ onNewGame, onContinue, joinCode, onJoin }: Props) {
  const profile = useProfile();
  const hasSave = hasIdentity(profile);
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
      style={{ background: 'radial-gradient(ellipse at center, rgba(255,248,236,0.12) 0%, rgba(43,35,64,0.32) 100%)' }}
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
            <MeadowfolkLogo />
            <p className="paper mt-4 max-w-md px-5 py-2.5 text-base font-semibold text-ink-soft">
              Grow, sell, build your villa — and bring your friends along.
            </p>

            {view === 'confirm-new' ? (
              <div className="paper mt-5 flex w-72 flex-col gap-3 px-5 py-4">
                <p className="font-display text-lg font-semibold">Start a new farm?</p>
                <p className="-mt-2 text-sm text-ink-soft">{profile.name}’s farm, gold and bag start over.</p>
                <button className="btn py-2 text-lg" onClick={onNewGame} autoFocus>
                  Start a New Farm
                </button>
                <button className="btn btn--ghost text-base" onClick={() => show('menu')}>
                  Cancel
                </button>
              </div>
            ) : (
              <nav className="mt-5 flex w-64 flex-col gap-3" aria-label="Main menu">
                {joinCode && (
                  <button className="btn btn--teal flex-col py-2 text-2xl leading-tight" onClick={() => onJoin(joinCode)} autoFocus>
                    Join a Friend
                    <span className="font-body text-xs font-bold text-ink-soft">Farm code {joinCode}</span>
                  </button>
                )}
                <button className="btn py-3 text-2xl" onClick={hasSave ? () => show('confirm-new') : onNewGame} autoFocus={!hasSave && !joinCode}>
                  New Game
                </button>
                <button className="btn btn--teal flex-col py-2 text-2xl leading-tight" onClick={onContinue} disabled={!hasSave} autoFocus={hasSave && !joinCode}>
                  Continue
                  <span className="font-body text-xs font-bold text-ink-soft">{hasSave ? `${profile.name}’s farm` : 'No farm yet'}</span>
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
