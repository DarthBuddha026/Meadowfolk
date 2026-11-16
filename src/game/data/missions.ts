import type { Vec3 } from './types';
import { SIGNAL_POSITIONS } from './world-layout';

/**
 * Season One, *Project Bantay* (see STORYBOARD.md) — the help signals placed in
 * Junction. Missions open in order: each needs the previous mission's Insight Gem.
 * Only `playable` missions have content; the rest are visible-but-locked signals.
 */
export interface Mission {
  id: string;
  title: string;
  shortName: string;
  helpSeekerName: string;
  /** Lead with the person and the symptom — never the topic. */
  symptom: string;
  /** Where the signal is, for objective lines ("southwest of the plaza"). */
  whereabouts: string;
  playable: boolean;
  /** Where the help signal beacon stands in the 3D world. */
  signalPosition: Vec3;
  order: number;
}

export const MISSIONS: Mission[] = [
  {
    id: 'mission-1',
    title: 'MISSION: NO SIGNAL',
    shortName: 'NO SIGNAL',
    helpSeekerName: 'Sarah',
    symptom: "Sarah's river-alert display won't go online.",
    whereabouts: 'the Circuit Club house, east of the plaza',
    playable: true,
    signalPosition: SIGNAL_POSITIONS['mission-1'],
    order: 1,
  },
  {
    id: 'mission-2',
    title: "MISSION: THE PUMP THAT WON'T QUIT",
    shortName: "THE PUMP THAT WON'T QUIT",
    helpSeekerName: 'Mika',
    symptom: "Mika's greenhouse is flooding — the pump runs when it's supposed to be off.",
    whereabouts: "Mika's greenhouse, southwest of the plaza",
    playable: true,
    signalPosition: SIGNAL_POSITIONS['mission-2'],
    order: 2,
  },
  {
    id: 'mission-3',
    title: 'MISSION: WORKS UNTIL ONLINE',
    shortName: 'WORKS UNTIL ONLINE',
    helpSeekerName: 'Jordan',
    symptom: "Jordan's river sensor reads perfectly on the bench — and nothing at all once it's online.",
    whereabouts: "Jordan's house, on the north bank",
    playable: false,
    signalPosition: SIGNAL_POSITIONS['mission-3'],
    order: 3,
  },
  {
    id: 'mission-4',
    title: 'MISSION: THE SILENT DASHBOARD',
    shortName: 'THE SILENT DASHBOARD',
    helpSeekerName: 'Alex',
    symptom: 'The dashboard says the river node is online — but the level never moves.',
    whereabouts: 'the Junction Node',
    playable: false,
    signalPosition: SIGNAL_POSITIONS['mission-4'],
    order: 4,
  },
  {
    id: 'mission-5',
    title: 'MISSION: MIDNIGHT LIGHTS',
    shortName: 'MIDNIGHT LIGHTS',
    helpSeekerName: 'Mang Ben',
    symptom: "Mang Ben's flood-alert sign turns on at 2 AM and off at 2 PM.",
    whereabouts: 'the bakery, southeast of the plaza',
    playable: false,
    signalPosition: SIGNAL_POSITIONS['mission-5'],
    order: 5,
  },
  {
    id: 'mission-6',
    title: 'MISSION: STORM NIGHT',
    shortName: 'STORM NIGHT',
    helpSeekerName: 'Taylor',
    symptom: "The storm's here. The river node went silent — and it's still silent.",
    whereabouts: 'the west path',
    playable: false,
    signalPosition: SIGNAL_POSITIONS['mission-6'],
    order: 6,
  },
];

export function getMissionById(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

/**
 * A mission's signal is open once it has content and the previous mission's gem is earned —
 * or, with `allOpen` (the DEV hero, see `isDevHero`), as soon as it has content.
 */
export function isMissionOpen(id: string, gems: readonly string[], allOpen = false): boolean {
  const i = MISSIONS.findIndex((m) => m.id === id);
  if (i < 0 || !MISSIONS[i].playable) return false;
  return allOpen || i === 0 || gems.includes(MISSIONS[i - 1].id);
}

/** The mission to play next: the first open one without a gem, else the last open one (replay). */
export function nextMissionId(gems: readonly string[], allOpen = false): string {
  const open = MISSIONS.filter((m) => isMissionOpen(m.id, gems, allOpen));
  return (open.find((m) => !gems.includes(m.id)) ?? open[open.length - 1]).id;
}

/**
 * The north bank (past the ridge's cutting, see `NORTH_GATE`) opens once Missions 1 and 2 are done —
 * Mission 2's gem needs Mission 1's — or straight away for the DEV hero (`allOpen`).
 */
export function isNorthBankOpen(gems: readonly string[], allOpen = false): boolean {
  return allOpen || gems.includes('mission-2');
}

/** The mission after this one, if its signal is open. */
export function followingMission(id: string, gems: readonly string[], allOpen = false): Mission | undefined {
  const next = MISSIONS[MISSIONS.findIndex((m) => m.id === id) + 1];
  return next && isMissionOpen(next.id, gems, allOpen) ? next : undefined;
}
