import { create } from 'zustand';

/**
 * Runtime (non-persistent) session state: which screen is up, what the player is near, open
 * panels, the hotbar, build mode, co-op status, chat and toasts.
 */

export type Screen = 'loading' | 'title' | 'setup' | 'entering' | 'play';

export type PanelId =
  | 'shop'
  | 'storage'
  | 'ship'
  | 'coop'
  | 'animals'
  | 'bag'
  | 'coop-play'
  | 'thanks'
  | 'morning'
  | 'pause'
  | 'help'
  | 'account';

export interface Nearby {
  id: string;
  label: string;
}

export interface NetPlayer {
  sid: string;
  id: string;
  name: string;
  look: string;
  host: boolean;
}

export interface ChatLine {
  key: number;
  name: string;
  text: string;
}

export interface BuildState {
  on: boolean;
  piece: string | null;
  rot: number;
  color: number | null;
  /** Pick up pieces instead of placing. */
  remove: boolean;
  hover: [number, number] | null;
}

export type NetStatus = 'offline' | 'connecting' | 'hosting' | 'visiting';

interface SessionState {
  screen: Screen;
  panel: PanelId | null;
  panelArg: string | null;
  nearby: Nearby | null;
  toast: { key: number; text: string } | null;
  /** Selected hotbar slot. */
  slot: number;
  /** The tile the hero is facing (play mode), or null. */
  target: [number, number] | null;
  build: BuildState;
  /** Seconds until the day ends (co-op countdown after the host goes to bed). */
  countdown: number | null;
  /** Screen fade (sleeping, passing out). */
  fade: string | null;
  /** Inside the villa: the indoor camera frames the room, the roof is off and the walls cut away. */
  indoors: boolean;
  /** Door transition card, shown while the hero goes in or out. */
  transition: { destination: string } | null;
  /** DEV: the day clock is frozen. */
  frozen: boolean;
  net: { status: NetStatus; code: string | null; players: NetPlayer[]; hostAway: boolean };
  chat: ChatLine[];
  chatOpen: boolean;
  /** Guests whose thank-you is waiting for the host: player ids. */
  thanks: string[];

  setScreen: (screen: Screen) => void;
  openPanel: (panel: PanelId, arg?: string) => void;
  closePanel: () => void;
  setNearby: (n: Nearby | null) => void;
  showToast: (text: string) => void;
  setSlot: (slot: number) => void;
  setTarget: (t: [number, number] | null) => void;
  setBuild: (b: Partial<BuildState>) => void;
  setCountdown: (s: number | null) => void;
  setFade: (text: string | null) => void;
  setIndoors: (indoors: boolean) => void;
  setTransition: (t: { destination: string } | null) => void;
  setFrozen: (frozen: boolean) => void;
  setNet: (n: Partial<SessionState['net']>) => void;
  pushChat: (name: string, text: string) => void;
  setChatOpen: (open: boolean) => void;
  setThanks: (ids: string[]) => void;
}

let key = 0;

export const useSession = create<SessionState>()((set, get) => ({
  screen: 'loading',
  panel: null,
  panelArg: null,
  nearby: null,
  toast: null,
  slot: 0,
  target: null,
  build: { on: false, piece: null, rot: 0, color: null, remove: false, hover: null },
  countdown: null,
  fade: null,
  indoors: false,
  transition: null,
  frozen: false,
  net: { status: 'offline', code: null, players: [], hostAway: false },
  chat: [],
  chatOpen: false,
  thanks: [],

  setScreen: (screen) => set({ screen }),
  openPanel: (panel, arg) => set({ panel, panelArg: arg ?? null }),
  closePanel: () => set({ panel: null, panelArg: null }),
  setNearby: (nearby) => {
    const cur = get().nearby;
    if (cur?.id !== nearby?.id || cur?.label !== nearby?.label) set({ nearby });
  },
  showToast: (text) => set({ toast: { key: ++key, text } }),
  setSlot: (slot) => set({ slot }),
  setTarget: (target) => {
    const cur = get().target;
    if (cur?.[0] !== target?.[0] || cur?.[1] !== target?.[1]) set({ target });
  },
  setBuild: (b) => set({ build: { ...get().build, ...b } }),
  setCountdown: (countdown) => set({ countdown }),
  setFade: (fade) => set({ fade }),
  setIndoors: (indoors) => set({ indoors }),
  setTransition: (transition) => set({ transition }),
  setFrozen: (frozen) => set({ frozen }),
  setNet: (n) => set({ net: { ...get().net, ...n } }),
  pushChat: (name, text) => set({ chat: [...get().chat.slice(-30), { key: ++key, name, text }] }),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  setThanks: (thanks) => set({ thanks }),
}));

/** The hero can't walk while a panel, build mode, chat, a fade or a door transition is up. */
export function isInputLocked(s = useSession.getState()): boolean {
  return s.screen !== 'play' || !!s.panel || s.build.on || s.chatOpen || !!s.fade || !!s.transition;
}
