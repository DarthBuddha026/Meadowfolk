import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitItem, sellPrice } from './content';
import { animalCanWalk, CHICKEN_YARD, COOP_TILE, GRID, houseEntry, inHouseArea, ORCHARD_TREES, ROWS_ADDED_NORTH, shellDoors, tileAt, tileCenter, tileIndex, underShell } from './farm-map';
import { applyIntent, cloneFarm, createFarm, cropStage, isRipe, migrateFarm, placementProblem, SAVE_VERSION } from './sim';
import type { Actor, Effect, FarmState, Intent } from './types';

const host: Actor = { id: 'host', name: 'Hana' };
const guest: Actor = { id: 'guest', name: 'Gus' };
const T = { c: 23, r: 16 }; // a starter tilled tile

const run = (farm: FarmState, actor: Actor, intent: Intent) => {
  const res = applyIntent(farm, actor, intent);
  assert.ok(res.ok, res.ok ? '' : res.reason);
  return res.effects;
};
const sleep = (farm: FarmState) => run(farm, host, { t: 'endDay' });

test('a new farm has the two-room house with a bed, storage and a shipping bin', () => {
  const farm = createFarm('host', 'Hana');
  const pieces = farm.placements.map((p) => p.piece);
  for (const p of ['big-bed', 'wardrobe', 'sofa', 'kitchen-counter', 'shipping-bin', 'wall-door']) assert.ok(pieces.includes(p), p);
  assert.ok(farm.tiles[tileIndex(T.c, T.r)].tilled);
});

test('watered crops grow one stage a night; unwatered ones just wait', () => {
  const farm = createFarm('host', 'Hana');
  run(farm, host, { t: 'plant', ...T, seed: 'seed-turnip', from: 'self' });
  const t = farm.tiles[tileIndex(T.c, T.r)];
  sleep(farm);
  assert.equal(t.crop!.growth, 0, 'no water, no growth');
  for (let d = 0; d < 4; d++) {
    run(farm, host, { t: 'water', ...T });
    sleep(farm);
  }
  assert.ok(isRipe(t.crop!));
  assert.equal(cropStage(t.crop!), 3);
  const fx = run(farm, host, { t: 'harvest', ...T });
  assert.deepEqual(fx, [{ e: 'give', who: 'host', item: 'turnip', n: 1 }]);
  assert.equal(t.crop, null);
  assert.ok(t.tilled, 'soil stays tilled');
});

test('regrowing crops come back after harvest', () => {
  const farm = createFarm('host', 'Hana');
  run(farm, host, { t: 'plant', ...T, seed: 'seed-peas', from: 'self' });
  for (let d = 0; d < 6; d++) {
    run(farm, host, { t: 'water', ...T });
    sleep(farm);
  }
  run(farm, host, { t: 'harvest', ...T });
  const crop = farm.tiles[tileIndex(T.c, T.r)].crop!;
  assert.ok(crop && !isRipe(crop));
  for (let d = 0; d < 2; d++) {
    run(farm, host, { t: 'water', ...T });
    sleep(farm);
  }
  assert.ok(isRipe(crop));
});

test('fertilized, never-missed crops are great quality', () => {
  const farm = createFarm('host', 'Hana');
  run(farm, host, { t: 'fertilize', ...T, from: 'self' });
  run(farm, host, { t: 'plant', ...T, seed: 'seed-turnip', from: 'self' });
  for (let d = 0; d < 4; d++) {
    run(farm, host, { t: 'water', ...T });
    sleep(farm);
  }
  const fx = run(farm, host, { t: 'harvest', ...T });
  assert.equal((fx[0] as Extract<Effect, { e: 'give' }>).item, 'turnip@great');
  assert.equal(sellPrice('turnip@great'), 90);
});

test('the shipping bin pays the owner overnight and empties', () => {
  const farm = createFarm('host', 'Hana');
  run(farm, host, { t: 'ship', item: 'turnip', n: 3 });
  run(farm, guest, { t: 'ship', item: 'egg', n: 1 });
  const fx = sleep(farm);
  assert.deepEqual(fx, [{ e: 'gold', who: 'host', n: 230 }]);
  assert.deepEqual(farm.bin, {});
  assert.equal(farm.lastPayout?.gold, 230);
});

test('guests help but cannot build, spend, withdraw or end the day', () => {
  const farm = createFarm('host', 'Hana');
  for (const intent of [
    { t: 'place', piece: 'fence', c: 20, r: 16, rot: 0, color: 0 },
    { t: 'withdraw', item: 'turnip', n: 1 },
    { t: 'till', c: 12, r: 16 },
    { t: 'endDay' },
  ] as Intent[]) {
    assert.equal(applyIntent(farm, guest, intent).ok, false, intent.t);
  }
  // Guests plant only from storage, and what they harvest goes into storage.
  assert.equal(applyIntent(farm, guest, { t: 'plant', ...T, seed: 'seed-turnip', from: 'self' }).ok, false);
  run(farm, host, { t: 'deposit', item: 'seed-turnip', n: 2 });
  run(farm, guest, { t: 'plant', ...T, seed: 'seed-turnip', from: 'storage' });
  assert.equal(farm.storage['seed-turnip'], 1);
  run(farm, guest, { t: 'water', ...T });
  assert.equal(farm.help.guest.watered, 1);
  assert.equal(farm.help.guest.planted, 1);
  for (let d = 0; d < 4; d++) {
    if (d) run(farm, guest, { t: 'water', ...T });
    sleep(farm);
  }
  const fx = run(farm, guest, { t: 'harvest', ...T });
  assert.deepEqual(fx, []);
  assert.equal(farm.storage.turnip, 1);
});

test('chickens fed today lay an egg overnight', () => {
  const farm = createFarm('host', 'Hana');
  run(farm, host, { t: 'place', piece: 'coop', c: 30, r: 16, rot: 0, color: 1 });
  const coop = farm.placements[farm.placements.length - 1].id;
  run(farm, host, { t: 'buyAnimal', kind: 'chicken', coop, name: 'Pip' });
  run(farm, host, { t: 'feed', coop, from: 'self' });
  sleep(farm);
  const fx = run(farm, host, { t: 'collect', coop });
  assert.deepEqual(fx, [{ e: 'give', who: 'host', item: 'egg', n: 1 }]);
  assert.equal(applyIntent(farm, host, { t: 'remove', id: coop }).ok, false, 'occupied coops stay');
});

test('villa pieces stay inside the footprint; the whole farm is yours from the start', () => {
  const farm = createFarm('host', 'Hana');
  assert.match(placementProblem(farm, 'wall', 26, 16, 0) ?? '', /inside the house/);
  // The orchard's end, and the rows up north, are yours too.
  assert.equal(placementProblem(farm, 'fence', 3, 9, 0), null);
  assert.equal(placementProblem(farm, 'fence', 30, 0, 0), null);
  const fx = run(farm, host, { t: 'place', piece: 'fence', c: 3, r: 9, rot: 0, color: 7 });
  assert.deepEqual(fx, [{ e: 'take', who: 'host', item: kitItem('fence'), n: 1 }]);
});

test('the season loops back to Spring after day 28 in the slice', () => {
  const farm = createFarm('host', 'Hana');
  for (let d = 0; d < 28; d++) sleep(farm);
  assert.equal(farm.day, 1);
  assert.equal(farm.season, 'spring');
  assert.equal(farm.year, 2);
});

test('a guest replica fed the same accepted intents agrees with the host', () => {
  const hostFarm = createFarm('host', 'Hana');
  const replica = cloneFarm(hostFarm); // the join snapshot
  const log: [Actor, Intent][] = [
    [host, { t: 'deposit', item: 'seed-potato', n: 5 }],
    [guest, { t: 'plant', ...T, seed: 'seed-potato', from: 'storage' }],
    [guest, { t: 'water', ...T }],
    [host, { t: 'till', c: 13, r: 17 }],
    [guest, { t: 'till', c: 13, r: 18 }], // rejected: never reaches the replica
    [host, { t: 'endDay' }],
  ];
  for (const [actor, intent] of log) {
    const res = applyIntent(hostFarm, actor, intent);
    if (res.ok) applyIntent(replica, actor, intent); // the relay forwards accepted intents only
  }
  assert.deepEqual(replica, hostFarm);
});

test('saves round-trip through JSON and migrate', () => {
  const farm = createFarm('host', 'Hana');
  assert.deepEqual(migrateFarm(JSON.parse(JSON.stringify(farm))), farm);
  assert.equal(migrateFarm({ nope: true }), null);
});

test('the starter house follows the rules: every piece could have been placed where it stands', () => {
  const farm = createFarm('host', 'Hana');
  for (const p of [...farm.placements]) {
    farm.placements = farm.placements.filter((q) => q !== p);
    assert.equal(placementProblem(farm, p.piece, p.c, p.r, p.rot), null, `${p.piece} at ${p.c},${p.r}`);
    farm.placements.push(p);
  }
});

/** A farm as a pre-v10 save had it: 16 rows (no rows up north), so everything 4 rows higher up. */
function asPreV10(farm: FarmState): FarmState {
  const old = JSON.parse(JSON.stringify(farm)) as FarmState;
  old.tiles = old.tiles.slice(GRID.cols * ROWS_ADDED_NORTH);
  for (const p of old.placements) if (p.c >= 0 && p.c < GRID.cols) p.r -= ROWS_ADDED_NORTH;
  for (const t of old.trees) t.r -= ROWS_ADDED_NORTH;
  (old as FarmState & { parcels: string[] }).parcels = [];
  return old;
}

test('version-9 saves grow 4 rows north, everything staying on the same ground', () => {
  const farm = createFarm('host', 'Hana');
  run(farm, host, { t: 'place', piece: 'coop', c: 30, r: 16, rot: 0, color: 1 });
  const old = asPreV10(farm);
  old.version = 9;
  const migrated = migrateFarm(old)!;
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.tiles.length, GRID.cols * GRID.rows);
  assert.deepEqual(migrated.placements, farm.placements);
  assert.deepEqual(migrated.trees, farm.trees);
  assert.ok(migrated.tiles[tileIndex(T.c, T.r)].tilled, 'the tilled patch is where it was');
  assert.equal((migrated as FarmState & { parcels?: unknown }).parcels, undefined);
});

test('version-10 saves: the house moves up north, its lantern, bin and path following the door', () => {
  const farm = createFarm('host', 'Hana');
  const spots = (f: FarmState) =>
    f.placements
      .filter((p) => p.c >= 0 && p.c < GRID.cols)
      .map((p) => `${p.piece}@${p.c},${p.r}`)
      .sort();
  // As it was in v10: the house 4 rows lower, so the yard started 4 rows lower too.
  const old = JSON.parse(JSON.stringify(farm)) as FarmState;
  old.version = 10;
  old.placements = old.placements.filter((p) => !(p.piece === 'path' && p.r < 10));
  for (const p of old.placements) if ((p.piece === 'lantern' || p.piece === 'shipping-bin') && p.r === 6) p.r = 10;
  old.placements.push({ id: 999, piece: 'flower-pot', c: 17, r: 3, rot: 0, color: 1, storey: 0 });
  const migrated = migrateFarm(old)!;
  assert.equal(migrated.version, SAVE_VERSION);
  assert.deepEqual(spots(migrated), spots(farm));
  assert.equal(migrated.storage[kitItem('flower-pot')], 1, 'what stood where the house goes is put away');
});

test('the farm has a pond in its north-east corner, and older saves get one where there is room', () => {
  const farm = createFarm('host', 'Hana');
  const pond = farm.placements.find((p) => p.piece === 'pond')!;
  assert.deepEqual([pond.c, pond.r], [38, 1]);
  assert.match(placementProblem(farm, 'bench', 40, 3, 0) ?? '', /./, 'the pond is in the way');
  assert.equal(applyIntent(farm, host, { t: 'till', c: 40, r: 3 }).ok, false, 'no tilling the pond');
  const old = JSON.parse(JSON.stringify(farm)) as FarmState;
  old.version = 11;
  old.placements = old.placements.filter((p) => p.piece !== 'pond');
  const migrated = migrateFarm(old)!;
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.placements.filter((p) => p.piece === 'pond').length, 1);
});

test('the pond corner is a fenced chicken yard with a gate, and the shed has its spot beside the pond', () => {
  const farm = createFarm('host', 'Hana');
  const fences = farm.placements.filter((p) => p.piece === 'fence');
  const { c0, c1, r0, r1, gate } = CHICKEN_YARD;
  assert.equal(fences.length, r1 - r0 + (c1 - c0) - 1, 'west side, and the south side but for the gate');
  assert.ok(!fences.some((p) => p.c === gate && p.r === r1 - 1 && p.rot === 2), 'the gate is open');
  assert.equal(placementProblem(farm, 'coop', ...COOP_TILE, 0), null, 'the shed fits beside the pond');
  // Older saves get the fence wherever it's free.
  const old = JSON.parse(JSON.stringify(farm)) as FarmState;
  old.version = 12;
  old.placements = old.placements.filter((p) => p.piece !== 'fence');
  const migrated = migrateFarm(old)!;
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.placements.filter((p) => p.piece === 'fence').length, fences.length);
});

test('hens can’t walk through the yard’s fence or its gate or onto the shed, but may swim in the pond', () => {
  const farm = createFarm('host', 'Hana');
  const { c0, r1, gate } = CHICKEN_YARD;
  const [ix, iz] = tileCenter(c0 + 2, 4); // inside the yard
  assert.ok(animalCanWalk(farm, ix, iz, ...tileCenter(c0 + 3, 5)), 'about the yard');
  assert.ok(!animalCanWalk(farm, ix, iz, ...tileCenter(c0 - 1, 4)), 'not through the west fence');
  assert.ok(!animalCanWalk(farm, ix, iz, ...tileCenter(c0 + 4, r1)), 'not through the south fence');
  assert.ok(animalCanWalk(farm, ix, iz, ...tileCenter(40, 2)), 'into the pond: hens swim');
  const [gx, gz] = tileCenter(gate, r1 - 1);
  assert.ok(animalCanWalk(farm, gx, gz, ...tileCenter(gate, r1)), 'out through the open gap…');
  run(farm, host, { t: 'place', piece: 'coop', c: COOP_TILE[0], r: COOP_TILE[1], rot: 0, color: 1 });
  assert.ok(!animalCanWalk(farm, ix, iz, ...tileCenter(COOP_TILE[0], COOP_TILE[1])), 'not onto the shed');
  const old = JSON.parse(JSON.stringify(farm)) as FarmState;
  old.version = 13;
  const migrated = migrateFarm(old)!;
  assert.ok(migrated.placements.some((p) => p.piece === 'fence-gate' && p.c === gate && p.r === r1 - 1));
  assert.ok(!animalCanWalk(migrated, gx, gz, ...tileCenter(gate, r1)), '…but not once the shed brings its gate');
});

test('version-1 saves get the new house; furniture that stood in the way goes to storage', () => {
  const farm = createFarm('host', 'Hana');
  const old = asPreV10(farm);
  old.version = 1;
  old.placements = [{ id: 900, piece: 'flower-pot', c: 20, r: 3, rot: 0, color: 1, storey: 0 }, { id: 901, piece: 'wall', c: 15, r: 0, rot: 0, color: 0, storey: 0 }];
  old.nextId = 902;
  const migrated = migrateFarm(old)!;
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.storage[kitItem('flower-pot')], 1);
  assert.equal(migrated.storage[kitItem('wall')], undefined, 'old walls just come down');
  assert.ok(migrated.placements.some((p) => p.piece === 'big-bed'));
  assert.ok(!migrated.placements.some((p) => p.id === 901));
});

test('version-2 saves: the old starter furniture moves into the new house instead of piling up in storage', () => {
  const farm = createFarm('host', 'Hana');
  const old = asPreV10(farm);
  old.version = 2;
  old.placements = [
    { id: 900, piece: 'sofa', c: 16, r: 4, rot: 1, color: 2, storey: 0 },
    { id: 901, piece: 'lantern', c: 17, r: 7, rot: 0, color: 8, storey: 0 },
    { id: 902, piece: 'bench', c: 14, r: 3, rot: 0, color: 7, storey: 0 },
  ];
  old.nextId = 903;
  const migrated = migrateFarm(old)!;
  assert.equal(migrated.version, SAVE_VERSION);
  assert.deepEqual(migrated.storage, { [kitItem('bench')]: 1 });
  assert.equal(migrated.placements.filter((p) => p.piece === 'sofa').length, 1);
  assert.equal(migrated.placements.filter((p) => p.piece === 'shipping-bin').length, 1);
});

test('the house is bigger inside than out: its rooms are their own space, the farm has the shell', () => {
  const farm = createFarm('host', 'Hana');
  const bed = farm.placements.find((p) => p.piece === 'big-bed')!;
  assert.ok(inHouseArea(bed.c, bed.r), 'furniture is inside');
  assert.ok(!farm.placements.some((p) => underShell(farm, p.c, p.r)), 'nothing stands under the shell on the farm');
  assert.match(placementProblem(farm, 'bench', 15, 3, 0) ?? '', /house stands/);
  assert.match(placementProblem(farm, 'coop', 167, 6, 0) ?? '', /outdoors/);
  assert.equal(placementProblem(farm, 'bench', 167, 6, 0), null, 'benches go indoors too');
  const doors = shellDoors(farm);
  assert.deepEqual(doors.map((d) => d.side), ['front', 'back']);
  const entry = houseEntry(farm, 'front');
  assert.ok(inHouseArea(...tileAt(entry.x, entry.z)));
});

test('the axe fells a grown tree in three chops, for wood and its seeds', () => {
  const farm = createFarm('host', 'Hana');
  const oak = farm.trees.find((t) => t.kind === 'oak' && t.c === 11 && t.r === 6)!;
  assert.ok(oak, 'a wild oak stands on the home plot');
  assert.equal(applyIntent(farm, guest, { t: 'chop', c: 11, r: 6 }).ok, false, 'guests don’t chop');
  assert.deepEqual(run(farm, host, { t: 'chop', c: 11, r: 6 }), []);
  run(farm, host, { t: 'chop', c: 11, r: 6 });
  const fx = run(farm, host, { t: 'chop', c: 11, r: 6 });
  assert.deepEqual(fx, [
    { e: 'give', who: 'host', item: 'wood', n: 8 },
    { e: 'give', who: 'host', item: 'acorn', n: 2 },
  ]);
  assert.ok(!farm.trees.includes(oak));
  // The orchard's old trees are on your land too.
  assert.ok(applyIntent(farm, host, { t: 'chop', c: 2, r: 7 }).ok);
});

test('apple trees bear apples to pick, which grow back; felled, they give apple wood and apple seeds', () => {
  const farm = createFarm('host', 'Hana');
  const [c, r] = ORCHARD_TREES[0];
  // Anyone may pick: the owner into their bag, a guest into storage.
  assert.deepEqual(run(farm, host, { t: 'pick', c, r }), [{ e: 'give', who: 'host', item: 'apple', n: 3 }]);
  assert.equal(applyIntent(farm, host, { t: 'pick', c, r }).ok, false, 'picked bare');
  sleep(farm);
  sleep(farm);
  assert.equal(applyIntent(farm, guest, { t: 'pick', c, r }).ok, false, 'not back yet after 2 nights');
  sleep(farm);
  assert.deepEqual(run(farm, guest, { t: 'pick', c, r }), []);
  assert.equal(farm.storage.apple, 3, 'back after 3 nights; a guest picks into storage');
  // Felled: apple wood (not plain wood) and its seeds.
  run(farm, host, { t: 'chop', c, r });
  run(farm, host, { t: 'chop', c, r });
  assert.deepEqual(run(farm, host, { t: 'chop', c, r }), [
    { e: 'give', who: 'host', item: 'apple-wood', n: 5 },
    { e: 'give', who: 'host', item: 'seed-apple', n: 2 },
  ]);
});

test('DEV tools: grow everything planted at once, and ripen the fruit trees (host only)', () => {
  const farm = createFarm('host', 'Hana');
  run(farm, host, { t: 'plant', ...T, seed: 'seed-turnip', from: 'self' });
  run(farm, host, { t: 'plant', c: 20, r: 14, seed: 'acorn', from: 'self' });
  assert.equal(applyIntent(farm, guest, { t: 'devGrow' }).ok, false, 'guests cannot');
  run(farm, host, { t: 'devGrow' });
  assert.ok(isRipe(farm.tiles[tileIndex(T.c, T.r)].crop!));
  assert.equal(farm.trees.find((t) => t.c === 20 && t.r === 14)!.stage, 4);
  const [c, r] = ORCHARD_TREES[0];
  run(farm, host, { t: 'pick', c, r });
  assert.equal(applyIntent(farm, host, { t: 'pick', c, r }).ok, false);
  run(farm, host, { t: 'devFruit' });
  assert.deepEqual(run(farm, host, { t: 'pick', c, r }), [{ e: 'give', who: 'host', item: 'apple', n: 3 }]);
});

test('a planted seed grows into a tree by itself, a stage every few nights', () => {
  const farm = createFarm('host', 'Hana');
  run(farm, host, { t: 'plant', c: 20, r: 14, seed: 'acorn', from: 'self' });
  const tree = farm.trees.find((t) => t.c === 20 && t.r === 14)!;
  assert.equal(tree.stage, 0);
  assert.match((applyIntent(farm, host, { t: 'plant', c: 21, r: 14, seed: 'acorn', from: 'self' }) as { reason: string }).reason, /room/);
  assert.equal(applyIntent(farm, guest, { t: 'plant', c: 20, r: 16, seed: 'acorn', from: 'storage' }).ok, false);
  for (let d = 0; d < 8; d++) sleep(farm);
  assert.equal(tree.stage, 4, 'grown after 8 nights (oak: 2 per stage)');
  // A seedling just comes up whole.
  run(farm, host, { t: 'plant', c: 20, r: 17, seed: 'pinecone', from: 'self' });
  assert.deepEqual(run(farm, host, { t: 'chop', c: 20, r: 17 }), [{ e: 'give', who: 'host', item: 'pinecone', n: 1 }]);
});

test('version-6 saves get the farm’s trees', () => {
  const farm = createFarm('host', 'Hana');
  const old = asPreV10(farm) as Omit<FarmState, 'trees'> & { trees?: unknown };
  old.version = 6;
  delete old.trees;
  const migrated = migrateFarm(old)!;
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.trees.length, farm.trees.length);
});

test('version-8 saves: the house’s rooms move out to column 160', () => {
  const farm = createFarm('host', 'Hana');
  const old = asPreV10(farm);
  old.version = 8;
  for (const p of old.placements) if (p.c >= 160) p.c -= 72;
  const migrated = migrateFarm(old)!;
  assert.deepEqual(migrated.placements, farm.placements);
});
