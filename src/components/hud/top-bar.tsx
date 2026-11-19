'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { getLook } from '@/game/data';
import { playSound } from '@/game/engine/sound';
import { amHost, cropLabel, devGrowAll, devRipenFruit, devSetTime, devToggleFreeze, seasonName } from '@/game/state/director';
import { clockText, useClock, useFarmState } from '@/game/state/farm-store';
import { isDevName, useProfile } from '@/game/state/profile-store';
import { useSession, type PanelId } from '@/game/state/session-store';
import { useIsTouch } from './controls';
import { Minimap } from './minimap';
import { Gold } from './panels';

function Clock() {
  const minute = useClock((s) => Math.floor(s.minute / 10) * 10);
  const farm = useFarmState();
  const frozen = useSession((s) => s.frozen);
  if (!farm) return null;
  const hour = 6 + minute / 60;
  const icon = hour < 7 ? '🌅' : hour < 18 ? '☀️' : hour < 20 ? '🌇' : '🌙';
  return (
    <div className="paper px-3 py-2 leading-tight">
      <p className="font-display text-[10px] font-semibold tracking-[0.2em] text-teal">
        {seasonName(farm.season).toUpperCase()} {farm.day} · YEAR {farm.year}
      </p>
      <p className="font-display text-xl font-semibold">
        {icon} {clockText(minute)}
        {frozen && <span title="Time is frozen"> ❄</span>}
      </p>
      {hour >= 24 && <p className="text-xs font-bold text-coral">Getting late — find your bed!</p>}
    </div>
  );
}

/** The DEV account's tools: jump to morning, noon or night, and freeze the clock. */
const DEV_TIMES: [string, number][] = [
  ['6 AM', 0],
  ['12 NN', 360],
  ['9 PM', 900],
];

function DevTools() {
  const name = useProfile((s) => s.name);
  const frozen = useSession((s) => s.frozen);
  const visiting = useSession((s) => s.net.status === 'visiting');
  if (!isDevName(name)) return null;
  const small = 'btn px-2 py-1 text-xs';
  return (
    <div className="paper pointer-events-auto px-3 py-2">
      <p className="font-display text-[10px] font-semibold tracking-[0.2em] text-coral">DEV · ∞ GOLD</p>
      {visiting ? (
        <p className="mt-1 text-xs font-bold text-ink-soft">Time is the host’s while visiting.</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DEV_TIMES.map(([label, minute]) => (
            <button key={label} className={`${small} btn--ghost`} onClick={() => devSetTime(minute)}>
              {label}
            </button>
          ))}
          <button className={`${small} ${frozen ? '' : 'btn--ghost'}`} onClick={devToggleFreeze} title={frozen ? 'Let time run again' : 'Stop the clock'}>
            {frozen ? '▶ Unfreeze' : '❄ Freeze'}
          </button>
        </div>
      )}
      {!visiting && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button className={`${small} btn--ghost`} onClick={devGrowAll} title="Ripen every crop and grow every planted tree, now">
            🌱 Grow all
          </button>
          <button className={`${small} btn--ghost`} onClick={devRipenFruit} title="Every grown fruit tree ready to pick">
            🍎 Ripen fruit
          </button>
        </div>
      )}
    </div>
  );
}

/** What's on the tile you face. */
function TileHint() {
  const target = useSession((s) => s.target);
  const farm = useFarmState();
  const label = farm && target ? cropLabel(farm, target[0], target[1]) : null;
  return (
    <AnimatePresence>
      {label && (
        <motion.p
          key={label}
          className="paper px-3 py-1 text-sm font-bold"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {label}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function IconButton({ title, panel, children }: { title: string; panel: PanelId; children: React.ReactNode }) {
  const openPanel = useSession((s) => s.openPanel);
  return (
    <button
      className="btn btn--ghost btn--icon"
      title={title}
      onClick={() => {
        playSound('open');
        openPanel(panel);
      }}
    >
      {children}
    </button>
  );
}

export function TopBar() {
  const { name, look, gold, muted, toggleMuted } = useProfile();
  const touch = useIsTouch();
  const net = useSession((s) => s.net);
  const farm = useFarmState();
  const l = getLook(look);
  const visiting = net.status === 'visiting';
  const indoors = useSession((s) => s.indoors);

  return (
    <>
      <div className={`paper pointer-events-auto fixed right-3 z-30 flex items-center gap-3 px-3 py-2 sm:right-4 ${touch ? 'bottom-28' : 'bottom-4'}`}>
        <span className="h-9 w-9 shrink-0 rounded-full border-3 border-ink" style={{ background: `linear-gradient(135deg, ${l.swatch[0]} 55%, ${l.swatch[1]} 55%)` }} />
        <div className="leading-tight">
          <p className="font-display text-base font-semibold">{name}</p>
          <p className="text-xs font-bold text-ink-soft">{visiting ? `Visiting ${farm?.ownerName}` : amHost() ? farm?.name : ''}</p>
        </div>
      </div>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="flex flex-col items-start gap-2">
          {!indoors && <Minimap />}
          <Clock />
          <DevTools />
          <TileHint />
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <div className="paper flex h-11 items-center px-3" title="Your gold">
            {isDevName(name) ? (
              <span className="font-display text-lg font-semibold" title="DEV: infinite gold">
                ∞g
              </span>
            ) : (
              <Gold n={gold} className="text-lg" />
            )}
          </div>
          <IconButton title="Play together (C)" panel="coop-play">
            <span className="font-display text-sm font-bold">{net.status === 'offline' ? '👥' : `👥${net.players.length}`}</span>
          </IconButton>
          <IconButton title="Your bag (I)" panel="bag">
            <span aria-hidden>🎒</span>
          </IconButton>
          <button className="btn btn--ghost btn--icon" title={muted ? 'Unmute' : 'Mute'} onClick={toggleMuted}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b2340" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="#2b2340" />
              {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a8.5 8.5 0 0 1 0 13" />}
            </svg>
          </button>
          <IconButton title="How to play (H)" panel="help">
            <span className="font-display text-lg">?</span>
          </IconButton>
          <IconButton title="Pause (Esc)" panel="pause">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#2b2340" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          </IconButton>
        </div>
      </div>
    </>
  );
}
