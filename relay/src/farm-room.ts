import { Room, type Client } from 'colyseus';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

/**
 * One FarmRoom per hosted farm. It does not simulate anything: the host's browser runs the farm,
 * the room authenticates everyone, remembers who the host is, and forwards messages —
 * guests' intents to the host, the host's deltas, snapshots and clock to the guests, everyone's
 * positions, chat and emotes to everyone else.
 *
 * Auth: with SUPABASE_URL set, every connection must carry a valid Supabase JWT (checked against
 * the project's JWKS; set SUPABASE_JWT_SECRET instead for a legacy HS256 project) and the player
 * id is the token's subject. Without either, the client's own player id is trusted (development).
 */

interface Seat {
  sid: string;
  id: string;
  name: string;
  look: string;
  host: boolean;
}

interface JoinOptions {
  code?: string;
  role?: 'host' | 'guest';
  playerId?: string;
  name?: string;
  look?: string;
  token?: string | null;
}

/** Join codes in use on this relay. */
const codes = new Set<string>();

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const jwks = SUPABASE_URL ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`)) : null;

async function verify(token: string | null | undefined): Promise<JWTPayload | null> {
  if (!jwks && !JWT_SECRET) return null;
  if (!token) throw new Error('Sign in first');
  const key = JWT_SECRET ? new TextEncoder().encode(JWT_SECRET) : jwks!;
  const { payload } = await jwtVerify(token, key as Parameters<typeof jwtVerify>[1]);
  return payload;
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

/** Simple per-client limiter: at most `n` messages of a kind per second. */
class Limiter {
  private hits = new Map<string, number[]>();
  constructor(private n: number) {}
  allow(key: string): boolean {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < 1000);
    if (list.length >= this.n) return false;
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
  forget(key: string) {
    this.hits.delete(key);
  }
}

export class FarmRoom extends Room {
  maxClients = 4;
  /** Anyone flooding past this is disconnected by Colyseus. */
  maxMessagesPerSecond = 60;

  private code = '';
  private hostSid: string | null = null;
  private seats = new Map<string, Seat>();
  private intents = new Limiter(15);
  private chats = new Limiter(3);

  onCreate(options: JoinOptions) {
    const code = clean(options.code, 6).toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('A farm code is six letters or digits');
    if (codes.has(code)) throw new Error('That farm code is in use');
    codes.add(code);
    this.code = code;

    const host = (client: Client) => client.sessionId === this.hostSid;
    const hostClient = () => (this.hostSid ? this.clients.find((c) => c.sessionId === this.hostSid) : undefined);
    const seatOf = (client: Client) => this.seats.get(client.sessionId);

    // Guests ask; only the host's farm decides.
    this.onMessage('intent', (client, msg: { intent?: unknown }) => {
      const seat = seatOf(client);
      if (!seat || host(client) || !msg?.intent || !this.intents.allow(client.sessionId)) return;
      hostClient()?.send('intent', { from: { id: seat.id, name: seat.name }, intent: msg.intent });
    });

    // The host's accepted intents, snapshots and clock go out to the guests.
    this.onMessage('delta', (client, msg) => {
      if (host(client)) this.broadcast('delta', msg, { except: client });
    });
    this.onMessage('snapshot', (client, msg: { to?: string; farm?: unknown }) => {
      if (!host(client) || !msg?.to) return;
      this.clients.find((c) => c.sessionId === msg.to)?.send('snapshot', { farm: msg.farm });
    });
    this.onMessage('clock', (client, msg) => {
      if (host(client)) this.broadcast('clock', msg, { except: client });
    });
    this.onMessage('countdown', (client, msg) => {
      if (host(client)) this.broadcast('countdown', msg, { except: client });
    });
    this.onMessage('rejected', (client, msg: { to?: string; reason?: string }) => {
      if (!host(client)) return;
      const seat = [...this.seats.values()].find((s) => s.id === msg?.to);
      if (seat) this.clients.find((c) => c.sessionId === seat.sid)?.send('rejected', { reason: clean(msg.reason, 160) });
    });

    // Everyone: where they are, what they say, how they feel.
    this.onMessage('pos', (client, msg: { x?: number; z?: number; f?: number; s?: number }) => {
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      this.broadcast('pos', { sid: client.sessionId, x: num(msg?.x), z: num(msg?.z), f: num(msg?.f), s: num(msg?.s) }, { except: client });
    });
    this.onMessage('chat', (client, msg: { text?: string }) => {
      const seat = seatOf(client);
      const text = clean(msg?.text, 200);
      if (seat && text && this.chats.allow(client.sessionId)) this.broadcast('chat', { name: seat.name, text }, { except: client });
    });
    this.onMessage('emote', (client, msg: { emote?: string }) => {
      const emote = clean(msg?.emote, 12);
      if (emote && this.chats.allow(client.sessionId)) this.broadcast('emote', { sid: client.sessionId, emote }, { except: client });
    });
  }

  async onAuth(_client: Client, options: JoinOptions) {
    const payload = await verify(options.token);
    const id = payload?.sub ?? clean(options.playerId, 64);
    if (!id) throw new Error('Who are you?');
    return { id };
  }

  onJoin(client: Client, options: JoinOptions) {
    const id = (client.auth as { id: string }).id;
    const wantsHost = options.role === 'host';
    if (wantsHost && this.hostSid) throw new Error('This farm already has a host');
    if (!wantsHost && !this.hostSid) throw new Error('No farm with that code is open');
    const host = this.hostSid ? this.seats.get(this.hostSid) : undefined;
    if (!wantsHost && host?.id === id) throw new Error('This is your own farm');
    if (!wantsHost && [...this.seats.values()].some((s) => s.id === id)) throw new Error('You are already on this farm');
    const seat: Seat = { sid: client.sessionId, id, name: clean(options.name, 16) || 'Farmer', look: clean(options.look, 24), host: wantsHost };
    this.seats.set(client.sessionId, seat);
    if (wantsHost) this.hostSid = client.sessionId;
    this.sendPlayers();
    if (!wantsHost) this.clients.find((c) => c.sessionId === this.hostSid)?.send('need-snapshot', { sid: client.sessionId });
  }

  /** A dropped connection (not a goodbye) gets a short grace to come back. */
  async onDrop(client: Client) {
    await this.allowReconnection(client, 20);
  }

  onLeave(client: Client) {
    this.seats.delete(client.sessionId);
    this.intents.forget(client.sessionId);
    this.chats.forget(client.sessionId);
    if (client.sessionId === this.hostSid) {
      // The farm lives in the host's browser: without them the session ends.
      this.hostSid = null;
      this.broadcast('host-left', {});
      void this.disconnect();
      return;
    }
    this.sendPlayers();
  }

  onDispose() {
    codes.delete(this.code);
  }

  private sendPlayers() {
    this.broadcast('players', [...this.seats.values()]);
  }
}
