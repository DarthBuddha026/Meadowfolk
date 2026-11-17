import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { migrateFarm } from '@/game/sim/sim';
import type { Bag, FarmState } from '@/game/sim/types';
import type { ProfileData } from './profile-store';

/**
 * Accounts and saves. With `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set, every
 * player gets a real Supabase account (anonymous until they attach an email), their profile and
 * farm are saved to Postgres (schema: supabase/schema.sql), and thank-you tips travel through the
 * `gifts` table. Without them the game runs on this browser's localStorage alone — fine for
 * development, but a cleared browser loses the farm.
 *
 * localStorage is always written too, as a cache; on load the newer copy wins.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const cloudEnabled = !!(URL && KEY);

let client: SupabaseClient | null = null;
function sb(): SupabaseClient | null {
  if (!cloudEnabled) return null;
  client ??= createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export interface Account {
  id: string;
  email: string | null;
  anonymous: boolean;
}

/** Sign in (restoring the session, or creating an anonymous account). Null when offline. */
export async function signIn(): Promise<Account | null> {
  const s = sb();
  if (!s) return null;
  try {
    let { data } = await s.auth.getSession();
    if (!data.session) {
      const res = await s.auth.signInAnonymously();
      if (res.error) throw res.error;
      data = { session: res.data.session };
    }
    const user = data.session?.user;
    if (!user) return null;
    return { id: user.id, email: user.email ?? null, anonymous: !!user.is_anonymous };
  } catch (err) {
    console.warn('[Meadowfolk] cloud sign-in failed; playing on local saves', err);
    return null;
  }
}

/** The JWT the relay checks, or null offline. */
export async function accessToken(): Promise<string | null> {
  const s = sb();
  if (!s) return null;
  const { data } = await s.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Keep this account across devices: Supabase emails a confirmation link. */
export async function attachEmail(email: string): Promise<string | null> {
  const s = sb();
  if (!s) return 'Cloud saves are not configured on this server.';
  const { error } = await s.auth.updateUser({ email });
  return error ? error.message : null;
}

/* ------------------------------------------------------------------ */
/* Local cache                                                         */
/* ------------------------------------------------------------------ */

interface Stamped<T> {
  savedAt: number;
  data: T;
}

const FARM_KEY = (owner: string) => `meadowfolk-farm-${owner}`;

function readLocal<T>(key: string): Stamped<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Stamped<T>) : null;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* storage full or blocked: the cloud copy (if any) still saves */
  }
}

/* ------------------------------------------------------------------ */
/* Farms                                                               */
/* ------------------------------------------------------------------ */

export async function loadFarm(owner: string): Promise<FarmState | null> {
  const local = readLocal<FarmState>(FARM_KEY(owner));
  const s = sb();
  let remote: Stamped<FarmState> | null = null;
  if (s) {
    const { data, error } = await s.from('farms').select('data, updated_at').eq('owner', owner).maybeSingle();
    if (error) console.warn('[Meadowfolk] farm load failed', error.message);
    if (data) remote = { savedAt: Date.parse(data.updated_at as string), data: data.data as FarmState };
  }
  const best = !remote ? local : !local ? remote : remote.savedAt >= local.savedAt ? remote : local;
  return best ? migrateFarm(best.data) : null;
}

/** Save the farm: the cloud keeps the current save plus the last three (a trigger, see schema.sql). */
export async function saveFarm(farm: FarmState): Promise<void> {
  writeLocal(FARM_KEY(farm.owner), farm);
  const s = sb();
  if (!s) return;
  const { error } = await s
    .from('farms')
    .upsert({ owner: farm.owner, data: farm, version: farm.version, updated_at: new Date().toISOString() }, { onConflict: 'owner' });
  if (error) console.warn('[Meadowfolk] farm save failed', error.message);
}

export function deleteLocalFarm(owner: string) {
  try {
    localStorage.removeItem(FARM_KEY(owner));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export async function loadProfile(id: string): Promise<ProfileData | null> {
  const s = sb();
  if (!s) return null;
  const { data, error } = await s.from('profiles').select('data').eq('id', id).maybeSingle();
  if (error) console.warn('[Meadowfolk] profile load failed', error.message);
  return (data?.data as ProfileData) ?? null;
}

export async function saveProfile(profile: ProfileData): Promise<void> {
  const s = sb();
  if (!s || !profile.playerId) return;
  const { error } = await s.from('profiles').upsert({ id: profile.playerId, data: profile, updated_at: new Date().toISOString() });
  if (error) console.warn('[Meadowfolk] profile save failed', error.message);
}

/* ------------------------------------------------------------------ */
/* Thank-you gifts                                                     */
/* ------------------------------------------------------------------ */

export interface GiftPayload {
  from: string;
  gold: number;
  items: Bag;
}

/** Leave a tip for a guest who has already gone home; they claim it next time they play. */
export async function sendGift(recipient: string, payload: GiftPayload): Promise<boolean> {
  const s = sb();
  if (!s) return false;
  const { data } = await s.auth.getUser();
  const { error } = await s.from('gifts').insert({ sender: data.user?.id, recipient, payload });
  if (error) console.warn('[Meadowfolk] gift failed', error.message);
  return !error;
}

/** Claim every unclaimed gift addressed to this player. */
export async function claimGifts(): Promise<GiftPayload[]> {
  const s = sb();
  if (!s) return [];
  const { data: user } = await s.auth.getUser();
  if (!user.user) return [];
  // Claim and read in one statement, so a gift is only ever delivered once.
  const { data, error } = await s
    .from('gifts')
    .update({ claimed_at: new Date().toISOString() })
    .eq('recipient', user.user.id)
    .is('claimed_at', null)
    .select('payload');
  if (error || !data?.length) return [];
  return data.map((g) => g.payload as GiftPayload);
}
