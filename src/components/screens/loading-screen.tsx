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

/** Loading is a little scene, never a spinner: clouds drift past the Meadowfolk sign. */
export function LoadingScreen({ text }: { text: string }) {
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
          <Image
            src="/images/meadowfolk-logo.png"
            alt="Meadowfolk"
            width={1672}
            height={941}
            priority
            className="h-auto w-[min(360px,80vw)] drop-shadow-[0_10px_12px_rgba(43,35,64,0.18)]"
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
