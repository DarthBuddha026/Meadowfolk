import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { START_GOLD } from '@/game/sim/content';
import { addTo } from '@/game/sim/sim';
import type { Bag, ItemKey } from '@/game/sim/types';

/**
 * The player's own profile: who they are, how they look, their gold and their personal bag. It
 * travels with them when they visit a friend's farm. Each player's own client writes it (to the
 * cloud when it is configured — see cloud.ts — with this localStorage copy as a cache only).
 */
export interface ProfileData {
  playerId: string;
  name: string;
  look: string;
  gold: number;
  bag: Bag;
  /** One-time nudges already shown: 'email-after-visit', 'email-after-host'. */
  nudged: string[];
  /**
   * The hotbar as the player arranged it in their bag: a tool ('hoe', 'can', 'axe') or an item key per
   * slot, null for an empty one. Unset, the hotbar fills itself (tools, then seeds).
   */
  hotbar?: (string | null)[];
  /** When this profile was last changed (ms), to pick the newer of the cloud and local copies. */
  savedAt: number;
}

interface ProfileState extends ProfileData {
  muted: boolean;
  setIdentity: (name: string, look: string) => void;
  setPlayerId: (id: string) => void;
  addItem: (item: ItemKey, n: number) => void;
  addGold: (n: number) => void;
  markNudged: (id: string) => void;
  setHotbar: (hotbar: (string | null)[] | undefined) => void;
  load: (data: ProfileData) => void;
  toggleMuted: () => void;
  /** New game: a fresh wallet and bag (identity kept). */
  resetEconomy: () => void;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** The starting bag for a new farmer. */
export const STARTER_BAG: Bag = { 'seed-turnip': 15, 'seed-peas': 4, acorn: 2 };

/**
 * Two players on one machine (testing co-op in two tabs) need two profiles: `?profile=<name>` keeps
 * a separate one under its own key.
 */
function storageKey() {
  if (typeof window === 'undefined') return 'meadowfolk-profile';
  const p = new URLSearchParams(window.location.search).get('profile');
  return p ? `meadowfolk-profile-${p.replace(/[^\w-]/g, '').slice(0, 24)}` : 'meadowfolk-profile';
}

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      playerId: '',
      name: '',
      look: 'farmer',
      gold: START_GOLD,
      bag: { ...STARTER_BAG },
      nudged: [],
      savedAt: 0,
      muted: false,
      setIdentity: (name, look) =>
        set(name.trim().toUpperCase() === 'DEV' ? { name, look, gold: DEV_GOLD, savedAt: Date.now() } : { name, look, savedAt: Date.now() }),
      setPlayerId: (playerId) => set({ playerId }),
      addItem: (item, n) => {
        const bag = { ...get().bag };
        addTo(bag, item, n);
        set({ bag, savedAt: Date.now() });
      },
      // The DEV account's purse never runs out (it's refilled on every change).
      addGold: (n) => set({ gold: get().name.trim().toUpperCase() === 'DEV' ? DEV_GOLD : Math.max(0, get().gold + n), savedAt: Date.now() }),
      markNudged: (id) => {
        if (!get().nudged.includes(id)) set({ nudged: [...get().nudged, id], savedAt: Date.now() });
      },
      setHotbar: (hotbar) => set({ hotbar, savedAt: Date.now() }),
      load: (data) => set({ hotbar: undefined, ...data }),
      toggleMuted: () => set({ muted: !get().muted }),
      resetEconomy: () => set({ gold: START_GOLD, bag: { ...STARTER_BAG }, hotbar: undefined, savedAt: Date.now() }),
    }),
    {
      name: storageKey(),
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state && !state.playerId) state.setPlayerId(newId());
      },
    }
  )
);

export function profileData(): ProfileData {
  const { playerId, name, look, gold, bag, nudged, hotbar, savedAt } = useProfile.getState();
  return { playerId, name, look, gold, bag, nudged, hotbar, savedAt };
}

export const hasIdentity = (s: Pick<ProfileData, 'name'>) => s.name.trim().length >= 2;

export const ownsItem = (item: ItemKey, n = 1) => (useProfile.getState().bag[item] ?? 0) >= n;

/** A player named "DEV" (any case) gets plenty of gold for testing; nothing else changes. */
export const isDevName = (name = useProfile.getState().name) => name.trim().toUpperCase() === 'DEV';

/** The DEV account's gold: effectively infinite (shown as ∞). */
export const DEV_GOLD = 999_999_999;
