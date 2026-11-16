'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { getHero, HEROES, ROLES, type RoleId } from '@/game/data';
import { playSound } from '@/game/engine/sound';
import { useProfile } from '@/game/state/profile-store';

/**
 * Hero selection — fixed built-in roster, a Hero Name, and a Role.
 * The selected hero previews live in the 3D world beside the panel.
 */
export function HeroSetupScreen({ onConfirm }: { onConfirm: () => void }) {
  const profile = useProfile();
  const [heroId, setHeroId] = useState(getHero(profile.heroId).id);
  const [name, setName] = useState(profile.heroName);
  const [role, setRole] = useState<RoleId | null>(profile.role);
  const hero = getHero(heroId);
  const valid = name.trim().length >= 2 && !!role;

  const pickHero = (id: string) => {
    setHeroId(id);
    profile.setHero(id);
    playSound('select');
  };

  const confirm = () => {
    if (!valid || !role) return;
    profile.setIdentity(heroId, name.trim(), role);
    playSound('success');
    onConfirm();
  };

  return (
    <motion.div
      className="fixed inset-y-0 left-0 z-40 flex w-full max-w-[460px] flex-col p-3 sm:p-5"
      initial={{ x: -40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -40, opacity: 0, transition: { duration: 0.3 } }}
    >
      <div className="paper flex max-h-full flex-col overflow-hidden">
        <div className="border-b-3 border-ink bg-sun px-5 py-3 [@media(max-height:520px)]:py-1.5">
          <p className="font-display text-xs font-semibold tracking-[0.2em] text-ink-soft">REGISTER WITH THE SYSTEM</p>
          <h2 className="font-display text-2xl font-bold">Choose your hero</h2>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 [@media(max-height:520px)]:space-y-2 [@media(max-height:520px)]:py-2">
          <div className="grid grid-cols-3 gap-2 [@media(max-height:520px)]:grid-cols-6">
            {HEROES.map((h) => (
              <button
                key={h.id}
                onClick={() => pickHero(h.id)}
                disabled={h.locked}
                title={h.locked ? `${h.name} — locked` : h.name}
                className={`relative flex flex-col items-center gap-1 rounded-xl border-3 px-1 py-2 transition ${
                  h.id === heroId
                    ? 'border-ink bg-white shadow-[0_3px_0_#2b2340]'
                    : h.locked
                      ? 'cursor-not-allowed border-transparent opacity-45 grayscale'
                      : 'border-transparent hover:bg-white/70'
                }`}
              >
                {h.locked && (
                  <span className="absolute right-1 top-1 text-xs" aria-hidden>
                    🔒
                  </span>
                )}
                <span
                  className="h-9 w-9 rounded-full border-3 border-ink [@media(max-height:520px)]:h-7 [@media(max-height:520px)]:w-7"
                  style={{ background: `linear-gradient(135deg, ${h.palette.outfit} 55%, ${h.palette.accent} 55%)` }}
                />
                <span className="font-display text-sm font-semibold leading-tight [@media(max-height:520px)]:text-[11px]">{h.name}</span>
              </button>
            ))}
          </div>

          <div className="rounded-xl bg-paper-2 px-4 py-3 [@media(max-height:520px)]:hidden">
            <p className="font-display text-sm font-semibold text-teal">{hero.specialization}</p>
            <p className="font-display text-lg font-semibold">“{hero.philosophy}”</p>
            <p className="mt-1 text-sm text-ink-soft">{hero.blurb}</p>
          </div>

          <label className="block">
            <span className="font-display text-sm font-semibold">Hero Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
              placeholder="What does the System call you?"
              className="mt-1 w-full rounded-xl border-3 border-ink bg-white px-3 py-2 font-display text-lg outline-none focus:bg-[#fffdf7]"
            />
          </label>

          <div>
            <span className="font-display text-sm font-semibold">Role — what are you becoming?</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setRole(r.id);
                    playSound('blip');
                  }}
                  className={`rounded-full border-2 border-ink px-3 py-1 text-sm font-bold transition ${
                    role === r.id ? 'bg-mint shadow-[0_2px_0_#2b2340]' : 'bg-white hover:bg-paper-2'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t-3 border-ink px-5 py-4 [@media(max-height:520px)]:py-2">
          <button className="btn w-full py-3 text-xl [@media(max-height:520px)]:py-1.5" disabled={!valid} onClick={confirm}>
            Enter the System
          </button>
          {!valid && (
            <p className="mt-1.5 text-center text-xs font-bold text-ink-soft">Enter a Hero Name and choose a Role to continue.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
