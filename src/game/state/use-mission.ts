import { useSelector } from '@xstate/react';
import { getChallenge, getScript, isNorthBankOpen, type MissionPhase, type MissionScript } from '@/game/data';
import { missionActor, type MissionPhaseContext } from './mission-phase-machine';
import { isDevHero, useProfile } from './profile-store';
import { useSession } from './session-store';

/** Current mission phase, reactive. */
export function useMissionPhase(): MissionPhase {
  return useSelector(missionActor, (s) => s.value as MissionPhase);
}

/** Select a slice of the mission machine context, reactive. */
export function useMissionContext<T>(selector: (ctx: MissionPhaseContext) => T): T {
  return useSelector(missionActor, (s) => selector(s.context));
}

/** The current mission's script, reactive. */
export function useMissionScript(): MissionScript {
  return getScript(useMissionContext((c) => c.missionId));
}

/** Whether the north bank is open (Mission 2's gem earned, or the DEV hero), reactive. */
export function useNorthBankOpen(): boolean {
  return useProfile((s) => isNorthBankOpen(s.gems, isDevHero(s.heroName)));
}

/**
 * Whether the north gate stands open: once the north bank is open and its reveal has been shown —
 * or while the reveal shot is on screen, which is when the barrier lifts.
 */
export function isNorthGateUp(): boolean {
  const { gems, heroName, revealed } = useProfile.getState();
  return isNorthBankOpen(gems, isDevHero(heroName)) && (revealed.includes('north-bank') || useSession.getState().shot === 'north-gate');
}

/** `isNorthGateUp`, reactive. */
export function useNorthGateUp(): boolean {
  const open = useNorthBankOpen();
  const revealed = useProfile((s) => s.revealed.includes('north-bank'));
  const revealing = useSession((s) => s.shot === 'north-gate');
  return open && (revealed || revealing);
}

/**
 * The sketch fields a mission's device is running, as the world should show it:
 * live while that mission is being played; fixed once its gem is earned; as the
 * help seeker left it before then.
 */
export function useDeviceFields(missionId: string): Record<string, string> {
  const current = useMissionContext((c) => c.missionId) === missionId;
  const running = useSession((s) => s.running);
  const solved = useProfile((s) => s.gems.includes(missionId));
  const challenge = getChallenge(missionId);
  if (current) return running;
  return solved ? challenge.solvedFields : challenge.fields;
}
