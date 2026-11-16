'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { Group } from 'three';
import { NORTH_GATE, RIDGE } from '@/game/data';
import { playerState } from '@/game/engine/world-state';
import { nearClosedRoad } from '@/game/state/mission-director';
import { useSession } from '@/game/state/session-store';
import { useNorthBankOpen, useNorthGateUp } from '@/game/state/use-mission';
import { getWorldMaterials } from './materials';
import { useCanvasTexture } from './use-canvas-texture';

/**
 * The north gate: a striped boom barrier across the ridge's cutting, with a ROAD CLOSED sign in
 * front of it. Its collider closes the cutting until the north bank opens (see `isNorthBankOpen`);
 * the arm swings up during the reveal shot and stays up. Walking up to it while it is closed asks
 * the director for Captain T's line.
 */

/** The arm's pivot stands on the west side of the cutting; the arm reaches across it to a rest post. */
const PIVOT_X = RIDGE.cut.x - RIDGE.cut.half + 0.3;
const ARM_LEN = RIDGE.cut.half * 2 - 0.15;
const ARM_Y = 0.92;
/** How far up the arm swings (radians; just short of upright). */
const LIFT = Math.PI / 2 - 0.12;
/** Where the hero gets told the road is closed: in front of the arm, on the south side. */
const NOTICE = { z: NORTH_GATE.z + 1.4, r: 1.6 };

export function NorthGate() {
  const m = getWorldMaterials();
  const open = useNorthBankOpen();
  const up = useNorthGateUp();
  const arm = useRef<Group>(null);
  const lift = useRef(up ? 1 : 0);

  const stripes = useCanvasTexture(
    128,
    16,
    (ctx, w, h) => {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? '#fff6e6' : '#d9453a';
        ctx.fillRect((i * w) / 8, 0, w / 8, h);
      }
    },
    'barrier-stripes'
  );
  const sign = useCanvasTexture(
    256,
    160,
    (ctx, w, h) => {
      ctx.fillStyle = '#fff6e6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#d9453a';
      for (let i = -1; i < 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 32, h);
        ctx.lineTo(i * 32 + 16, h);
        ctx.lineTo(i * 32 + 40, h - 24);
        ctx.lineTo(i * 32 + 24, h - 24);
        ctx.fill();
      }
      ctx.fillStyle = '#2b2340';
      ctx.font = 'bold 46px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ROAD', w / 2, 44);
      ctx.fillText('CLOSED', w / 2, 94);
    },
    'road-closed'
  );

  useFrame((_, dt) => {
    lift.current += ((up ? 1 : 0) - lift.current) * (1 - Math.exp(-Math.min(dt, 0.05) * 3.2));
    if (arm.current) arm.current.rotation.z = lift.current * LIFT;
    if (open) return;
    const { x, z } = playerState.position;
    if (useSession.getState().map === 'junction' && Math.hypot(x - NORTH_GATE.x, z - NOTICE.z) < NOTICE.r) nearClosedRoad();
  });

  return (
    <group>
      {!up && (
        <RigidBody type="fixed" colliders={false} position={[NORTH_GATE.x, 0, NORTH_GATE.z]}>
          <CuboidCollider args={[RIDGE.cut.half, 1.2, 0.3]} position={[0, 1.2, 0]} />
        </RigidBody>
      )}
      {/* Pivot post with its counterweighted arm. */}
      <group position={[PIVOT_X, 0, NORTH_GATE.z]}>
        <RoundedBox args={[0.26, ARM_Y + 0.12, 0.26]} radius={0.05} position={[0, (ARM_Y + 0.12) / 2, 0]} material={m.woodDark} castShadow receiveShadow />
        <group ref={arm} position={[0, ARM_Y, 0.2]}>
          {/* A plain box, so the stripes run the whole length of every face. */}
          <mesh position={[ARM_LEN / 2, 0, 0]} castShadow>
            <boxGeometry args={[ARM_LEN, 0.12, 0.1]} />
            <meshStandardMaterial map={stripes} roughness={0.7} />
          </mesh>
          <RoundedBox args={[0.42, 0.24, 0.16]} radius={0.05} position={[-0.3, 0, 0]} material={m.stone} castShadow />
        </group>
      </group>
      {/* Forked rest post the arm lies in when closed. */}
      <group position={[PIVOT_X + ARM_LEN - 0.12, 0, NORTH_GATE.z + 0.2]}>
        <RoundedBox args={[0.14, ARM_Y - 0.04, 0.14]} radius={0.03} position={[0, (ARM_Y - 0.04) / 2, 0]} material={m.woodDark} castShadow />
        {[-1, 1].map((s) => (
          <RoundedBox key={s} args={[0.05, 0.22, 0.05]} radius={0.02} position={[0, ARM_Y, s * 0.09]} material={m.woodDark} />
        ))}
      </group>
      {/* A-frame ROAD CLOSED sign on the road in front of the arm, gone once the road opens. */}
      <group position={[NORTH_GATE.x + 0.35, 0, NORTH_GATE.z + 0.9]} rotation={[0, -0.12, 0]} visible={!up}>
        {/* Two boards leaning together at the top; the lettering is on the south one. */}
        {[-1, 1].map((s) => (
          <group key={s} position={[0, 0.42, s * 0.16]} rotation={[-s * 0.36, 0, 0]}>
            <RoundedBox args={[0.92, 0.86, 0.05]} radius={0.02} material={m.wood} castShadow />
            {s > 0 && (
              <mesh position={[0, 0.02, 0.028]}>
                <planeGeometry args={[0.82, 0.52]} />
                <meshStandardMaterial map={sign} roughness={0.8} />
              </mesh>
            )}
          </group>
        ))}
      </group>
    </group>
  );
}
