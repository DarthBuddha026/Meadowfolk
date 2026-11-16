import type { RoleId } from './types';

/**
 * The fixed built-in hero roster (GAME_CONCEPT §5.2).
 * Specializations follow the canonical mapping in the concept doc.
 * In the 3D world every hero is the plain shared base body (see character-model.tsx)
 * unless it has its own `model`; the palette only colours the hero swatches in the UI.
 */

export interface HeroPalette {
  outfit: string;
  accent: string;
  pants: string;
  skin: string;
  hair: string;
}

export interface Hero {
  id: string;
  name: string;
  specialization: string;
  philosophy: string;
  blurb: string;
  palette: HeroPalette;
  /** Standing height in world units (default 1.4). */
  height?: number;
  /** Its own rigged model (same skeleton and clips as the base body), e.g. scripts/build-dr-fe.py. */
  model?: string;
  /** Not playable yet: shown on the hero picker, locked. */
  locked?: boolean;
}

export const HEROES: Hero[] = [
  {
    id: 'dr-fe',
    name: 'Dr Fe',
    specialization: 'Innovation & Rapid Prototyping',
    philosophy: 'Build to learn.',
    blurb: 'A restless inventor whose workshop tower is a Junction landmark.',
    palette: { outfit: '#f3efe8', accent: '#4b4552', pants: '#4b4552', skin: '#f2d2bf', hair: '#e6e2dc' },
    // In the townsfolk's style (scripts/build-pack-villager.py dr-fe); `height` is to the top of her hair.
    // Her detailed model, /models/dr-fe.glb (scripts/build-dr-fe.py), is kept: height 1.3 (head height) with it.
    height: 1.42,
    model: '/models/dr-fe-chibi.glb',
  },
  {
    id: 'tala',
    locked: true,
    name: 'Tala',
    specialization: 'Systems Architecture & Design',
    philosophy: 'See the system before you touch the part.',
    blurb: "Junction's quiet cartographer. Draws the whole system twice.",
    palette: { outfit: '#2f4a8a', accent: '#f4c542', pants: '#1f2340', skin: '#b97a55', hair: '#16121f' },
  },
  {
    id: 'mang-tino',
    locked: true,
    name: 'Mang Tino',
    specialization: 'Algorithm Optimization & Performance',
    philosophy: 'Every line matters; every cycle counts.',
    blurb: 'A veteran repair master. Has fixed more machines than most will own.',
    palette: { outfit: '#6b7a3a', accent: '#e8dcc0', pants: '#4a3b2a', skin: '#a8714e', hair: '#d8d4cc' },
  },
  {
    id: 'coach-j',
    locked: true,
    name: 'Coach J',
    specialization: 'Collaborative Engineering & Leadership',
    philosophy: 'No one debugs alone.',
    blurb: 'Former robotics captain who assembles teams like circuits.',
    palette: { outfit: '#c93a4a', accent: '#ffffff', pants: '#26324a', skin: '#8d5a3b', hair: '#1b1414' },
  },
  {
    id: 'bronze',
    locked: true,
    name: 'Bronze',
    specialization: 'Technical Mentorship & Knowledge Transfer',
    philosophy: 'Knowledge kept is knowledge halved.',
    blurb: 'The hero other heroes learned from.',
    palette: { outfit: '#a8692f', accent: '#f2e1c2', pants: '#3a2e28', skin: '#d8a27c', hair: '#5a3a22' },
  },
  {
    id: 'capt-veil',
    locked: true,
    name: 'Capt Veil',
    specialization: 'Adaptive Learning & Growth Mindset',
    philosophy: 'Every failure is data for the next iteration.',
    blurb: 'Explorer of unfamiliar systems. Has been a beginner more than anyone.',
    palette: { outfit: '#5b3f9a', accent: '#3fd1c2', pants: '#22213a', skin: '#e0b08c', hair: '#2b2f5a' },
  },
];

export const ROLES: { id: RoleId; label: string }[] = [
  { id: 'electronics', label: 'Electronics Engineer' },
  { id: 'robotics', label: 'Robotics Engineer' },
  { id: 'software', label: 'Software Engineer' },
  { id: 'computer', label: 'Computer Engineer' },
  { id: 'aerospace', label: 'Aerospace Engineer' },
  { id: 'ai', label: 'AI Engineer' },
];

export function getHero(id: string | null | undefined): Hero {
  // A locked hero (from a save made before it was locked) plays as the first hero.
  return HEROES.find((h) => h.id === id && !h.locked) ?? HEROES[0];
}

export function getRoleLabel(id: RoleId | null | undefined): string {
  return ROLES.find((r) => r.id === id)?.label ?? 'Engineer';
}
