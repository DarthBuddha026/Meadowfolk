'use client';

import { useMemo } from 'react';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Material,
  MeshStandardMaterial,
  Object3D,
  CircleGeometry,
  SphereGeometry,
  CapsuleGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getTerrain, type ScatterItem } from '@/game/engine/terrain';
import { getWorldMaterials } from './materials';

/**
 * Scattered clay-diorama props, all instanced: stacked-block trees with
 * scalloped leaves, hedges, big daisies, grass tufts, rocks, lanterns,
 * lily pads, cattails, and apples.
 */

type Part = { geo: BufferGeometry; pos?: [number, number, number]; scale?: [number, number, number]; rotX?: number; rotY?: number; rotZ?: number };

function merge(parts: Part[]): BufferGeometry {
  const geos = parts.map(({ geo, pos = [0, 0, 0], scale = [1, 1, 1], rotX = 0, rotY = 0, rotZ = 0 }) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as BufferGeometry;
    g.scale(...scale);
    g.rotateX(rotX);
    g.rotateZ(rotZ);
    g.rotateY(rotY);
    g.translate(...pos);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    return g;
  });
  return mergeGeometries(geos)!;
}

function scallopRow(width: number, y: number, count: number, r: number, inset = 0): Part[] {
  const parts: Part[] = [];
  const half = width / 2 - inset;
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < count; k++) {
      const t = -half + ((k + 0.5) / count) * half * 2;
      const [x, z] = [
        [t, half],
        [half, -t],
        [-t, -half],
        [-half, t],
      ][side];
      parts.push({ geo: new SphereGeometry(r, 10, 8), pos: [x, y, z], scale: [1, 0.8, 1] });
    }
  }
  return parts;
}

const GEO = {
  canopy: () =>
    merge([
      { geo: new RoundedBoxGeometry(1.75, 1.05, 1.75, 4, 0.4), pos: [0, 1.6, 0] },
      ...scallopRow(1.75, 1.18, 4, 0.25, 0.08),
      { geo: new RoundedBoxGeometry(1.35, 0.9, 1.35, 4, 0.34), pos: [0, 2.45, 0] },
      ...scallopRow(1.35, 2.08, 3, 0.22, 0.06),
    ]),
  trunk: () =>
    merge([
      { geo: new CylinderGeometry(0.17, 0.24, 1.3, 10), pos: [0, 0.65, 0] },
      { geo: new ConeGeometry(0.48, 0.32, 10), pos: [0, 0.12, 0] },
    ]),
  hedge: () =>
    merge([
      { geo: new RoundedBoxGeometry(1.4, 0.85, 1.0, 4, 0.32), pos: [0, 0.45, 0] },
      ...scallopRow(1.0, 0.3, 3, 0.2, 0.02).map((p) => ({ ...p, pos: [p.pos![0] * 1.35, p.pos![1], p.pos![2]] as [number, number, number] })),
    ]),
  petals: () =>
    merge(
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return {
          geo: new SphereGeometry(0.1, 10, 6),
          scale: [1.25, 0.32, 0.55] as [number, number, number],
          rotZ: 0.18,
          pos: [Math.cos(a) * 0.15, 0.16, Math.sin(a) * 0.15] as [number, number, number],
          rotY: -a,
        };
      })
    ),
  flowerCenter: () => merge([{ geo: new SphereGeometry(0.085, 12, 8), pos: [0, 0.19, 0], scale: [1, 0.6, 1] }]),
  stem: () =>
    merge([
      { geo: new CylinderGeometry(0.022, 0.022, 0.18, 6), pos: [0, 0.08, 0] },
      { geo: new SphereGeometry(0.09, 8, 6), pos: [0.09, 0.05, 0], scale: [1, 0.4, 0.6] },
      { geo: new SphereGeometry(0.09, 8, 6), pos: [-0.08, 0.06, 0.04], scale: [1, 0.4, 0.6], rotY: 2 },
    ]),
  tuft: () =>
    merge(
      [-0.09, 0, 0.09, 0.03, -0.04].map((x, i) => ({
        geo: new ConeGeometry(0.06, 0.32 - (i % 3) * 0.06, 5),
        pos: [x, 0.13, (i % 2) * 0.07 - 0.03] as [number, number, number],
        rotZ: x * 2.5,
      }))
    ),
  rock: () => merge([{ geo: new SphereGeometry(0.35, 10, 8), pos: [0, 0.12, 0], scale: [1, 0.6, 0.85] }]),
  lanternPost: () =>
    merge([
      { geo: new CylinderGeometry(0.09, 0.11, 1.05, 10), pos: [0, 0.52, 0] },
      { geo: new CylinderGeometry(0.17, 0.2, 0.12, 12), pos: [0, 0.06, 0] },
    ]),
  lanternHead: () => merge([{ geo: new RoundedBoxGeometry(0.26, 0.3, 0.26, 3, 0.06), pos: [0, 1.2, 0] }]),
  lanternCap: () =>
    merge([
      { geo: new RoundedBoxGeometry(0.36, 0.08, 0.36, 2, 0.03), pos: [0, 1.38, 0] },
      { geo: new RoundedBoxGeometry(0.32, 0.06, 0.32, 2, 0.025), pos: [0, 1.03, 0] },
      { geo: new SphereGeometry(0.06, 10, 8), pos: [0, 1.46, 0] },
    ]),
  lily: () => merge([{ geo: new CircleGeometry(0.42, 20, 0.35, Math.PI * 2 - 0.7), rotX: -Math.PI / 2 }]),
  cattailStalk: () => merge([{ geo: new CylinderGeometry(0.024, 0.03, 1.1, 6), pos: [0, 0.05, 0] }]),
  cattailHead: () => merge([{ geo: new CapsuleGeometry(0.055, 0.18, 4, 8), pos: [0, 0.55, 0] }]),
  apple: () =>
    merge([
      { geo: new SphereGeometry(0.17, 14, 10), pos: [0, 0.16, 0] },
      { geo: new CylinderGeometry(0.015, 0.015, 0.08, 5), pos: [0, 0.34, 0] },
    ]),
};

const dummy = new Object3D();

function makeInstanced(
  geometry: BufferGeometry,
  material: Material,
  items: ScatterItem[],
  opts: { scale?: (i: ScatterItem) => number; color?: (i: ScatterItem, idx: number) => string; shadow?: boolean; receive?: boolean } = {}
) {
  const mesh = new InstancedMesh(geometry, material, Math.max(items.length, 1));
  mesh.count = items.length;
  const c = new Color();
  items.forEach((it, idx) => {
    dummy.position.set(it.x, it.y, it.z);
    dummy.rotation.set(0, it.rot, 0);
    dummy.scale.setScalar(opts.scale ? opts.scale(it) : it.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(idx, dummy.matrix);
    if (opts.color) mesh.setColorAt(idx, c.set(opts.color(it, idx)));
  });
  mesh.castShadow = opts.shadow ?? true;
  mesh.receiveShadow = opts.receive ?? true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** The tree shapes, shared with the farm's own trees (see FarmTrees), so both look alike. */
export const TREE_GEO = { canopy: GEO.canopy, trunk: GEO.trunk, apple: GEO.apple };

const LEAF_COLORS = ['#6f9c43', '#7faa4c', '#628f3d'];
const HEDGE_COLORS = ['#7aa84e', '#86b356'];
const ROCK_COLORS = ['#e9dfcd', '#d9cfbd', '#f2ebdd'];
const TUFT_COLORS = ['#6d9a3e', '#82ad4c', '#5f8a37'];

export function Scenery() {
  const { scatter } = getTerrain();
  const m = getWorldMaterials();

  const meshes = useMemo(() => {
    const plain = (color: string, roughness = 0.85) => new MeshStandardMaterial({ color, roughness });
    const tint = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    return [
      makeInstanced(GEO.canopy(), m.leaf, scatter.trees, { color: (_, i) => LEAF_COLORS[i % 3] }),
      makeInstanced(GEO.trunk(), m.bark, scatter.trees),
      makeInstanced(GEO.hedge(), tint, scatter.hedges, { color: (_, i) => HEDGE_COLORS[i % 2] }),
      makeInstanced(GEO.stem(), plain('#6f9c43'), scatter.flowers, { shadow: false }),
      makeInstanced(GEO.petals(), m.petal, scatter.flowers),
      makeInstanced(GEO.flowerCenter(), m.flowerCenter, scatter.flowers, { shadow: false }),
      makeInstanced(GEO.tuft(), tint.clone(), scatter.tufts, { color: (_, i) => TUFT_COLORS[i % 3], shadow: false }),
      makeInstanced(GEO.rock(), tint.clone(), scatter.rocks, { color: (_, i) => ROCK_COLORS[i % 3] }),
      makeInstanced(GEO.lanternPost(), m.woodDark, scatter.lanterns),
      makeInstanced(GEO.lanternHead(), m.lanternGlow, scatter.lanterns, { shadow: false }),
      makeInstanced(GEO.lanternCap(), m.woodDark, scatter.lanterns),
      makeInstanced(GEO.lily(), plain('#7fae52', 0.7), scatter.lilies, { shadow: false }),
      makeInstanced(GEO.cattailStalk(), plain('#7aa04a'), scatter.cattails),
      makeInstanced(GEO.cattailHead(), plain('#b9783f'), scatter.cattails),
      makeInstanced(GEO.apple(), plain('#e0473a', 0.45), scatter.apples),
    ];
  }, [scatter, m]);

  return (
    <>
      {meshes.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
      <RigidBody type="fixed" colliders={false}>
        {scatter.trees
          .filter((t) => t.y === 0)
          .map((t, i) => (
            <CylinderCollider key={`t${i}`} args={[1.2, 0.32 * t.s]} position={[t.x, 1.2, t.z]} />
          ))}
        {scatter.hedges.map((h, i) => (
          <CuboidCollider key={`h${i}`} args={[0.7 * h.s, 0.5, 0.5 * h.s]} position={[h.x, 0.5, h.z]} rotation={[0, h.rot, 0]} />
        ))}
        {scatter.lanterns.map((l, i) => (
          <CylinderCollider key={`l${i}`} args={[0.8, 0.14]} position={[l.x, 0.8, l.z]} />
        ))}
      </RigidBody>
    </>
  );
}
