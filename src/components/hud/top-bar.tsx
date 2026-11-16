'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { getHero, getMissionById, getRoleLabel } from '@/game/data';
import { playSound } from '@/game/engine/sound';
import { getObjective } from '@/game/state/mission-director';
import { useProfile } from '@/game/state/profile-store';
import { useSession } from '@/game/state/session-store';
import { useMissionContext, useMissionPhase } from '@/game/state/use-mission';
import { useIsTouch } from './controls';
import { Minimap } from './minimap';

export function GemIcon({ size = 20, color = '#8b5cf6' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2 L21 9 L12 22 L3 9 Z" fill={color} stroke="#2b2340" strokeWidth="2" strokeLinejoin="round" />
      <path d="M3 9 H21 M12 2 L8 9 L12 22 L16 9 Z" fill="none" stroke="#2b2340" strokeWidth="1.2" opacity="0.5" />
    </svg>
  );
}

export function TopBar() {
  const phase = useMissionPhase();
  const clues = useMissionContext((c) => c.discoveredClues.length);
  const missionId = useMissionContext((c) => c.missionId);
  const { heroId, heroName, role, gems, muted, toggleMuted } = useProfile();
  const gemCollected = useSession((s) => s.gemCollected);
  const openPanel = useSession((s) => s.openPanel);
  const hero = getHero(heroId);
  const touch = useIsTouch();
  const map = useSession((s) => s.map); // objective text depends on which map you are on, too
  const objective = getObjective(phase, clues, gemCollected);

  return (
    <>
      {/* Currently playing as — bottom right, lifted clear of the touch buttons */}
      <div className={`paper pointer-events-auto fixed right-3 z-30 flex items-center gap-3 px-3 py-2 sm:right-4 ${touch ? 'bottom-28' : 'bottom-4'}`}>
        <span
          className="h-9 w-9 shrink-0 rounded-full border-3 border-ink"
          style={{ background: `linear-gradient(135deg, ${hero.palette.outfit} 55%, ${hero.palette.accent} 55%)` }}
        />
        <div className="leading-tight">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-soft">Playing as</p>
          <p className="font-display text-base font-semibold">{heroName}</p>
          <p className="text-xs font-bold text-ink-soft">
            {hero.name} · {getRoleLabel(role)}
          </p>
        </div>
      </div>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="flex flex-col items-start gap-3">
          {map === 'junction' && <Minimap />}
          <AnimatePresence mode="wait">
            <motion.div
              key={missionId + objective}
              className="paper max-w-[min(80vw,340px)] px-3 py-2"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <p className="font-display text-[10px] font-semibold tracking-[0.2em] text-teal">{getMissionById(missionId)?.shortName}</p>
              <p className="text-sm font-bold">◆ {objective}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <div className="paper flex h-11 items-center gap-1.5 px-3" title="Insight Gems">
            <GemIcon />
            <span className="font-display text-lg font-semibold">{gems.length}</span>
          </div>
          <button
            className="btn btn--ghost btn--icon"
            title="Evidence journal (J)"
            onClick={() => {
              playSound('open');
              openPanel('journal');
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b2340" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
              <path d="M9 9h6M9 13h4" />
            </svg>
          </button>
          <button className="btn btn--ghost btn--icon" title={muted ? 'Unmute' : 'Mute'} onClick={toggleMuted}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b2340" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 9h4l5-4v14l-5-4H4z" fill="#2b2340" />
              {muted ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M17 8a5 5 0 0 1 0 8M19.5 5.5a8.5 8.5 0 0 1 0 13" />}
            </svg>
          </button>
          <button
            className="btn btn--ghost btn--icon font-display text-lg"
            title="Controls (H)"
            onClick={() => {
              playSound('open');
              openPanel('help');
            }}
          >
            ?
          </button>
          <button
            className="btn btn--ghost btn--icon"
            title="Pause (Esc)"
            onClick={() => {
              playSound('open');
              openPanel('pause');
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#2b2340" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
