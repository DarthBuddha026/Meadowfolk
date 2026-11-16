import type { Clue, DialogueTree, EvidenceSurface, InvestigationData, MissionChallenge, Reflection } from './types';
import type { MissionScript } from './mission-script';
import { MISSION_1_CHALLENGE } from './mission-1/challenge';
import { MISSION_1_DIALOGUES } from './mission-1/dialogues';
import { MISSION_1_INVESTIGATION, MISSION_1_SURFACES } from './mission-1/investigation';
import { MISSION_1_REFLECTION } from './mission-1/reflection';
import { MISSION_1_SCRIPT } from './mission-1/script';
import { MISSION_2_CHALLENGE } from './mission-2/challenge';
import { MISSION_2_DIALOGUES } from './mission-2/dialogues';
import { MISSION_2_INVESTIGATION, MISSION_2_SURFACES } from './mission-2/investigation';
import { MISSION_2_REFLECTION } from './mission-2/reflection';
import { MISSION_2_SCRIPT } from './mission-2/script';

export * from './types';
export * from './mission-script';
export * from './heroes';
export * from './missions';
export * from './world-layout';
export * from './terrain-plan';
export * from './ambient';

/** Everything one playable mission is made of. */
interface MissionContent {
  script: MissionScript;
  dialogues: DialogueTree[];
  investigation: InvestigationData;
  surfaces: EvidenceSurface[];
  challenge: MissionChallenge;
  reflection: Reflection;
}

const CONTENT: Record<string, MissionContent> = {
  'mission-1': {
    script: MISSION_1_SCRIPT,
    dialogues: MISSION_1_DIALOGUES,
    investigation: MISSION_1_INVESTIGATION,
    surfaces: MISSION_1_SURFACES,
    challenge: MISSION_1_CHALLENGE,
    reflection: MISSION_1_REFLECTION,
  },
  'mission-2': {
    script: MISSION_2_SCRIPT,
    dialogues: MISSION_2_DIALOGUES,
    investigation: MISSION_2_INVESTIGATION,
    surfaces: MISSION_2_SURFACES,
    challenge: MISSION_2_CHALLENGE,
    reflection: MISSION_2_REFLECTION,
  },
};

/** Every playable mission's script, in order. */
export const MISSION_SCRIPTS: MissionScript[] = Object.values(CONTENT).map((c) => c.script);

const DIALOGUE_TREES: Record<string, DialogueTree> = Object.fromEntries(
  Object.values(CONTENT).flatMap((c) => c.dialogues.map((tree) => [tree.id, tree]))
);

const content = (missionId: string) => CONTENT[missionId] ?? CONTENT['mission-1'];

export const getScript = (missionId: string): MissionScript => content(missionId).script;
export const getChallenge = (missionId: string): MissionChallenge => content(missionId).challenge;
export const getReflection = (missionId: string): Reflection => content(missionId).reflection;

export function getSurface(missionId: string, id: string): EvidenceSurface | undefined {
  return content(missionId).surfaces.find((s) => s.id === id);
}

export function getDialogueTree(id: string): DialogueTree | undefined {
  return DIALOGUE_TREES[id];
}

export function getInvestigation(missionId: string): InvestigationData | undefined {
  return CONTENT[missionId]?.investigation;
}

export function getClue(missionId: string, clueId: string): Clue | undefined {
  return getInvestigation(missionId)?.clues.find((c) => c.id === clueId);
}

export function canDiscoverClue(clue: Clue, discovered: readonly string[]): boolean {
  if (discovered.includes(clue.id)) return false;
  return (clue.dependencies ?? []).every((dep) => discovered.includes(dep));
}

export function isInvestigationComplete(data: InvestigationData, discovered: readonly string[]): boolean {
  if (discovered.length < data.minimumCluesRequired) return false;
  return data.clues.filter((c) => c.requiredForCompletion).every((c) => discovered.includes(c.id));
}
