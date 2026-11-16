'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  chooseOption,
  formatLine,
  getCurrentNode,
  getVisibleChoices,
  requestAdvance,
} from '@/game/state/mission-director';
import { useSession } from '@/game/state/session-store';

const SPEAKER_STYLES: Record<string, { tag: string; label: string }> = {
  'mr-t': { tag: 'bg-teal text-white', label: 'Captain T' },
  npc: { tag: 'bg-[#b9a3ff] text-ink', label: '' },
  player: { tag: 'bg-sun text-ink', label: '' },
  system: { tag: 'bg-ink text-paper', label: 'System' },
};

/** Typewriter that reports its state to the session (for Space/E skipping). */
function useTypewriter(text: string) {
  const skipKey = useSession((s) => s.skipTypingKey);
  const [state, setState] = useState({ text, shown: 0, skipKey });

  // Reset on new text / jump to the end on a skip request (derived state).
  let shown = state.shown;
  if (state.text !== text) {
    shown = 0;
    setState({ text, shown, skipKey });
  } else if (state.skipKey !== skipKey) {
    shown = text.length;
    setState({ text, shown, skipKey });
  }
  const done = shown >= text.length;

  useEffect(() => {
    useSession.setState({ typing: !done });
  }, [done]);

  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => {
      setState((s) => (s.text === text ? { ...s, shown: Math.min(text.length, s.shown + 2) } : s));
    }, 28);
    return () => window.clearInterval(id);
  }, [text, done]);

  return text.slice(0, shown);
}

/**
 * ONE shared dialogue cloud in the upper third. Speaker name + text only —
 * no portraits; the characters stand in the 3D scene (GUIDE.md).
 */
export function DialogueCloud() {
  const dialogue = useSession((s) => s.dialogue);
  const typing = useSession((s) => s.typing);
  const flags = useSession((s) => s.dialogueFlags);
  const node = dialogue ? getCurrentNode() : undefined;
  const text = node ? formatLine(node.text) : '';
  const shown = useTypewriter(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- flags drive visibility
  const choices = useMemo(() => (node ? getVisibleChoices(node) : []), [node, flags]);
  const style = SPEAKER_STYLES[node?.speaker ?? 'system'];
  const name = node ? formatLine(node.speakerName ?? style.label) : '';

  // Number keys pick choices (not while paused).
  useEffect(() => {
    if (typing || choices.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (useSession.getState().panel === 'pause') return;
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && choices[i]) chooseOption(choices[i].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [typing, choices]);

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          key="cloud"
          className="pointer-events-none fixed inset-x-0 top-[9vh] z-30 flex flex-col items-center gap-3 px-3"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.3 }}
        >
          <div
            role="button"
            tabIndex={-1}
            onClick={requestAdvance}
            className="paper pointer-events-auto relative w-full max-w-2xl cursor-pointer px-6 pb-5 pt-6"
          >
            <span className={`absolute -top-4 left-5 rounded-full border-3 border-ink px-3 py-0.5 font-display text-sm font-semibold ${style.tag}`}>
              {name}
            </span>
            <p className="min-h-[3.5rem] text-lg font-semibold leading-snug sm:text-xl">
              {shown}
              <span className="opacity-0">{text.slice(shown.length)}</span>
            </p>
            {!typing && choices.length === 0 && (
              <motion.span
                className="absolute bottom-2 right-4 flex items-center gap-1.5 text-xs font-bold text-ink-soft"
                animate={{ y: [0, 3, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <span className="key">Space</span> continue ▼
              </motion.span>
            )}
          </div>

          {!typing && choices.length > 0 && (
            <motion.div
              key={dialogue?.nodeId}
              className="pointer-events-auto flex w-full max-w-2xl flex-col items-end gap-2"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.06 } } }}
            >
              {choices.map((c, i) => (
                <motion.button
                  key={c.id}
                  variants={{ hidden: { opacity: 0, x: 20 }, show: { opacity: 1, x: 0 } }}
                  className="btn btn--ghost max-w-[90%] justify-start text-left text-base"
                  onClick={() => chooseOption(c.id)}
                >
                  <span className="key shrink-0">{i + 1}</span>
                  <span>{formatLine(c.text)}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
