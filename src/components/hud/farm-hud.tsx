'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { PALETTE, PIECES, kitItem, villaTier } from '@/game/sim/content';
import { playSound } from '@/game/engine/sound';
import { sendChat, sendEmote } from '@/game/net/coop';
import { amHost, cancelSleep, hotbar, rotateBuild, submit, toggleBuild, undoBuild } from '@/game/state/director';
import { useFarmState } from '@/game/state/farm-store';
import { useProfile } from '@/game/state/profile-store';
import { useSession } from '@/game/state/session-store';

/* ------------------------------------------------------------------ */
/* Hotbar                                                              */
/* ------------------------------------------------------------------ */

export function Hotbar() {
  const farm = useFarmState();
  const bag = useProfile((s) => s.bag);
  const slot = useSession((s) => s.slot);
  const setSlot = useSession((s) => s.setSlot);
  const build = useSession((s) => s.build.on);
  const slots = hotbar(farm, bag);
  if (build || !farm) return null;
  const active = Math.min(slot, slots.length - 1);
  return (
    <div className="pointer-events-auto fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 gap-1.5 sm:bottom-4">
      {slots.map((s, i) => (
        <button
          key={s.key}
          title={`${s.label}${s.from === 'storage' ? ' (from storage)' : ''}`}
          onClick={() => {
            setSlot(i);
            playSound('blip');
          }}
          className={`paper relative flex h-14 w-14 flex-col items-center justify-center transition ${i === active ? '-translate-y-1 bg-sun' : ''}`}
        >
          <span className="text-2xl leading-none" aria-hidden>
            {s.icon}
          </span>
          <span className="absolute left-1 top-0.5 font-display text-[10px] font-bold text-ink-soft">{i + 1}</span>
          {s.count !== undefined && <span className="absolute bottom-0.5 right-1 font-display text-xs font-bold">{s.count}</span>}
          {s.from === 'storage' && <span className="absolute right-1 top-0.5 text-[10px]">📦</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Build palette                                                       */
/* ------------------------------------------------------------------ */

export function BuildPalette() {
  const build = useSession((s) => s.build);
  const indoors = useSession((s) => s.indoors);
  const setBuild = useSession((s) => s.setBuild);
  const farm = useFarmState();
  const bag = useProfile((s) => s.bag);
  if (!build.on || !farm) return null;
  // Inside the house, the pieces that go indoors; outside, the ones for the farm.
  const pieces = Object.values(PIECES).filter(
    (p) => p.tier <= farm.villaTier && ((bag[kitItem(p.id)] ?? 0) > 0 || p.buy > 0) && (indoors ? !p.outdoor : !(p.villa || p.indoor)),
  );
  const v = villaTier(farm.villaTier);
  return (
    <motion.div
      className="pointer-events-auto fixed inset-x-2 bottom-2 z-30 mx-auto max-w-4xl"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0 }}
    >
      <div className="paper flex flex-col gap-2 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-display text-sm font-semibold">
            🔨 Build mode · villa: {v.name} ({v.w}×{v.h})
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <button className={`btn px-2 py-1 text-xs ${build.remove ? '' : 'btn--ghost'}`} onClick={() => setBuild({ remove: !build.remove, piece: null })}>
              Pick up <span className="key">X</span>
            </button>
            <button className="btn btn--ghost px-2 py-1 text-xs" onClick={rotateBuild}>
              Rotate <span className="key">R</span>
            </button>
            <button className="btn btn--ghost px-2 py-1 text-xs" onClick={undoBuild}>
              Undo <span className="key">Ctrl Z</span>
            </button>
            <button className="btn btn--teal px-2 py-1 text-xs" onClick={toggleBuild}>
              Done <span className="key">B</span>
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {pieces.map((p) => {
            const n = bag[kitItem(p.id)] ?? 0;
            const on = build.piece === p.id && !build.remove;
            return (
              <button
                key={p.id}
                title={n ? p.name : `${p.name} — buy at the carpenter (${p.buy}g)`}
                onClick={() => {
                  setBuild({ piece: on ? null : p.id, remove: false });
                  playSound('blip');
                }}
                className={`flex w-20 shrink-0 flex-col items-center rounded-xl border-2 border-ink px-1 py-1 text-center ${on ? 'bg-sun shadow-[0_2px_0_#2b2340]' : 'bg-white'} ${n ? '' : 'opacity-45'}`}
              >
                <span className="h-5 w-8 rounded border-2 border-ink" style={{ background: PALETTE[p.color] }} />
                <span className="mt-0.5 text-[11px] font-bold leading-tight">{p.name}</span>
                <span className="text-[10px] font-bold text-ink-soft">× {n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-ink-soft">Colour{build.piece ? '' : ' (click a piece to paint)'}:</span>
          {PALETTE.map((c, i) => (
            <button
              key={c}
              title={`Colour ${i + 1}`}
              onClick={() => setBuild({ color: build.color === i ? null : i, remove: false })}
              className={`h-6 w-6 rounded-full border-2 border-ink ${build.color === i ? 'ring-2 ring-ink ring-offset-2' : ''}`}
              style={{ background: c }}
            />
          ))}
          {build.color !== null && (
            <button className="btn btn--ghost ml-2 px-2 py-0.5 text-xs" onClick={() => submit({ t: 'roof', color: build.color! })}>
              Paint the roof
            </button>
          )}
        </div>
        <p className="text-[11px] font-semibold text-ink-soft">WASD pans · click places · right-click picks up · walls and fences snap to the nearest tile edge · walls and furniture are built inside the house; fences, paths and coops outside.</p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts, banners, fades                                              */
/* ------------------------------------------------------------------ */

export function Toast() {
  const shown = useSession((s) => s.toast);
  useEffect(() => {
    if (!shown) return;
    const id = window.setTimeout(() => {
      if (useSession.getState().toast?.key === shown.key) useSession.setState({ toast: null });
    }, 3200);
    return () => window.clearTimeout(id);
  }, [shown]);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-40 flex justify-center px-4 sm:top-6">
      <AnimatePresence>
        {shown && (
          <motion.p
            key={shown.key}
            className="paper max-w-md px-4 py-2 text-center font-display text-base font-semibold"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {shown.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Banners() {
  const countdown = useSession((s) => s.countdown);
  const hostAway = useSession((s) => s.net.hostAway);
  const farm = useFarmState();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-40 z-30 flex flex-col items-center gap-2 px-4 sm:top-20">
      {countdown !== null && (
        <div className="paper pointer-events-auto flex items-center gap-3 bg-sun px-4 py-2 font-display font-semibold">
          🌙 {amHost() ? 'You’re turning in' : `${farm?.ownerName} went to bed`} — morning in {countdown}s
          {amHost() && (
            <button className="btn btn--ghost px-2 py-0.5 text-sm" onClick={cancelSleep}>
              Stay up
            </button>
          )}
        </div>
      )}
      {hostAway && <div className="paper px-4 py-2 font-display font-semibold">💤 {farm?.ownerName ?? 'The host'} seems to be away…</div>}
    </div>
  );
}

/** Going in or out of the villa: a warm fade with the destination's name while the hero moves. */
export function DoorTransition() {
  const transition = useSession((s) => s.transition);
  return (
    <AnimatePresence>
      {transition && (
        <motion.div
          key="door-transition"
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

export function Fade() {
  const fade = useSession((s) => s.fade);
  return (
    <AnimatePresence>
      {fade && (
        <motion.div
          key="fade"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1d1830]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="font-display text-2xl font-semibold text-paper">{fade}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Chat and emotes                                                     */
/* ------------------------------------------------------------------ */

const EMOTES: [string, string][] = [
  ['wave', '👋'],
  ['heart', '💛'],
  ['laugh', '😄'],
  ['wow', '😮'],
];

export function Chat() {
  const chat = useSession((s) => s.chat);
  const open = useSession((s) => s.chatOpen);
  const online = useSession((s) => s.net.status === 'hosting' || s.net.status === 'visiting');
  const name = useProfile((s) => s.name);
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  if (!online && !chat.length) return null;
  const close = () => useSession.getState().setChatOpen(false);
  const recent = chat.slice(open ? -8 : -4);
  return (
    <div className="pointer-events-auto fixed bottom-24 left-3 z-30 w-[min(320px,80vw)] sm:bottom-6 sm:left-4">
      <div className="mb-1.5 space-y-0.5">
        {recent.map((l) => (
          <p key={l.key} className="w-fit rounded-lg bg-ink/60 px-2 py-0.5 text-sm font-semibold text-paper">
            <b>{l.name}:</b> {l.text}
          </p>
        ))}
      </div>
      {open ? (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (t) {
              sendChat(t);
              useSession.getState().pushChat(name, t);
            }
            setText('');
            close();
          }}
        >
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 200))}
            onKeyDown={(e) => e.key === 'Escape' && close()}
            onBlur={close}
            placeholder="Say something…"
            className="w-full rounded-xl border-3 border-ink bg-white px-3 py-1 font-semibold outline-none"
          />
        </form>
      ) : (
        online && (
          <div className="flex gap-1">
            {EMOTES.map(([id, icon]) => (
              <button
                key={id}
                className="paper h-9 w-9 text-lg"
                title={id}
                onClick={() => {
                  sendEmote(id);
                  useSession.getState().showToast(`You ${id === 'wave' ? 'wave' : id === 'heart' ? 'send some love' : id === 'laugh' ? 'laugh' : 'gasp'} ${icon}`);
                }}
              >
                {icon}
              </button>
            ))}
            <button className="paper px-2 text-xs font-bold" onClick={() => useSession.getState().setChatOpen(true)}>
              Chat <span className="key">T</span>
            </button>
          </div>
        )
      )}
    </div>
  );
}
