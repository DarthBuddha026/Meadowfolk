import { defineRoom, defineServer, WebSocketTransport } from 'colyseus';
import { FarmRoom } from './farm-room.js';

/**
 * Meadowfolk's co-op relay. One small process is enough at launch scale (a single VPS or
 * container — Fly.io, Railway). PORT defaults to 2567; point the web build at it with
 * NEXT_PUBLIC_RELAY_URL (e.g. wss://relay.example.com).
 */
const server = defineServer({
  // A farm snapshot (the whole sim state, sent once per guest) is tens of KB; the default cap is 4 KB.
  transport: new WebSocketTransport({ maxPayload: 1024 * 1024 }),
  rooms: {
    // Guests join the room whose code they were given.
    farm: defineRoom(FarmRoom).filterBy(['code']),
  },
});

const port = Number(process.env.PORT ?? 2567);
await server.listen(port);
console.log(`[relay] Meadowfolk relay listening on :${port}${process.env.SUPABASE_URL ? ' (Supabase auth on)' : ' (dev: no auth)'}`);
