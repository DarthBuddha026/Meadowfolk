import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RoleId } from '@/game/data';

/**
 * Persistent player profile: hero identity, earned Insight Gems, settings.
 */
interface ProfileState {
  heroId: string | null;
  heroName: string;
  role: RoleId | null;
  /** Mission ids whose Insight Gem has been earned (exactly one each, ever). */
  gems: string[];
  /** Unlocked areas whose reveal has been shown (`'north-bank'`), so it plays only once. */
  revealed: string[];
  muted: boolean;
  setIdentity: (heroId: string, heroName: string, role: RoleId) => void;
  setHero: (heroId: string) => void;
  awardGem: (missionId: string) => boolean;
  markRevealed: (id: string) => void;
  toggleMuted: () => void;
  resetProfile: () => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set, get) => ({
      heroId: null,
      heroName: '',
      role: null,
      gems: [],
      revealed: [],
      muted: false,
      setIdentity: (heroId, heroName, role) => set({ heroId, heroName, role }),
      setHero: (heroId) => set({ heroId }),
      awardGem: (missionId) => {
        if (get().gems.includes(missionId)) return false;
        set({ gems: [...get().gems, missionId] });
        return true;
      },
      markRevealed: (id) => {
        if (!get().revealed.includes(id)) set({ revealed: [...get().revealed, id] });
      },
      toggleMuted: () => set({ muted: !get().muted }),
      resetProfile: () => set({ heroId: null, heroName: '', role: null, gems: [], revealed: [] }),
    }),
    { name: 'trioe-3d-profile' }
  )
);

/**
 * A hero named "DEV" (any case) is a developer: every playable mission's signal is open and can
 * be answered at any time, without the previous gem. Gems are still only earned in REWARD.
 */
export function isDevHero(heroName = useProfile.getState().heroName): boolean {
  return heroName.trim().toUpperCase() === 'DEV';
}

export function hasIdentity(state: Pick<ProfileState, 'heroId' | 'heroName' | 'role'>): boolean {
  return !!state.heroId && state.heroName.trim().length > 0 && !!state.role;
}
