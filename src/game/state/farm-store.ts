import { create } from 'zustand';
import type { FarmState } from '@/game/sim/types';

/**
 * The farm currently in the world: the player's own (they host it, alone or with guests) or the
 * read-only replica of a friend's farm they are visiting. The sim mutates `farm` in place; `rev`
 * is bumped after every change so the scene and HUD re-read it. The clock lives apart in
 * `useClock` so its steady ticking never rebuilds the farm's meshes.
 */
export type Role = 'host' | 'guest';

interface FarmStore {
  farm: FarmState | null;
  role: Role;
  rev: number;
  setFarm: (farm: FarmState | null, role: Role) => void;
  bump: () => void;
}

export const useFarm = create<FarmStore>()((set, get) => ({
  farm: null,
  role: 'host',
  rev: 0,
  setFarm: (farm, role) => {
    set({ farm, role, rev: get().rev + 1 });
    useClock.getState().setMinute(farm?.minute ?? 0);
  },
  bump: () => set({ rev: get().rev + 1 }),
}));

export const getFarm = () => useFarm.getState().farm;

/** Re-render on every farm change; returns the farm (mutated in place). */
export function useFarmState(): FarmState | null {
  useFarm((s) => s.rev);
  return useFarm((s) => s.farm);
}

interface ClockStore {
  /** In-game minutes since 6:00. */
  minute: number;
  setMinute: (m: number) => void;
}

export const useClock = create<ClockStore>()((set) => ({
  minute: 0,
  setMinute: (minute) => set({ minute }),
}));

/** "9:40 AM" for in-game minutes since 6:00. */
export function clockText(minute: number): string {
  const total = 6 * 60 + Math.floor(minute);
  const h24 = Math.floor(total / 60) % 24;
  const m = Math.floor((total % 60) / 10) * 10;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** Hours since midnight (6 … 26) for lighting. */
export const clockHour = (minute: number) => 6 + minute / 60;
