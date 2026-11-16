'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from '@/game/state/session-store';
import { useIsTouch } from './controls';

/**
 * Short in-world remarks (usually Captain T) while exploring. Name + text only —
 * no portraits.
 */
export function MentorToast() {
  const line = useSession((s) => s.mentorLine);
  const clear = useSession((s) => s.clearMentorLine);
  const dialogue = useSession((s) => s.dialogue);
  const touch = useIsTouch();

  useEffect(() => {
    if (!line) return;
    const ms = Math.max(4500, line.text.length * 65);
    const id = window.setTimeout(clear, ms);
    return () => window.clearTimeout(id);
  }, [line, clear]);

  return (
    <AnimatePresence>
      {line && !dialogue && (
        <motion.div
          key={line.key}
          // Bottom centre, above the interact prompt (and clear of the touch joystick and buttons).
          className="pointer-events-auto fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-[min(70vw,460px)]"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.3 }}
          onClick={clear}
        >
          <div className="paper relative px-4 pb-3 pt-5">
            <span
              className={`absolute -top-3.5 left-4 rounded-full border-3 border-ink px-3 py-0.5 font-display text-xs font-semibold ${
                line.speaker === 'Captain T' ? 'bg-teal text-white' : 'bg-[#b9a3ff] text-ink'
              }`}
            >
              {line.speaker}
            </span>
            <p className={`font-semibold leading-snug ${touch ? 'text-sm' : ''}`}>{line.text}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
