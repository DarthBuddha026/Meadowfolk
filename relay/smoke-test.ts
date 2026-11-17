/**
 * Relay smoke test: a host opens a farm, a guest joins by code, the guest's intent reaches the
 * host, the host's delta and snapshot reach the guest, positions and chat go round, a second host
 * can't take the code, and the guest is told when the host leaves.
 *   npm start   (in one terminal)   then   npx tsx smoke-test.ts
 */
import { Client } from '@colyseus/sdk';

const url = process.env.RELAY ?? 'ws://localhost:2567';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => results.push([name, ok]);

const code = 'TEST' + Math.floor(Math.random() * 90 + 10);
const host = await new Client(url).create('farm', { code, role: 'host', playerId: 'host-1', name: 'Hana', look: 'farmer' });
const got: Record<string, unknown[]> = {};
const log = (who: string) => (type: string | number, msg: unknown) => (got[`${who}:${type}`] ??= []).push(msg);
host.onMessage('*', log('host'));
host.onMessage('need-snapshot', (m: { sid: string }) => host.send('snapshot', { to: m.sid, farm: { name: "Hana's Farm" } }));
host.onMessage('intent', (m: { from: { id: string }; intent: unknown }) => {
  log('host')('intent', m); // a specific handler takes the message from the '*' one
  host.send('delta', { actor: m.from, intent: m.intent });
});

const guest = await new Client(url).join('farm', { code, role: 'guest', playerId: 'guest-1', name: 'Gus', look: 'fisher' });
guest.onMessage('*', log('guest'));
let hostLeft = false;
guest.onMessage('host-left', () => (hostLeft = true));
guest.onLeave(() => (hostLeft = true));
await wait(400);

guest.send('intent', { intent: { t: 'water', c: 22, r: 9 } });
guest.send('pos', { x: 1, z: 2, f: 0, s: 3 });
guest.send('chat', { text: 'hello!' });
host.send('clock', { minute: 120 });
await wait(400);

check('guest received a snapshot', (got['guest:snapshot'] ?? []).length === 1);
check('host saw the guest intent with the guest id', JSON.stringify(got['host:intent']).includes('guest-1'));
check('guest received the delta back', JSON.stringify(got['guest:delta']).includes('water'));
check('host received the guest position', (got['host:pos'] ?? []).length === 1);
check('host received chat', JSON.stringify(got['host:chat']).includes('hello'));
check('guest received the clock', JSON.stringify(got['guest:clock']).includes('120'));
check('players list has both', JSON.stringify((got['guest:players'] ?? []).at(-1)).includes('Gus'));

let blocked = false;
try {
  await new Client(url).create('farm', { code, role: 'host', playerId: 'x', name: 'X' });
} catch {
  blocked = true;
}
check('a second farm cannot take the same code', blocked);

let noFarm = false;
try {
  await new Client(url).join('farm', { code: 'NOPE99', role: 'guest', playerId: 'y', name: 'Y' });
} catch {
  noFarm = true;
}
check('joining an unknown code fails', noFarm);

let ownFarm = false;
try {
  await new Client(url).join('farm', { code, role: 'guest', playerId: 'host-1', name: 'Hana again' });
} catch {
  ownFarm = true;
}
check('you cannot visit your own farm from a second tab', ownFarm);

await host.leave(true);
await wait(500);
check('guest is told the host left', hostLeft);

for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
process.exit(results.every(([, ok]) => ok) ? 0 : 1);
