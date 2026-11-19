'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
type Physics = ReturnType<typeof useRapier>;
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat';
import type { Group } from 'three';
import { PLAYER_SPAWN, RIDGE, shopRoom, TAVERN_DOOR, TAVERN_SPOTS, tavernVisit, VILLAGERS, WANDER, type VillagerPlan } from '@/game/data';
import { distToPaths, groundHeight, isOpenGround } from '@/game/engine/terrain';
import { playerState } from '@/game/engine/world-state';
import { getFarm, useClock } from '@/game/state/farm-store';
import { useSession } from '@/game/state/session-store';
import { zoneAt } from '@/game/state/zones';
import { CharacterModel, type CharacterMotion } from './character-model';

/**
 * Junction's villagers: passers-by who circulate the town. Each picks a destination — one of the
 * network's end points (a house door, the club, the grocery, a road leaving the map), as far as can
 * be from the others' destinations and from where the others are, so they spread out — walks the
 * shortest way there along the roads (`WANDER`), lingers, sometimes strolls a little way onto the
 * grass nearby, and sets off for the next one.
 * Purely ambient — no tag, no interact point. They stop and turn to the hero
 * when the hero walks up (no gesture), and their collider keeps the hero from
 * walking through them. Each moves through a character controller, so it slides
 * along whatever it meets (benches, lanterns, the Node, each other) instead of
 * passing through; they keep to the right of a path, so two walking towards each
 * other pass. A stretch found blocked (by a fixed obstacle, or by being held up) is
 * avoided for a while and the way there is planned round it. Nobody heads onto the
 * north bank until its gate is up.
 *
 * In the evening the adults go to the tavern: each sets off at its own time between 6 and 7 PM
 * (`tavernVisit`, random but fixed for the day), walks to the door, and is inside — standing at a
 * spot of its own (`TAVERN_SPOTS`) — until its own time to leave, between 8:45 and 10 PM. Like friends, a
 * villager is only seen from the same space (outdoors, or inside the tavern).
 */

const BODY_Y = 0.65;

function nearestNode([x, z]: [number, number], ok: (i: number) => boolean = () => true) {
  let best = -1;
  WANDER.nodes.forEach(([nx, nz], i) => {
    if (ok(i) && (best < 0 || Math.hypot(nx - x, nz - z) < Math.hypot(WANDER.nodes[best][0] - x, WANDER.nodes[best][1] - z))) best = i;
  });
  return Math.max(best, 0);
}

/** Villagers never start this close to where the hero appears, so nobody stands in their way at the start. */
const SPAWN_CLEAR = 5;
const clearOfSpawn = (i: number) => Math.hypot(WANDER.nodes[i][0] - PLAYER_SPAWN[0], WANDER.nodes[i][1] - PLAYER_SPAWN[2]) > SPAWN_CLEAR;
/** How close the hero has to be before a villager stops for them. */
const STOP = 1.6;
/** How long a villager stops for the hero before carrying on (until the hero walks off and comes back). */
const GREET = 2.5;
/** How far right of a path's centre line villagers walk. */
const LANE = 0.38;
/** Chance, on reaching a destination, of a short stroll onto the grass nearby; and how far it goes. */
const STROLL = 0.5;
const STROLL_RANGE: [number, number] = [2, 4];
/** How far a villager's presence counts as crowding (they spread out to keep apart). */
const CROWD = 5;

/** Where every villager is and is heading, so each can pick destinations away from the others. */
const crowd = new Map<string, { x: number; z: number; tx: number; tz: number }>();

/** How crowded a spot is with the other villagers (and where they are heading). */
function crowding(id: string, x: number, z: number) {
  let c = 0;
  for (const [other, p] of crowd) {
    if (other === id) continue;
    c += Math.exp(-Math.hypot(p.x - x, p.z - z) / CROWD) + Math.exp(-Math.hypot(p.tx - x, p.tz - z) / CROWD);
  }
  return c;
}

/**
 * Whether a villager could walk straight from (x, z) to (tx, tz): three rays at waist height (the
 * middle and either shoulder) find nothing fixed in the way — a tree, bench, lantern, wall or
 * the Node. Other characters don't count; the controller steps round them.
 */
function clearWay({ world, rapier }: Physics, x: number, z: number, tx: number, tz: number, width = 0.28) {
  // Stops short of the end: a way may end against a wall (a doorstep).
  const len = Math.hypot(tx - x, tz - z) - 0.6;
  if (len < 0.05) return true;
  const dx = (tx - x) / (len + 0.6);
  const dz = (tz - z) / (len + 0.6);
  const flags = rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC;
  for (const side of [-width, 0, width]) {
    const ox = x + dz * side + dx * 0.15;
    const oz = z - dx * side + dz * 0.15;
    const ray = new rapier.Ray({ x: ox, y: 0.4, z: oz }, { x: dx, y: 0, z: dz });
    if (world.castRay(ray, len, true, flags)) return false;
  }
  return true;
}

/** How far right of the centre line to walk from node a to node b: on a road LANE; on the narrow stepping stones, down the middle. */
function laneOf(a: number, b: number) {
  const [ax, az] = WANDER.nodes[a];
  const [bx, bz] = WANDER.nodes[b];
  return distToPaths((ax + bx) / 2, (az + bz) / 2) < 0.6 ? LANE : 0;
}

/** A spot on open grass within reach, clear of obstacles on the way, as far from the others as can be found. */
function strollSpot(phys: Physics, id: string, x: number, z: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestCrowd = Infinity;
  for (let tries = 0; tries < 12; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = STROLL_RANGE[0] + Math.random() * (STROLL_RANGE[1] - STROLL_RANGE[0]);
    const gx = x + Math.sin(a) * d;
    const gz = z + Math.cos(a) * d;
    let ok = true;
    for (let k = 1; k <= 8 && ok; k++) ok = isOpenGround(x + (gx - x) * (k / 8), z + (gz - z) * (k / 8));
    if (!ok || !clearWay(phys, x, z, gx, gz)) continue;
    const c = crowding(id, gx, gz);
    if (c < bestCrowd) [best, bestCrowd] = [[gx, gz], c];
  }
  return best;
}

/** The network's end points (house doors, the club, the grocery, roads off the map): where villagers go. */
const DESTS = WANDER.links.flatMap((ways, i) => (ways.length === 1 ? [i] : []));
/** Network points on the north bank, past the ridge. */
const onNorthBank = (i: number) => WANDER.nodes[i][1] < RIDGE.z[1] - 0.5;
/** The farm past the ridge is private: villagers keep to the town (anyone already there may come back). */
const isNorthGateUp = () => false;
const intoClosedNorth = (a: number, b: number) => !onNorthBank(a) && onNorthBank(b) && !isNorthGateUp();
/** Each villager's current destination (no two share one). */
const claims = new Map<string, number>();

/** The next destination: unclaimed, not where it is, and as far as possible from the others (and their destinations). */
function chooseDest(id: string, here: number, last: number) {
  const [hx, hz] = WANDER.nodes[here];
  const taken = new Set([...claims].filter(([other]) => other !== id).map(([, d]) => d));
  let best = here;
  let bestScore = -Infinity;
  const northUp = isNorthGateUp();
  for (const d of DESTS) {
    if (d === here || d === last || taken.has(d) || (onNorthBank(d) && !northUp)) continue;
    const [dx, dz] = WANDER.nodes[d];
    // Away from the others counts most; a decent walk from here a little; a pinch of chance breaks ties.
    const score = -crowding(id, dx, dz) * 4 + Math.min(Math.hypot(dx - hx, dz - hz), 20) * 0.05 + Math.random() * 0.3;
    if (score > bestScore) [best, bestScore] = [d, score];
  }
  claims.set(id, best);
  return best;
}

/** The shortest way along the roads from one node to another (the nodes after `from`), not using `blocked` stretches; null if none. */
function route(from: number, to: number, blocked: (a: number, b: number) => boolean): number[] | null {
  const dist = WANDER.nodes.map(() => Infinity);
  const prev = WANDER.nodes.map(() => -1);
  const done = new Set<number>();
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < dist.length; i++) if (!done.has(i) && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === to) break;
    done.add(u);
    for (const v of WANDER.links[u]) {
      if (blocked(u, v)) continue;
      const [ux, uz] = WANDER.nodes[u];
      const [vx, vz] = WANDER.nodes[v];
      const nd = dist[u] + Math.hypot(vx - ux, vz - uz);
      if (nd < dist[v]) [dist[v], prev[v]] = [nd, u];
    }
  }
  if (dist[to] === Infinity) return null;
  const path: number[] = [];
  for (let n = to; n !== from; n = prev[n]) path.unshift(n);
  return path;
}

/** The network point at the tavern's door. */
const TAVERN_NODE = nearestNode(TAVERN_DOOR);
/** Adults, in order: each takes the tavern spot of its rank. */
const ADULTS = VILLAGERS.filter((v) => (v.scale ?? 1) >= 1).map((v) => v.id);

/** Held up (moving under a quarter of its pace) this long, a villager turns back. */
const STUCK = 0.8;
/** A way a villager got held up on is avoided this long (seconds). */
const AVOID = 45;

function Villager({ plan, index }: { plan: VillagerPlan; index: number }) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const phys = useRapier();
  const { world, rapier } = phys;
  const controller = useRef<KinematicCharacterController | null>(null);
  useEffect(() => {
    const c = world.createCharacterController(0.02);
    c.setSlideEnabled(true);
    controller.current = c;
    return () => {
      world.removeCharacterController(c);
      controller.current = null;
    };
  }, [world]);
  const root = useRef<Group>(null);
  const shell = useRef<Group>(null);
  const motion = useRef<CharacterMotion>({ speed: 0 });
  const seat = ADULTS.indexOf(plan.id);
  // Start on the network point nearest the villager's start.
  const first = nearestNode(plan.start, clearOfSpawn);
  const [x0, z0] = WANDER.nodes[first];
  // The node just left, the one being walked to, and an idle timer.
  const walk = useRef({ x: x0, z: z0, from: first, to: first, wait: 1 + index * 0.7, rot: 0, look: 0, speed: 0, stuck: 0, stroll: null as [number, number] | null, avoid: new Map<string, number>(),
    dest: first, path: [] as number[], back: false, met: 0, lift: groundHeight(x0, z0), inside: false });
  useEffect(
    () => () => {
      crowd.delete(plan.id);
      claims.delete(plan.id);
    },
    [plan.id],
  );

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const w = walk.current;
    const t = state.clock.elapsedTime;
    const px = playerState.position.x - w.x;
    const pz = playerState.position.z - w.z;
    const session = useSession.getState();
    // The hero walking up: stop and look a moment (GREET seconds), then carry on past them.
    const heroDist = Math.hypot(px, pz);
    if (heroDist > STOP + 1) w.met = 0;
    const near = heroDist < STOP && w.met < GREET;
    if (near) w.met += dt;
    // Everyone holds still before the game proper (title, character setup), so the town only comes
    // to life once the player has arrived.
    const onStage = session.screen !== 'play';
    // The tavern evening: an adult's own hours there today.
    const farm = getFarm();
    const visit = farm && seat >= 0 ? tavernVisit(plan.id, `${farm.year}-${farm.season}-${farm.day}`) : null;
    const minute = useClock.getState().minute;
    const wantIn = !!visit && !onStage && minute >= visit.go && minute < visit.leave;
    const room = shopRoom('tavern');
    // The doorstep is clear (nobody, hero or villager, standing on it), so one can step out.
    const doorClear = () => {
      const [dx0, dz0] = WANDER.nodes[TAVERN_NODE];
      if (Math.hypot(playerState.position.x - dx0, playerState.position.z - dz0) < 1.2) return false;
      for (const [other, p] of crowd) if (other !== plan.id && Math.hypot(p.x - dx0, p.z - dz0) < 1.2) return false;
      return true;
    };
    if (w.inside && !wantIn && doorClear()) {
      // Time to go (once the doorstep is clear): back out on it, then on round the town.
      w.inside = false;
      [w.x, w.z] = WANDER.nodes[TAVERN_NODE];
      w.from = w.to = TAVERN_NODE;
      w.path = [];
      w.stroll = null;
      w.dest = chooseDest(plan.id, TAVERN_NODE, TAVERN_NODE);
      w.wait = 0.6;
      w.rot = w.look = 0;
      w.lift = groundHeight(w.x, w.z);
    } else if (!w.inside && wantIn && w.dest !== TAVERN_NODE) {
      // Off to the tavern: head for its door (from the next point on the road).
      w.dest = TAVERN_NODE;
      claims.set(plan.id, TAVERN_NODE);
      w.path = [];
      w.wait = Math.min(w.wait, 0.5);
    }

    let target = 0;
    let face: number | null = null;
    if (w.inside) {
      // At the tavern: stand at its spot, turned to the company, glancing about now and then.
      const spot = TAVERN_SPOTS[seat % TAVERN_SPOTS.length];
      w.x = room.cx + spot.at[0];
      w.z = room.cz + spot.at[1];
      face = near ? Math.atan2(px, pz) : Math.atan2(spot.look[0] - spot.at[0], spot.look[1] - spot.at[1]) + Math.sin(t * 0.4 + index) * 0.35;
    } else if (near) {
      face = Math.atan2(px, pz);
    } else if (w.wait > 0 || onStage) {
      // Idle (and hold still during conversations, so nobody strolls through the stage).
      w.wait -= dt;
      // Glance around while idling.
      face = w.look + Math.sin(t * 0.7 + index) * 0.6;
    } else {
      // On a stroll, aim for the spot on the grass; on the road, for the next node, LANE to the right
      // of the path (two going opposite ways pass).
      const [fx, fz] = WANDER.nodes[w.from];
      const [tx, tz] = WANDER.nodes[w.to];
      const len = Math.hypot(tx - fx, tz - fz) || 1;
      const lane = laneOf(w.from, w.to);
      const ax = w.stroll ? w.stroll[0] : tx + ((tz - fz) / len) * lane;
      const az = w.stroll ? w.stroll[1] : tz - ((tx - fx) / len) * lane;
      const dx = ax - w.x;
      const dz = az - w.z;
      const dist = Math.hypot(dx, dz);
      target = plan.speed;
      const blocked = (a: number, b: number) => intoClosedNorth(a, b) || (w.avoid.get(`${a}>${b}`) ?? 0) > t;
      // Plan (or re-plan) the way to the destination from node `here`; a new destination if it can't be reached.
      const replan = (here: number) => {
        let path = route(here, w.dest, blocked);
        if (!path) {
          w.dest = chooseDest(plan.id, here, w.dest);
          path = route(here, w.dest, blocked) ?? [];
        }
        w.path = path;
      };
      const arrive = () => {
        w.stuck = 0;
        if (w.stroll) {
          // Back from the stroll to the nearest road point, then on to the next destination.
          w.stroll = null;
          w.from = w.to = nearestNode([w.x, w.z]);
          w.path = [];
          w.back = true;
          return;
        }
        const here = w.to;
        if (here === TAVERN_NODE && wantIn) {
          // At the tavern's door in the evening: in they go.
          w.inside = true;
          w.stroll = null;
          w.path = [];
          claims.delete(plan.id);
          return;
        }
        if (here === w.dest && !w.back) {
          // There: linger, perhaps stroll onto the grass nearby, then pick the next destination.
          w.wait = plan.pause[0] + Math.random() * (plan.pause[1] - plan.pause[0]);
          w.look = w.rot;
          w.dest = chooseDest(plan.id, here, here);
          w.path = [];
          const spot = Math.random() < STROLL ? strollSpot(phys, plan.id, w.x, w.z) : null;
          if (spot) w.stroll = spot;
          return;
        }
        w.back = false;
        if (w.path.length === 0) replan(here);
        const next = w.path[0];
        if (next === undefined) {
          // Nowhere reachable just now: wait and try again.
          w.wait = 1 + Math.random() * 2;
          w.dest = chooseDest(plan.id, here, w.dest);
          return;
        }
        // Check the stretch ahead is clear before taking it; if not, avoid it and plan round it.
        const [hx, hz] = WANDER.nodes[here];
        const [nx, nz] = WANDER.nodes[next];
        const l = Math.hypot(nx - hx, nz - hz) || 1;
        const lane = laneOf(here, next);
        if (!clearWay(phys, w.x, w.z, nx + ((nz - hz) / l) * lane, nz - ((nx - hx) / l) * lane, lane ? 0.28 : 0.18)) {
          w.avoid.set(`${here}>${next}`, t + AVOID);
          w.avoid.set(`${next}>${here}`, t + AVOID);
          w.path = [];
          w.wait = 0.3;
          return;
        }
        w.path.shift();
        w.from = here;
        w.to = next;
      };
      if (dist < 0.15) {
        arrive();
      } else {
        const step = Math.min(dist, w.speed * dt);
        const want = { x: (dx / dist) * step, y: 0, z: (dz / dist) * step };
        let mx = want.x;
        let mz = want.z;
        if (controller.current && collider.current) {
          controller.current.computeColliderMovement(collider.current, want, rapier.QueryFilterFlags.EXCLUDE_SENSORS);
          const m = controller.current.computedMovement();
          mx = m.x;
          mz = m.z;
        }
        w.x += mx;
        w.z += mz;
        face = Math.atan2(dx, dz);
        // Held up by something: close enough counts as there; otherwise give it a moment, then turn back.
        if (step > 1e-4 && Math.hypot(mx, mz) < step * 0.25) {
          w.stuck += dt;
          if (dist < 0.7) arrive();
          else if (w.stuck > STUCK && w.stroll) arrive();   // blocked on the grass: call the stroll done
          else if (w.stuck > STUCK) {
            w.avoid.set(`${w.from}>${w.to}`, t + AVOID);
            w.avoid.set(`${w.to}>${w.from}`, t + AVOID);
            [w.from, w.to] = [w.to, w.from];
            w.path = [];
            w.stuck = 0;
            w.wait = 0.4 + Math.random() * 0.8;
            w.look = w.rot + Math.PI;
          }
        } else w.stuck = 0;
      }
    }
    {
      const [tx, tz] = w.stroll ?? WANDER.nodes[w.to];
      crowd.set(plan.id, { x: w.x, z: w.z, tx, tz });
    }
    // Ease in and out of walking so starts and stops don't snap.
    w.speed += (target - w.speed) * (1 - Math.exp(-dt * 6));
    motion.current.speed = w.speed;

    if (face !== null) {
      let diff = face - w.rot;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      w.rot += diff * (1 - Math.exp(-dt * 6));
    }
    // Stand on the path, bridge or stone underfoot (the physics ground is flat); indoors, on the floor.
    w.lift = w.inside ? 0 : w.lift + (groundHeight(w.x, w.z) - w.lift) * (1 - Math.exp(-dt * 15));
    body.current?.setNextKinematicTranslation({ x: w.x, y: BODY_Y + w.lift, z: w.z });
    if (root.current) root.current.rotation.y = w.rot;
    // Seen only from the same space: outdoors, or inside the tavern with them.
    if (shell.current) shell.current.visible = zoneAt(w.x, w.z) === zoneAt(playerState.position.x, playerState.position.z);
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[x0, BODY_Y, z0]}>
      <CylinderCollider ref={collider} args={[BODY_Y - 0.05, 0.3 * (plan.scale ?? 1)]} position={[0, 0.05, 0]} />
      <group ref={shell} position={[0, -BODY_Y, 0]}>
        <group ref={root} name="villager">
          <CharacterModel model={plan.model} scale={plan.scale} motion={motion} />
        </group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <circleGeometry args={[0.32 * (plan.scale ?? 1), 20]} />
          <meshBasicMaterial color="#000" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      </group>
    </RigidBody>
  );
}

export function Villagers() {
  return (
    <>
      {VILLAGERS.map((plan, i) => (
        <Villager key={plan.id} plan={plan} index={i} />
      ))}
    </>
  );
}
