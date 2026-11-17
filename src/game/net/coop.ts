import { Client, type Room } from '@colyseus/sdk';
import type { Actor, FarmState, Intent } from '@/game/sim/types';
import { useSession, type NetPlayer } from '@/game/state/session-store';

/**
 * Co-op over the relay (relay/src/farm-room.ts, a thin Colyseus room). The host's browser runs the
 * farm sim; guests send intents, the host applies them and sends the accepted ones back out as
 * deltas, which every guest applies to its replica. Character positions go round at 10 Hz and are
 * not saved. No game logic here: the director handles every message.
 */

export interface NetHandlers {
  /** Host: a guest asks to do something. */
  onIntent(from: Actor, intent: Intent): void;
  /** Host: send this guest the whole farm. */
  onNeedSnapshot(sid: string): void;
  /** Guest: the farm as it is now. */
  onSnapshot(farm: FarmState): void;
  /** Guest: an intent the host accepted. */
  onDelta(actor: Actor, intent: Intent): void;
  /** Guest: the host's clock. */
  onClock(minute: number): void;
  /** Guest: the host went to bed (seconds until morning), or null when it is called off. */
  onCountdown(seconds: number | null): void;
  /** Guest: the host turned an intent down. */
  onRejected(reason: string): void;
  /** Someone joined or left. */
  onPlayers(players: NetPlayer[], before: NetPlayer[]): void;
  /** The session ended (host left, connection lost). */
  onEnded(message: string): void;
}

/** Remote characters' latest positions, read every frame by the scene (not React state). */
export const remotePositions = new Map<string, { x: number; z: number; f: number; s: number; t: number; emote?: { id: string; t: number } }>();

let handlers: NetHandlers | null = null;
let room: Room | null = null;
let lastHostMessage = 0;
let awayTimer: number | null = null;

export function setNetHandlers(h: NetHandlers) {
  handlers = h;
}

function relayUrl(): string {
  const env = process.env.NEXT_PUBLIC_RELAY_URL;
  if (env) return env;
  const secure = window.location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${window.location.hostname}:2567`;
}

/** A short code friends can type: no 0/O or 1/I/L. */
export function makeJoinCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export function joinLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('join', code);
  return url.toString();
}

export const isOnline = () => !!room;
export const mySid = () => room?.sessionId ?? null;

interface Me {
  playerId: string;
  name: string;
  look: string;
  token: string | null;
}

function wire(r: Room, host: boolean) {
  room = r;
  const session = useSession.getState;
  r.onMessage('players', (players: NetPlayer[]) => {
    const before = session().net.players;
    session().setNet({ players });
    for (const sid of [...remotePositions.keys()]) if (!players.some((p) => p.sid === sid)) remotePositions.delete(sid);
    handlers?.onPlayers(players, before);
  });
  r.onMessage('pos', (m: { sid: string; x: number; z: number; f: number; s: number }) => {
    const cur = remotePositions.get(m.sid);
    remotePositions.set(m.sid, { ...m, t: performance.now(), emote: cur?.emote });
  });
  r.onMessage('chat', (m: { name: string; text: string }) => session().pushChat(m.name, m.text));
  r.onMessage('emote', (m: { sid: string; emote: string }) => {
    const cur = remotePositions.get(m.sid);
    if (cur) cur.emote = { id: m.emote, t: performance.now() };
  });
  if (host) {
    r.onMessage('intent', (m: { from: Actor; intent: Intent }) => handlers?.onIntent(m.from, m.intent));
    r.onMessage('need-snapshot', (m: { sid: string }) => handlers?.onNeedSnapshot(m.sid));
  } else {
    const heard = () => {
      lastHostMessage = performance.now();
      if (session().net.hostAway) session().setNet({ hostAway: false });
    };
    r.onMessage('snapshot', (m: { farm: FarmState }) => {
      heard();
      handlers?.onSnapshot(m.farm);
    });
    r.onMessage('delta', (m: { actor: Actor; intent: Intent }) => {
      heard();
      handlers?.onDelta(m.actor, m.intent);
    });
    r.onMessage('clock', (m: { minute: number }) => {
      heard();
      handlers?.onClock(m.minute);
    });
    r.onMessage('countdown', (m: { seconds: number | null }) => handlers?.onCountdown(m.seconds));
    r.onMessage('rejected', (m: { reason: string }) => handlers?.onRejected(m.reason));
    r.onMessage('host-left', () => end('The host closed their farm.'));
    // No word from the host for 30 s (their tab asleep, or their connection gone): say so.
    lastHostMessage = performance.now();
    awayTimer = window.setInterval(() => {
      const away = performance.now() - lastHostMessage > 30_000;
      if (away !== session().net.hostAway) session().setNet({ hostAway: away });
    }, 2000);
  }
  r.onLeave((code: number) => {
    if (room === r) end(code === 1000 ? 'You left the farm.' : 'Lost the connection to the farm.');
  });
}

function end(message: string) {
  const was = room;
  room = null;
  if (awayTimer) window.clearInterval(awayTimer);
  awayTimer = null;
  remotePositions.clear();
  useSession.getState().setNet({ status: 'offline', code: null, players: [], hostAway: false });
  if (was) handlers?.onEnded(message);
}

/** Open this farm to friends: returns the join code. */
export async function hostSession(me: Me): Promise<string> {
  if (room) throw new Error('Already connected');
  const client = new Client(relayUrl());
  useSession.getState().setNet({ status: 'connecting' });
  // A clash with a code already in use is vanishingly rare; try a few.
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = makeJoinCode();
    try {
      const r = await client.create('farm', { code, role: 'host', ...me });
      wire(r, true);
      useSession.getState().setNet({ status: 'hosting', code });
      return code;
    } catch (err) {
      if (attempt === 3 || !String((err as Error).message).includes('code')) {
        useSession.getState().setNet({ status: 'offline' });
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}

/** Visit a friend's farm. */
export async function joinSession(code: string, me: Me): Promise<void> {
  if (room) throw new Error('Already connected');
  const client = new Client(relayUrl());
  useSession.getState().setNet({ status: 'connecting' });
  try {
    const r = await client.join('farm', { code: code.toUpperCase(), role: 'guest', ...me });
    wire(r, false);
    useSession.getState().setNet({ status: 'visiting', code: code.toUpperCase() });
  } catch (err) {
    useSession.getState().setNet({ status: 'offline' });
    throw err;
  }
}

export async function leaveSession() {
  const r = room;
  if (!r) return;
  end('');
  await r.leave(true).catch(() => undefined);
}

/* Sending ----------------------------------------------------------- */

const send = (type: string, msg: unknown) => room?.send(type, msg);

export const sendIntent = (intent: Intent) => send('intent', { intent });
export const sendDelta = (actor: Actor, intent: Intent) => send('delta', { actor, intent });
export const sendSnapshot = (to: string, farm: FarmState) => send('snapshot', { to, farm });
export const sendClock = (minute: number) => send('clock', { minute });
export const sendCountdown = (seconds: number | null) => send('countdown', { seconds });
export const sendRejected = (to: string, reason: string) => send('rejected', { to, reason });
export const sendChat = (text: string) => send('chat', { text: text.slice(0, 200) });
export const sendEmote = (emote: string) => send('emote', { emote });

let lastPos = 0;
/** At most 10 Hz. */
export function sendPosition(x: number, z: number, f: number, s: number) {
  if (!room) return;
  const now = performance.now();
  if (now - lastPos < 100) return;
  lastPos = now;
  send('pos', { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, f: Math.round(f * 100) / 100, s: Math.round(s * 10) / 10 });
}
