import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kitItem, sellPrice } from './content';
import { houseEntry, inHouseArea, shellDoors, tileAt, tileIndex, underShell } from './farm-map';
import { applyIntent, cloneFarm, createFarm, cropStage, isRipe, migrateFarm, placementProblem, SAVE_VERSION } from './sim';
import type { Actor, Effect, FarmState, Intent } from './types';

const host: Actor = { id: 'host', name: 'Hana' };
const guest: Actor = { id: 'guest', name: 'Gus' };
const T = { c: 23, r: 12 }; // a starter tilled tile

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
    { t: 'place', piece: 'fence', c: 20, r: 12, rot: 0, color: 0 },
    { t: 'buyParcel', parcel: 'orchard' },
    { t: 'withdraw', item: 'turnip', n: 1 },
    { t: 'till', c: 12, r: 12 },
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
  run(farm, host, { t: 'place', piece: 'coop', c: 30, r: 12, rot: 0, color: 1 });
  const coop = farm.placements[farm.placements.length - 1].id;
  run(farm, host, { t: 'buyAnimal', kind: 'chicken', coop, name: 'Pip' });
  run(farm, host, { t: 'feed', coop, from: 'self' });
  sleep(farm);
  const fx = run(farm, host, { t: 'collect', coop });
  assert.deepEqual(fx, [{ e: 'give', who: 'host', item: 'egg', n: 1 }]);
  assert.equal(applyIntent(farm, host, { t: 'remove', id: coop }).ok, false, 'occupied coops stay');
});

test('villa pieces stay inside the footprint; land must be owned', () => {
  const farm = createFarm('host', 'Hana');
  assert.match(placementProblem(farm, 'wall', 26, 12, 0) ?? '', /inside the house/);
  assert.match(placementProblem(farm, 'fence', 3, 5, 0) ?? '', /own/);
  run(farm, host, { t: 'buyParcel', parcel: 'orchard' });
  assert.equal(placementProblem(farm, 'fence', 3, 5, 0), null);
  const fx = run(farm, host, { t: 'place', piece: 'fence', c: 3, r: 5, rot: 0, color: 7 });
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
    [host, { t: 'till', c: 13, r: 13 }],
    [guest, { t: 'till', c: 13, r: 14 }], // rejected: never reaches the replica
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

test('version-1 saves get the new house; furniture that stood in the way goes to storage', () => {
  const farm = createFarm('host', 'Hana');
  const old = JSON.parse(JSON.stringify(farm)) as FarmState;
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
  const old = JSON.parse(JSON.stringify(farm)) as FarmState;
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
  const oak = farm.trees.find((t) => t.kind === 'oak' && t.c === 11 && t.r === 2)!;
  assert.ok(oak, 'a wild oak stands on the home plot');
  assert.equal(applyIntent(farm, guest, { t: 'chop', c: 11, r: 2 }).ok, false, 'guests don’t chop');
  assert.deepEqual(run(farm, host, { t: 'chop', c: 11, r: 2 }), []);
  run(farm, host, { t: 'chop', c: 11, r: 2 });
  const fx = run(farm, host, { t: 'chop', c: 11, r: 2 });
  assert.deepEqual(fx, [
    { e: 'give', who: 'host', item: 'wood', n: 8 },
    { e: 'give', who: 'host', item: 'acorn', n: 2 },
  ]);
  assert.ok(!farm.trees.includes(oak));
  // Orchard trees stand on land you don't own yet.
  assert.match((applyIntent(farm, host, { t: 'chop', c: 2, r: 3 }) as { reason: string }).reason, /own/);
});

test('a planted seed grows into a tree by itself, a stage every few nights', () => {
  const farm = createFarm('host', 'Hana');
  run(farm, host, { t: 'plant', c: 20, r: 10, seed: 'acorn', from: 'self' });
  const tree = farm.trees.find((t) => t.c === 20 && t.r === 10)!;
  assert.equal(tree.stage, 0);
  assert.match((applyIntent(farm, host, { t: 'plant', c: 21, r: 10, seed: 'acorn', from: 'self' }) as { reason: string }).reason, /room/);
  assert.equal(applyIntent(farm, guest, { t: 'plant', c: 20, r: 12, seed: 'acorn', from: 'storage' }).ok, false);
  for (let d = 0; d < 8; d++) sleep(farm);
  assert.equal(tree.stage, 4, 'grown after 8 nights (oak: 2 per stage)');
  // A seedling just comes up whole.
  run(farm, host, { t: 'plant', c: 20, r: 13, seed: 'pinecone', from: 'self' });
  assert.deepEqual(run(farm, host, { t: 'chop', c: 20, r: 13 }), [{ e: 'give', who: 'host', item: 'pinecone', n: 1 }]);
});

test('version-6 saves get the farm’s trees', () => {
  const farm = createFarm('host', 'Hana');
  const old = JSON.parse(JSON.stringify(farm)) as Omit<FarmState, 'trees'> & { trees?: unknown };
  old.version = 6;
  delete old.trees;
  const migrated = migrateFarm(old)!;
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.trees.length, farm.trees.length);
});

test('version-8 saves: the house’s rooms move out to column 160', () => {
  const farm = createFarm('host', 'Hana');
  const old = JSON.parse(JSON.stringify(farm)) as FarmState;
  old.version = 8;
  for (const p of old.placements) if (p.c >= 160) p.c -= 72;
  const migrated = migrateFarm(old)!;
  assert.deepEqual(migrated.placements, farm.placements);
});
