'use client';

import { memo, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { ConeGeometry, CylinderGeometry, MeshStandardMaterial, SphereGeometry, type BufferGeometry, type Group } from 'three';
import { TREE_GROWN, TREES } from '@/game/sim/content';
import { fruitOn } from '@/game/sim/sim';
import { tileCenter } from '@/game/sim/farm-map';
import type { Tree } from '@/game/sim/types';
import { useFarm, useFarmState } from '@/game/state/farm-store';
import { getWorldMaterials } from './materials';
import { TREE_GEO } from './scenery';

/**
 * The farm's trees, from the farm state: the orchard's old apple trees, wild oaks and pines, and
 * every one you plant, at its stage — a seed in a little mound, a sprout, a sapling, a young tree,
 * a grown one (apple trees with apples on). Each wobbles when the axe bites; grown and young ones
 * are solid.
 */

let shared: { canopy: BufferGeometry; trunk: BufferGeometry; apple: BufferGeometry; cone: BufferGeometry; leaf: SphereGeometry; stem: CylinderGeometry } | null = null;
function geos() {
  shared ??= {
    canopy: TREE_GEO.canopy(),
    trunk: TREE_GEO.trunk(),
    apple: TREE_GEO.apple(),
    cone: new ConeGeometry(1, 1, 10),
    leaf: new SphereGeometry(1, 10, 8),
    stem: new CylinderGeometry(1, 1, 1, 6),
  };
  return shared;
}

const LEAVES: Record<string, MeshStandardMaterial> = {
  apple: new MeshStandardMaterial({ color: '#7faa4c', roughness: 0.85 }),
  oak: new MeshStandardMaterial({ color: '#5f8a37', roughness: 0.85 }),
  pine: new MeshStandardMaterial({ color: '#3f7a4a', roughness: 0.85 }),
};
const SOIL = new MeshStandardMaterial({ color: '#8a5a3a', roughness: 1 });
const SEED = new MeshStandardMaterial({ color: '#b07a45', roughness: 0.8 });
const APPLE = new MeshStandardMaterial({ color: '#e0473a', roughness: 0.45 });

/** How big each stage stands (a grown tree is the size of the orchard's old ones). */
const SCALE = [0, 0, 0.3, 0.5, 0.68];

/** `apples`: how many of the five apple spots show (an apple tree's fruit still to pick). */
const TreeModel = memo(function TreeModel({ kind, stage, apples = 0 }: { kind: string; stage: number; apples?: number }) {
  const g = geos();
  const m = getWorldMaterials();
  const leaf = LEAVES[kind] ?? LEAVES.oak;
  if (stage === 0) {
    return (
      <group>
        <mesh geometry={g.leaf} material={SOIL} position={[0, 0.02, 0]} scale={[0.26, 0.07, 0.22]} receiveShadow />
        <mesh geometry={g.leaf} material={SEED} position={[0.03, 0.08, 0]} scale={[0.06, 0.045, 0.05]} />
      </group>
    );
  }
  if (stage === 1) {
    return (
      <group>
        <mesh geometry={g.leaf} material={SOIL} position={[0, 0.02, 0]} scale={[0.24, 0.06, 0.2]} receiveShadow />
        <mesh geometry={g.stem} material={leaf} position={[0, 0.16, 0]} scale={[0.02, 0.3, 0.02]} />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={g.leaf} material={leaf} position={[s * 0.07, 0.3, 0]} rotation={[0, 0, s * 0.6]} scale={[0.08, 0.035, 0.05]} castShadow />
        ))}
      </group>
    );
  }
  const k = SCALE[stage];
  if (kind === 'pine') {
    return (
      <group scale={k}>
        <mesh geometry={g.trunk} material={m.bark} castShadow />
        {[
          [1.15, 1.0, 1.25],
          [0.9, 1.75, 1.05],
          [0.62, 2.4, 0.85],
        ].map(([r, y, h]) => (
          <mesh key={y} geometry={g.cone} material={leaf} position={[0, y, 0]} scale={[r, h, r]} castShadow receiveShadow />
        ))}
      </group>
    );
  }
  return (
    <group scale={k}>
      <mesh geometry={g.trunk} material={m.bark} castShadow />
      <mesh geometry={g.canopy} material={leaf} castShadow receiveShadow scale={kind === 'oak' ? [1.1, 1, 1.1] : 1} />
      {kind === 'apple' &&
        stage >= TREE_GROWN &&
        apples > 0 &&
        [
          [0.75, 1.5, 0.55],
          [-0.6, 1.9, 0.72],
          [0.2, 2.5, 0.62],
          [-0.72, 1.4, -0.5],
          [0.5, 2.1, -0.66],
        ]
          .slice(0, apples)
          .map(([x, y, z], i) => <mesh key={i} geometry={g.apple} material={APPLE} position={[x, y - 0.16, z]} scale={1.3} />)}
    </group>
  );
});

/** Apples showing on a tree: all five spots for a full crop, fewer as it's picked. */
function applesShown(tree: Tree) {
  const fruit = TREES[tree.kind]?.fruit;
  const n = fruitOn(tree);
  return fruit && n ? Math.max(1, Math.round((5 * n) / fruit.n)) : 0;
}

/** One tree: it wobbles when the axe bites (its chops counted up). */
function FarmTree({ tree }: { tree: Tree }) {
  const group = useRef<Group>(null);
  const shake = useRef(0);
  const lastHits = useRef(tree.hits);
  useEffect(() => {
    if (tree.hits > lastHits.current) shake.current = 1;
    lastHits.current = tree.hits;
  }, [tree.hits]);
  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    shake.current = Math.max(0, shake.current - dt * 2.5);
    g.rotation.z = Math.sin(state.clock.elapsedTime * 38) * 0.07 * shake.current;
  });
  const [x, z] = tileCenter(tree.c, tree.r);
  return (
    <group position={[x, 0, z]} rotation={[0, (tree.id * 1.7) % (Math.PI * 2), 0]}>
      <group ref={group}>
        <TreeModel kind={tree.kind} stage={tree.stage} apples={applesShown(tree)} />
      </group>
    </group>
  );
}

export function FarmTrees() {
  const farm = useFarmState();
  useFarm((s) => s.rev);
  if (!farm) return null;
  const trees = farm.trees ?? [];
  const solid = trees.filter((t) => t.stage >= 2);
  const layout = solid.map((t) => `${t.id}:${t.stage}`).join('|');
  return (
    <>
      {trees.map((t) => (
        <FarmTree key={t.id} tree={t} />
      ))}
      <RigidBody key={layout} type="fixed" colliders={false}>
        {solid.map((t) => {
          const [x, z] = tileCenter(t.c, t.r);
          return <CylinderCollider key={t.id} args={[1, t.stage === 2 ? 0.12 : 0.28]} position={[x, 1, z]} />;
        })}
      </RigidBody>
    </>
  );
}
