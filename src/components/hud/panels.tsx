'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { getInvestigation, getMissionById, getReflection, getRoleLabel, MISSIONS } from '@/game/data';
import { playSound } from '@/game/engine/sound';
import { completeReflection, getNextSignal, leaveToTitle, replayMission } from '@/game/state/mission-director';
import { isDevHero, useProfile } from '@/game/state/profile-store';
import { useSession } from '@/game/state/session-store';
import { useMissionContext, useMissionScript, useNorthBankOpen } from '@/game/state/use-mission';
import { OptionsPanel } from '../screens/options-panel';
import { GemIcon } from './top-bar';

/** A dimmed backdrop with a paper card; `bare` drops the card for children that bring their own. */
function Modal({
  children,
  width = 'max-w-lg',
  onBackdrop,
  bare = false,
}: {
  children: ReactNode;
  width?: string;
  onBackdrop?: () => void;
  bare?: boolean;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/35 p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onBackdrop}
    >
      {bare ? (
        children
      ) : (
        <motion.div
          className={`paper flex max-h-[92vh] w-full ${width} flex-col overflow-hidden`}
          initial={{ scale: 0.92, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      )}
    </motion.div>
  );
}

function useClose() {
  const closePanel = useSession((s) => s.closePanel);
  return () => {
    playSound('close');
    closePanel();
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  code: 'bg-[#ffe7c2]',
  system: 'bg-[#d8ecff]',
  observation: 'bg-[#dcf7e6]',
  analysis: 'bg-[#ece2ff]',
  evidence: 'bg-paper-2',
};

export function JournalPanel() {
  const close = useClose();
  const found = useMissionContext((c) => c.discoveredClues);
  const data = getInvestigation(useMissionContext((c) => c.missionId));
  const clues = (data?.clues ?? []).filter((c) => found.includes(c.id));

  return (
    <Modal onBackdrop={close}>
      <div className="flex items-center justify-between border-b-3 border-ink bg-sun px-5 py-3">
        <div>
          <p className="font-display text-xs font-semibold tracking-[0.2em] text-ink-soft">EVIDENCE JOURNAL</p>
          <h3 className="font-display text-xl font-semibold">What you know so far</h3>
        </div>
        <span className="paper px-3 py-1 font-display font-semibold">
          {clues.length}/{data?.clues.length}
        </span>
      </div>
      <div className="space-y-2 overflow-y-auto px-5 py-4">
        {clues.length === 0 && (
          <p className="py-6 text-center font-semibold text-ink-soft">
            Nothing yet. Look closely — and ask the person who called.
          </p>
        )}
        {clues.map((c) => (
          <div key={c.id} className={`rounded-xl border-2 border-ink px-4 py-3 ${CATEGORY_COLORS[c.category]}`}>
            <p className="font-display text-[10px] font-semibold tracking-[0.2em] text-ink-soft">{c.category.toUpperCase()}</p>
            <p className="font-display text-base font-semibold">{c.title}</p>
            <p className="text-sm font-semibold text-ink-soft">{c.description}</p>
          </div>
        ))}
      </div>
      <div className="border-t-3 border-ink px-5 py-3 text-right">
        <button className="btn btn--ghost" onClick={close}>
          Close <span className="key">J</span>
        </button>
      </div>
    </Modal>
  );
}

/** Mandatory after success. Sections reveal one at a time, then the gem forms. */
export function ReflectionPanel() {
  const role = useProfile((s) => s.role);
  const [revealed, setRevealed] = useState(1);
  const r = getReflection(useMissionContext((c) => c.missionId));
  const total = r.sections.length;
  const done = revealed >= total;

  return (
    <Modal width="max-w-2xl">
      <div className="border-b-3 border-ink bg-teal px-5 py-4 text-white">
        <p className="font-display text-xs font-semibold tracking-[0.2em] opacity-80">REFLECTION · CAPTAIN T</p>
        <p className="font-display text-xl font-semibold leading-snug">{r.mentorPrompt}</p>
      </div>
      <div className="space-y-3 overflow-y-auto px-5 py-4">
        {r.sections.slice(0, revealed).map((s, i) => (
          <motion.div
            key={s.heading}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border-2 border-ink bg-white px-4 py-3"
          >
            <p className="font-display text-sm font-semibold text-teal">
              {i + 1}. {s.heading}
            </p>
            <p className="font-semibold">{s.body}</p>
          </motion.div>
        ))}
        {done && role && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-xl border-2 border-dashed border-ink bg-paper-2 px-4 py-3"
          >
            <p className="font-display text-sm font-semibold text-gem">In your field — {getRoleLabel(role)}</p>
            <p className="font-semibold">{r.inYourField[role]}</p>
          </motion.div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t-3 border-ink px-5 py-3">
        <span className="text-sm font-bold text-ink-soft">
          {Math.min(revealed, total)} / {total}
        </span>
        {done ? (
          <button className="btn" onClick={completeReflection}>
            <GemIcon /> Crystallize the insight
          </button>
        ) : (
          <button
            className="btn btn--teal"
            onClick={() => {
              playSound('blip');
              setRevealed((n) => n + 1);
            }}
          >
            Next →
          </button>
        )}
      </div>
    </Modal>
  );
}

export function CompletePanel() {
  const close = useClose();
  const script = useMissionScript();
  const r = getReflection(script.missionId);
  const next = getNextSignal();
  // This gem opened the north bank, and its reveal is still to come.
  const northOpen = useNorthBankOpen();
  const northRevealed = useProfile((s) => s.revealed.includes('north-bank'));
  const northBank = northOpen && !northRevealed;
  return (
    <Modal width="max-w-md">
      <div className="flex flex-col items-center gap-3 px-6 py-7 text-center">
        <p className="font-display text-xs font-semibold tracking-[0.25em] text-teal">SIGNAL ANSWERED</p>
        <motion.div initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 12 }}>
          <GemIcon size={96} color={r.gemColor} />
        </motion.div>
        <h3 className="font-display text-3xl font-bold">Insight Gem earned</h3>
        <p className="paper bg-[#ece2ff] px-4 py-1 font-display text-lg font-semibold">“{r.gemName}”</p>
        <p className="font-semibold text-ink-soft">{script.lines.complete}</p>
        {next && (
          <p className="rounded-xl border-2 border-dashed border-ink bg-paper-2 px-3 py-2 text-sm font-bold">
            Another signal just lit up — {next.whereabouts}.
          </p>
        )}
        {northBank && (
          <p className="rounded-xl border-2 border-dashed border-ink bg-paper-2 px-3 py-2 text-sm font-bold">
            New area unlocked — the north road is open, across the river.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t-3 border-ink px-5 py-4 sm:flex-row sm:justify-end">
        <button
          className="btn btn--ghost"
          onClick={() => {
            playSound('select');
            replayMission();
          }}
        >
          Replay mission
        </button>
        <button className="btn" onClick={close}>
          Explore Junction
        </button>
      </div>
    </Modal>
  );
}

export function LockedSignalPanel() {
  const close = useClose();
  const missionId = useSession((s) => s.panelArg);
  const mission = missionId ? getMissionById(missionId) : undefined;
  const gems = useProfile((s) => s.gems);
  const dev = useProfile((s) => isDevHero(s.heroName));
  if (!mission) return null;
  const before = MISSIONS[MISSIONS.indexOf(mission) - 1];
  return (
    <Modal width="max-w-md" onBackdrop={close}>
      <div className="border-b-3 border-ink bg-[#dfe5f2] px-5 py-3">
        <p className="font-display text-xs font-semibold tracking-[0.2em] text-ink-soft">HELP SIGNAL · LOCKED</p>
        <h3 className="font-display text-xl font-semibold">{mission.title}</h3>
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="text-lg font-semibold">{mission.symptom}</p>
        <p className="font-semibold text-ink-soft">
          {!mission.playable && (dev || !before || gems.includes(before.id))
            ? `${mission.helpSeekerName}'s signal is still faint. The network will trust you with it soon — this mission is coming in a future update.`
            : `This signal is beyond your reach — for now. Answer ${before?.helpSeekerName ?? 'the first'}'s call first; the network trusts heroes who finish what they start.`}
        </p>
      </div>
      <div className="border-t-3 border-ink px-5 py-3 text-right">
        <button className="btn btn--ghost" onClick={close}>
          Close
        </button>
      </div>
    </Modal>
  );
}

const CONTROLS: [string[], string][] = [
  [['W', 'A', 'S', 'D'], 'Move (or arrow keys)'],
  [['Shift'], 'Run'],
  [['Space'], 'Jump / continue dialogue'],
  [['E'], 'Interact'],
  [['1', '2', '3'], 'Pick a dialogue choice'],
  [['J'], 'Evidence journal'],
  [['Scroll'], 'Zoom camera'],
  [['Esc'], 'Pause / close'],
];

export function HelpPanel() {
  const close = useClose();
  const resetProfile = useProfile((s) => s.resetProfile);
  return (
    <Modal width="max-w-md" onBackdrop={close}>
      <div className="border-b-3 border-ink bg-sun px-5 py-3">
        <h3 className="font-display text-xl font-semibold">How to play</h3>
      </div>
      <div className="space-y-2 px-5 py-4">
        {CONTROLS.map(([keys, label]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <span className="flex gap-1">
              {keys.map((k) => (
                <span key={k} className="key">
                  {k}
                </span>
              ))}
            </span>
            <span className="text-sm font-bold text-ink-soft">{label}</span>
          </div>
        ))}
        <p className="pt-2 text-sm font-semibold text-ink-soft">
          Engineers don&apos;t guess — they investigate. Wrong ideas never fail a mission; they just point you somewhere new.
        </p>
      </div>
      <div className="flex justify-between border-t-3 border-ink px-5 py-3">
        <button
          className="text-xs font-bold text-ink-soft underline"
          onClick={() => {
            if (window.confirm('Reset your hero and Insight Gems? This cannot be undone.')) {
              resetProfile();
              window.location.reload();
            }
          }}
        >
          Reset progress
        </button>
        <button className="btn btn--ghost" onClick={close}>
          Got it
        </button>
      </div>
    </Modal>
  );
}

type PauseView = 'menu' | 'options' | 'confirm-quit';

/** Pause menu: resume, graphics options, or back to the main menu (the profile keeps the hero and gems). */
export function PausePanel() {
  const close = useClose();
  const missionId = useMissionContext((c) => c.missionId);
  const [view, setView] = useState<PauseView>('menu');

  const show = (next: PauseView) => {
    playSound(next === 'menu' ? 'close' : 'open');
    setView(next);
  };

  // Esc resumes from the menu and steps back from the quit check; Options handles its own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (view === 'menu') {
        playSound('close');
        useSession.getState().closePanel();
      } else if (view === 'confirm-quit') {
        playSound('close');
        setView('menu');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  if (view === 'options') {
    return (
      <Modal bare>
        <OptionsPanel onBack={() => show('menu')} />
      </Modal>
    );
  }

  return (
    <Modal width="max-w-xs" onBackdrop={view === 'menu' ? close : undefined}>
      <div className="border-b-3 border-ink bg-sun px-5 py-3 text-center">
        <p className="font-display text-xs font-semibold tracking-[0.2em] text-ink-soft">PAUSED</p>
        <h3 className="font-display text-xl font-semibold">{getMissionById(missionId)?.title}</h3>
      </div>
      {view === 'menu' ? (
        <nav className="flex flex-col gap-3 px-5 py-5" aria-label="Pause menu">
          <button className="btn py-2 text-xl" onClick={close} autoFocus>
            Resume
          </button>
          <button className="btn btn--ghost py-2 text-lg" onClick={() => show('options')}>
            Options
          </button>
          <button className="btn btn--ghost py-2 text-lg" onClick={() => show('confirm-quit')}>
            Main Menu
          </button>
        </nav>
      ) : (
        <div className="flex flex-col gap-3 px-5 py-5 text-center">
          <p className="font-display text-lg font-semibold">Return to the main menu?</p>
          <p className="-mt-2 text-sm font-semibold text-ink-soft">
            Your hero and Insight Gems are saved. This signal starts again from its call when you continue.
          </p>
          <button
            className="btn py-2 text-lg"
            onClick={() => {
              playSound('select');
              leaveToTitle();
            }}
            autoFocus
          >
            Main Menu
          </button>
          <button className="btn btn--ghost text-base" onClick={() => show('menu')}>
            Cancel
          </button>
        </div>
      )}
    </Modal>
  );
}
