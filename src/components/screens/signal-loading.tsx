'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

const CLOUDS = [
  { top: '12%', w: 220, h: 60, dur: 26, delay: -4 },
  { top: '26%', w: 320, h: 80, dur: 34, delay: -18 },
  { top: '58%', w: 260, h: 70, dur: 22, delay: -9 },
  { top: '72%', w: 380, h: 96, dur: 38, delay: -25 },
  { top: '42%', w: 180, h: 50, dur: 18, delay: -2 },
  { top: '84%', w: 240, h: 64, dur: 28, delay: -14 },
];

/**
 * Narrative loading — never a spinner. Captain T flies across the network
 * to wherever the signal came from (GAME_CONCEPT §4.1).
 */
export function SignalLoading({ text }: { text: string }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #8ecae6 0%, #cfe9f2 55%, #fdf0d5 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
    >
      {CLOUDS.map((c, i) => (
        <div
          key={i}
          className="cloud"
          style={{ top: c.top, width: c.w, height: c.h, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
        />
      ))}

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8">
        <div className="float relative">
          {/* speed streaks behind the cape */}
          <svg className="absolute -left-14 top-[30%]" width="64" height="48" viewBox="0 0 64 48" aria-hidden>
            <g stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.9">
              <line x1="14" y1="6" x2="62" y2="6" />
              <line x1="2" y1="24" x2="54" y2="24" />
              <line x1="18" y1="42" x2="60" y2="42" />
            </g>
          </svg>
          <Image
            src="/images/captain-t-flying.png"
            alt="Captain T flying"
            width={946}
            height={498}
            priority
            className="h-auto w-[260px] drop-shadow-[0_10px_12px_rgba(43,35,64,0.18)]"
          />
        </div>
        <motion.p
          className="font-display text-2xl font-semibold tracking-wide text-ink"
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        >
          {text}
        </motion.p>
      </div>
    </motion.div>
  );
}
