'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from '@/game/state/session-store';

/** Warm fade with the destination's name while the map swaps behind it. */
export function MapTransition() {
  const transition = useSession((s) => s.transition);
  return (
    <AnimatePresence>
      {transition && (
        <motion.div
          key="map-transition"
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'radial-gradient(ellipse at center, #3a2a1f 0%, #1d1510 100%)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.32, ease: 'easeIn' } }}
          exit={{ opacity: 0, transition: { duration: 0.45, ease: 'easeOut' } }}
        >
          <motion.div
            className="flex flex-col items-center gap-3"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { delay: 0.12, duration: 0.3 } }}
          >
            <svg width="54" height="64" viewBox="0 0 54 64" aria-hidden>
              <path d="M4 62 V24 A23 23 0 0 1 50 24 V62 Z" fill="#c98d57" stroke="#fff4dc" strokeWidth="3" />
              <path d="M27 6 V62" stroke="#a46a3f" strokeWidth="2" />
              <circle cx="37" cy="38" r="3" fill="#ffd166" />
            </svg>
            <p className="font-display text-2xl font-semibold tracking-wide text-paper">{transition.destination}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
