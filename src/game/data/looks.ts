/**
 * The character looks a player picks from (a quick pick, no sliders). Each is a rigged model with the
 * shared skeleton and clips (scripts/build-pack-villager.py / build-base-character.py).
 */
export interface Look {
  id: string;
  name: string;
  /** Rigged model; undefined = the plain base body. */
  model?: string;
  /** Standing height in world units (to the top of the hair). */
  height: number;
  /** Swatch colours for the UI: outfit, accent. */
  swatch: [string, string];
}

export const LOOKS: Look[] = [
  { id: 'farmer', name: 'Farmer', model: '/models/mika.glb', height: 1.42, swatch: ['#5b7fb8', '#e9c46a'] },
  { id: 'scholar', name: 'Scholar', model: '/models/dr-fe-chibi.glb', height: 1.42, swatch: ['#3a3640', '#f3efe8'] },
  { id: 'student', name: 'Student', model: '/models/sarah.glb', height: 1.32, swatch: ['#2f6b4f', '#d9b24a'] },
  { id: 'baker', name: 'Baker', model: '/models/villager-baker.glb', height: 1.4, swatch: ['#f1e6d2', '#c46b4b'] },
  { id: 'fisher', name: 'Fisher', model: '/models/villager-fisher.glb', height: 1.4, swatch: ['#e3b440', '#3f6f8f'] },
  { id: 'traveller', name: 'Traveller', model: '/models/villager-traveller.glb', height: 1.4, swatch: ['#7a5b3e', '#d8c7a2'] },
  { id: 'neighbour', name: 'Neighbour', model: '/models/villager-neighbour.glb', height: 1.4, swatch: ['#8a4f6e', '#f0d7c4'] },
  { id: 'plain', name: 'Clay', height: 1.4, swatch: ['#f2d2bf', '#e6a57e'] },
];

export function getLook(id: string | null | undefined): Look {
  return LOOKS.find((l) => l.id === id) ?? LOOKS[0];
}
