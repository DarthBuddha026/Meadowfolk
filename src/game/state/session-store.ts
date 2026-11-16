import { create } from 'zustand';
import { getChallenge, type MapId } from '@/game/data';

/**
 * Runtime (non-persistent) session state: which screen is up, what the
 * player is near, open panels, the active conversation, and the simulated
 * hardware state of the current mission's device.
 */

export type Screen = 'loading' | 'title' | 'hero-setup' | 'entering' | 'play';

/** Evidence panels use their interactable id; these are the others. */
export type PanelId = 'reflection' | 'journal' | 'help' | 'pause' | 'complete' | 'locked-signal' | (string & {});

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

export interface MentorLine {
  key: number;
  text: string;
  speaker: string;
}

interface SessionState {
  screen: Screen;
  /** Which map the hero is on. */
  map: MapId;
  /** Door transition card, shown while the map swaps. */
  transition: { destination: string } | null;
  dialogue: { treeId: string; nodeId: string } | null;
  dialogueFlags: string[];
  panel: PanelId | null;
  panelArg: string | null;
  nearbyId: string | null;
  mentorLine: MentorLine | null;
  /** Evidence item ids the player has examined (for showing notes). */
  examined: string[];
  /** The sketch fields as edited on screen. */
  sketch: Record<string, string>;
  upload: { status: UploadStatus; lines: string[] };
  /** The fields of the sketch running on the device right now. */
  running: Record<string, string>;
  /** performance.now() when the running sketch booted (0 = it was already running). */
  bootedAt: number;
  /** Camera shot override while not in dialogue/panels (e.g. watching the result). */
  shot: string | null;
  gemCollected: boolean;
  /** True while the dialogue typewriter is still revealing text. */
  typing: boolean;
  /** Incremented to ask the typewriter to finish instantly. */
  skipTypingKey: number;

  setScreen: (screen: Screen) => void;
  setMap: (map: MapId) => void;
  setTransition: (transition: { destination: string } | null) => void;
  openPanel: (panel: PanelId, arg?: string) => void;
  closePanel: () => void;
  setNearby: (id: string | null) => void;
  say: (text: string, speaker?: string) => void;
  clearMentorLine: () => void;
  markExamined: (id: string) => void;
  setSketchField: (field: string, value: string) => void;
  setUpload: (upload: { status: UploadStatus; lines: string[] }) => void;
  bootSketch: (fields: Record<string, string>) => void;
  setShot: (shot: string | null) => void;
  resetMissionSession: (missionId: string) => void;
}

let mentorKey = 0;

const missionSessionDefaults = (missionId: string) => {
  const { fields } = getChallenge(missionId);
  return {
    dialogue: null,
    dialogueFlags: [] as string[],
    panel: null,
    panelArg: null,
    mentorLine: null,
    examined: [] as string[],
    sketch: { ...fields },
    upload: { status: 'idle' as UploadStatus, lines: [] as string[] },
    running: { ...fields },
    bootedAt: 0,
    shot: null,
    gemCollected: false,
  };
};

export const useSession = create<SessionState>()((set, get) => ({
  screen: 'loading',
  map: 'junction',
  transition: null,
  nearbyId: null,
  typing: false,
  skipTypingKey: 0,
  ...missionSessionDefaults('mission-1'),

  setScreen: (screen) => set({ screen }),
  setMap: (map) => set({ map, nearbyId: null }),
  setTransition: (transition) => set({ transition }),
  openPanel: (panel, arg) => set({ panel, panelArg: arg ?? null }),
  closePanel: () => set({ panel: null, panelArg: null }),
  setNearby: (nearbyId) => {
    if (get().nearbyId !== nearbyId) set({ nearbyId });
  },
  say: (text, speaker = 'Captain T') => set({ mentorLine: { key: ++mentorKey, text, speaker } }),
  clearMentorLine: () => set({ mentorLine: null }),
  markExamined: (id) => {
    if (!get().examined.includes(id)) set({ examined: [...get().examined, id] });
  },
  setSketchField: (field, value) => set({ sketch: { ...get().sketch, [field]: value } }),
  setUpload: (upload) => set({ upload }),
  bootSketch: (fields) => set({ running: { ...fields }, bootedAt: performance.now() }),
  setShot: (shot) => set({ shot }),
  resetMissionSession: (missionId) => set(missionSessionDefaults(missionId)),
}));
