'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group } from 'three';
import { getLook, SHOP_SPOTS, shopRoom, TAVERN_PATRONS, TAVERN_SPOTS, tavernVisit } from '@/game/data';
import { SHOPS } from '@/game/sim/content';
import { groundHeight } from '@/game/engine/terrain';
import { remotePositions } from '@/game/net/coop';
import { useClock, useFarm } from '@/game/state/farm-store';
import { playerState } from '@/game/engine/world-state';
import { zoneAt } from '@/game/state/zones';
import { useProfile } from '@/game/state/profile-store';
import { useSession, type NetPlayer } from '@/game/state/session-store';
import { CharacterModel, type CharacterMotion } from './character-model';
import { Npc } from './npc';

/** Rosa and Bram mind their shops during opening hours, behind the counter inside (and go home after). */
export function Shopkeepers() {
  const minute = useClock((s) => Math.floor(s.minute / 10));
  const screen = useSession((s) => s.screen);
  return (
    <>
      {Object.entries(SHOP_SPOTS).map(([id, spot]) => {
        const shop = SHOPS[id];
        const open = minute * 10 >= shop.open && minute * 10 < shop.close;
        if (!open && screen === 'play') return null;
        const [x, z] = shopRoom(id).keeper;
        const face: [number, number, number] = [x, 0, z + 3];
        return (
          <Npc
            key={id}
            name={spot.tag}
            look={{ height: 1.4, model: spot.model }}
            target={[x, 0, z]}
            faceTarget={null}
            speaking={false}
            inConversation={false}
            showTag={screen === 'play'}
            fallbackFace={face}
          />
        );
      })}
    </>
  );
}

/**
 * Rosa and Bram's evening: after closing up they spend their own hours at the tavern's bar
 * (`tavernVisit`), alongside the villagers who walk there. Drawn only while they're in.
 */
export function TavernPatrons() {
  const minute = useClock((s) => Math.floor(s.minute / 5) * 5);
  const screen = useSession((s) => s.screen);
  const farm = useFarm((s) => s.farm);
  if (!farm || screen !== 'play') return null;
  const day = `${farm.year}-${farm.season}-${farm.day}`;
  const room = shopRoom('tavern');
  return (
    <>
      {TAVERN_PATRONS.map((p) => {
        const v = tavernVisit(p.id, day);
        if (minute < v.go || minute >= v.leave) return null;
        const spot = TAVERN_SPOTS[p.spot];
        const at: [number, number, number] = [room.cx + spot.at[0], 0, room.cz + spot.at[1]];
        return (
          <Npc
            key={p.id}
            name={p.name}
            look={{ height: 1.4, model: p.model }}
            target={at}
            faceTarget={null}
            speaking={false}
            inConversation={false}
            showTag
            fallbackFace={[room.cx + spot.look[0], 0, room.cz + spot.look[1]]}
          />
        );
      })}
    </>
  );
}

const EMOTES: Record<string, string> = { wave: '👋', heart: '💛', laugh: '😄', wow: '😮' };

function RemotePlayer({ player }: { player: NetPlayer }) {
  const group = useRef<Group>(null);
  const motion = useRef<CharacterMotion>({ speed: 0 });
  const st = useRef({ x: 0, z: 0, f: 0, init: false });
  const bubble = useRef<HTMLDivElement>(null);
  const look = getLook(player.look);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const p = remotePositions.get(player.sid);
    const g = group.current;
    if (!g) return;
    // The house's rooms are their own space: you see friends who are where you are, in or out.
    // Buildings' insides are their own spaces: you see the friends who are where you are.
    g.visible = !!p && zoneAt(p.x, p.z) === zoneAt(playerState.position.x, playerState.position.z);
    if (!p) return;
    const s = st.current;
    if (!s.init || Math.hypot(p.x - s.x, p.z - s.z) > 8) Object.assign(s, { x: p.x, z: p.z, f: p.f, init: true });
    // Positions arrive at 10 Hz: glide toward the latest one.
    const k = 1 - Math.exp(-dt * 12);
    s.x += (p.x - s.x) * k;
    s.z += (p.z - s.z) * k;
    let df = p.f - s.f;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    s.f += df * k;
    motion.current.speed = p.s;
    g.position.set(s.x, groundHeight(s.x, s.z), s.z);
    g.rotation.y = s.f;
    if (bubble.current) {
      const show = !!p.emote && performance.now() - p.emote.t < 2500;
      bubble.current.style.opacity = show ? '1' : '0';
      if (show) bubble.current.textContent = EMOTES[p.emote!.id] ?? '✨';
    }
  });
  return (
    <group ref={group} visible={false}>
      <CharacterModel height={look.height} model={look.model} motion={motion} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.36, 24]} />
        <meshBasicMaterial color="#000" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <Html position={[0, 1.85, 0]} center distanceFactor={9} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div className="flex flex-col items-center gap-1">
          <div ref={bubble} className="text-3xl transition-opacity duration-300" style={{ opacity: 0 }} />
          <div className="name-tag">
            {player.name}
            {player.host ? ' 🏡' : ''}
          </div>
        </div>
      </Html>
    </group>
  );
}

/** Friends on the farm with you. */
export function RemotePlayers() {
  const players = useSession((s) => s.net.players);
  const myId = useProfile((s) => s.playerId);
  return (
    <>
      {players
        .filter((p) => p.id !== myId)
        .map((p) => (
          <RemotePlayer key={p.sid} player={p} />
        ))}
    </>
  );
}
