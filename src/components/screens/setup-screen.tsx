'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { getLook, LOOKS } from '@/game/data';
import { playSound } from '@/game/engine/sound';
import { isDevName, useProfile } from '@/game/state/profile-store';

/**
 * Pick a look and a name — a quick pick, no sliders. The chosen look previews live in the 3D world
 * beside the panel. A friend arriving from a join link lands here first, then straight on the farm.
 */
export function SetupScreen({ onConfirm, joining }: { onConfirm: () => void; joining: boolean }) {
  const profile = useProfile();
  const [look, setLook] = useState(getLook(profile.look).id);
  const [name, setName] = useState(profile.name);
  const valid = name.trim().length >= 2;

  const pick = (id: string) => {
    setLook(id);
    profile.setIdentity(profile.name, id);
    playSound('select');
  };

  const confirm = () => {
    if (!valid) return;
    profile.setIdentity(name.trim(), look);
    playSound('success');
    onConfirm();
  };

  return (
    <motion.div
      className="fixed inset-y-0 left-0 z-40 flex w-full max-w-[440px] flex-col p-3 sm:p-5"
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -40, opacity: 0, transition: { duration: 0.3 } }}
    >
      <div className="paper flex max-h-full flex-col overflow-hidden">
        <div className="border-b-3 border-ink bg-sun px-5 py-3">
          <p className="font-display text-xs font-semibold tracking-[0.2em] text-ink-soft">{joining ? 'VISITING A FRIEND' : 'A NEW FARMER'}</p>
          <h2 className="font-display text-2xl font-bold">Who’s this?</h2>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-4 gap-2">
            {LOOKS.map((l) => (
              <button
                key={l.id}
                onClick={() => pick(l.id)}
                title={l.name}
                className={`flex flex-col items-center gap-1 rounded-xl border-3 px-1 py-2 transition ${
                  l.id === look ? 'border-ink bg-white shadow-[0_3px_0_#2b2340]' : 'border-transparent hover:bg-white/70'
                }`}
              >
                <span className="h-9 w-9 rounded-full border-3 border-ink" style={{ background: `linear-gradient(135deg, ${l.swatch[0]} 55%, ${l.swatch[1]} 55%)` }} />
                <span className="font-display text-xs font-semibold leading-tight">{l.name}</span>
              </button>
            ))}
          </div>
          <label className="block">
            <span className="font-display text-sm font-semibold">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
              placeholder="What do the townsfolk call you?"
              autoFocus
              className="mt-1 w-full rounded-xl border-3 border-ink bg-white px-3 py-2 font-display text-lg outline-none focus:bg-[#fffdf7]"
            />
          </label>
          {isDevName(name) && <p className="text-xs font-bold text-coral">Dev account: infinite gold, shops open any time, and time controls (6 AM · 12 NN · 9 PM, freeze).</p>}
        </div>
        <div className="border-t-3 border-ink px-5 py-4">
          <button className="btn w-full py-3 text-xl" disabled={!valid} onClick={confirm}>
            {joining ? 'Hop over' : 'To the farm!'}
          </button>
          {!valid && <p className="mt-1.5 text-center text-xs font-bold text-ink-soft">Pick a name (two letters or more).</p>}
        </div>
      </div>
    </motion.div>
  );
}
