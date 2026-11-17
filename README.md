# Meadowfolk

A cozy 3D farm-life game in a clay diorama, built for the browser and for playing with friends. Grow crops, raise chickens, sell to the town, and spend it on land and on a villa you build piece by piece. No combat, ever.

This is the first public **slice** of the design (`docs/2026-11-16-cozy-farm-game-design.md`, §9.1): Spring only (28 days, then Spring again), four crops, chickens, a Tier-1 villa with the basic kit (Tiers 2–3 purchasable), the home plot plus two parcels, a General Store and a Carpenter, the shipping bin, drop-in co-op with the thank-you tip, and accounts/saves.

## Run it

```bash
npm install
npm --prefix relay install
npm run dev          # the game:  http://localhost:3000
npm run relay        # co-op relay on :2567 (only needed to play together)
npm test             # farm-sim unit tests (incl. the host/guest replica check)
npm run lint
npx tsc --noEmit
```

Copy `.env.example` to `.env.local` to configure things. Everything is optional:

- **No Supabase** → saves live in this browser's localStorage (fine for development; a cleared browser loses the farm).
- **Supabase** → run `supabase/schema.sql` in a new project, enable *anonymous sign-ins*, set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the web build and `SUPABASE_URL` for the relay (it then checks every player's JWT).
- **Relay URL** → `NEXT_PUBLIC_RELAY_URL` (defaults to `ws://<page host>:2567`).

`docker compose up --build` runs the game and the relay together.

To try co-op on one machine, open a second browser profile (or add `?profile=2` to the URL for a separate local profile), press **C** on the host to open the farm, and open the join link in the other.

## How to play

| Input | Action |
|---|---|
| WASD / Arrows | Walk (Shift to run) |
| E | Talk, shop, open the chest or shipping bin, tend the coop, sleep, pet |
| F / Click | Use the tool in hand on the tile you face |
| 1–9 | Pick hoe, watering can, seeds, fertilizer |
| B | Build mode (your farm only): click to place, right-click / X to pick up, R rotate, Ctrl+Z undo, WASD pans |
| I / Tab | Your bag |
| C | Play together (open your farm, or visit a friend by code) |
| T / Enter | Chat (in co-op) |
| Esc | Close / pause |

The day runs 6 AM → 2 AM over 15 real minutes. Watered crops grow a stage overnight; unwatered ones simply wait. Ship produce in the bin — it pays the next morning. Shops keep hours (9 AM–5 PM, the carpenter till 4). Nothing dies, nothing is lost.

**Co-op**: the host's browser runs the farm; guests send intents, the host applies them and relays the accepted ones. Guests water, harvest (into the host's storage), plant from the host's storage, feed and pet animals, and shop with their own gold. They can't build, buy land, take from storage or end the day. When the host sleeps, a 20-second countdown runs for everyone; at day end (or when a guest leaves) the host gets a one-screen summary and may tip each guest.

A player named `DEV` starts a new farm with 50,000g and may shop out of hours. `?debug` exposes `window.__meadow` (`teleport(x, z, face)`, `player()`, `session()`, `farm()`, `profile()`).
