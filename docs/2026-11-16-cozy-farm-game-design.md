# Meadowfolk — Design

**Title:** Meadowfolk (owner decision)
**Date:** 2026-11-16
**Status:** draft for owner approval
**Owner:** Leeroy (full-stack web developer; solo or very small team)

Everything in this document is one of three things:

- **Decided by the owner** in conversation. Marked plainly or in the "Decisions" section.
- **Proposed by the author** with a reason. Marked "(proposal)". The owner has seen each of these and has not objected, but they are not the owner's words.
- **Left to the builder.** Collected in the last section.

---

## 1. Intent and the why

A cozy 3D farm-life game, built to **ship and sell**, that the owner can **play with friends at the same time**. The fun comes from a few connected loops:

1. **Farm.** Grow crops, raise animals, turn raw produce into products.
2. **Sell.** Sell what you make to an NPC town with shops and prices.
3. **Spend.** Buy farm gear, build and style your own villa, upgrade it, and buy more land.
4. Repeat, bigger.

The villa is the long-term "show-off" piece. Land expansion is the pacing lever. Friends can **drop into your farm** to help and hang out.

Two things make it *this* game rather than another farm sim:

- **No combat, ever.** No enemies, no health, no weapons, no mines. Everything is farming, building, selling, and visiting.
- **The world is a clay diorama.** Chunky, rounded, matte, warm. One connected miniature you walk through on foot. The villa is assembled from a modular clay kit, so "style it to my liking" is literal.

Why web-first: the owner builds websites for a living, and a web build means friends can join with a link and no install. The web version is free and acts as the demo and the marketing; a paid desktop version on Steam comes later.

---

## 2. Goals

- A **complete, finishable first version** that can be sold: one region, one town, a full year of seasons, a villa with a real upgrade path, land to expand into.
- **Single-player and co-op are the same game.** Single-player is "host with zero guests." Co-op is never an afterthought and never a separate mode.
- **Co-op is drop-in, low-stakes, and generous.** A friend can join, help, and leave without the host ever worrying about their stuff.
- **Runs well in a browser** on a mid-range laptop, with no install.
- **Zero to near-zero running cost** at launch scale, growing slowly with players.
- **Saves are safe.** A villa with 40 hours in it never disappears because someone cleared their browser.

## 3. Non-goals (not in the first version; may come later)

- Player-to-player trading or a player market. Selling is to the NPC town only.
- A persistent shared world, towns with many players, or dedicated servers.
- Mobile/touch as a primary platform. The web build should not break on a tablet, but it is designed for keyboard + mouse (and gamepad later).
- Mod support.
- Romance, story arcs, or deep NPC relationship systems. NPCs are shopkeepers and townsfolk with a bit of personality, not dating sim characters.
- Multiple biomes or regions. One region, done well.

## 4. Anti-goals (what would make this a failure even if it technically works)

- **It feels like a Stardew clone with worse combat.** No combat means the farm, villa and town have to carry the whole game. If the villa builder is shallow, the game is shallow.
- **Co-op that feels restrictive.** The guest model is deliberately limited (see §7), and the thank-you mechanic exists so the limits read as "safe," not "stingy." If guests feel useless, the co-op is a failure.
- **Grind.** A cozy game should never make the player feel they *must* log in. Days are short, nothing rots overnight, nothing punishes absence.
- **Pay-to-win or nag monetization.** The free web version has no microtransactions and no ads (proposal). The paid Steam version is a different product, not a key to content the web player already saw.
- **A tech demo.** A beautiful Three.js scene with nothing to do is the most common way web games die.

---

## 5. Constraints

- **Platform:** browser, 3D via **Three.js**. Deployed online.
- **Team:** a full-stack web developer, solo or nearly so. Choose boring, well-documented tools over clever ones.
- **Business:** free web version first, paid Steam version later (web build wrapped in Electron).
- **Co-op topology:** the host's farm is the only persistent world; guests bring their own character. No peer-to-peer; a small relay server in the middle.
- **Art:** everything must be producible in Blender and exported as glTF, in one consistent clay style. The modular kit is the art budget, not a hundred bespoke buildings.
- **No combat** constrains every system: no durability, no health, no damage, no "danger" content anywhere.

---

## 6. Approaches considered

All three keep Three.js and web-first; they differ in how much is hand-written and where the farm simulation runs.

### A. Lean and hand-rolled
Plain Three.js with a custom game loop and scene management, HTML/CSS overlays for menus, a hand-written Node WebSocket server for rooms and relaying, Postgres for accounts and saves.
*Trade-off:* smallest bundle and total control, but rooms, reconnection, join codes, state sync, and the villa-builder UI are all written and debugged from scratch — weeks of work that isn't the game.

### B. React Three Fiber + shared simulation package + Colyseus + Supabase — **chosen**
The farm simulation is a pure TypeScript package with no Three.js or React in it. The host's browser runs it; React Three Fiber renders what it says; the villa builder and menus are ordinary React. Colyseus provides rooms, join codes, reconnection and relay. Supabase provides accounts and cloud saves.
*Trade-off:* R3F punishes game state leaking into React, so the "sim outside React" discipline has to hold. Colyseus prefers to be the authority, so the relay room is a thin custom one where the host is trusted.

### C. Server-authoritative simulation
Same stack as B, but the simulation runs on the Colyseus server and everyone, host included, is a client.
*Trade-off:* bulletproof co-op (farm keeps going if the host's tab sleeps), but single-player also needs a server, which rules out offline play for the Steam version, and server cost grows with every active farm.

**Why B:** it fits a web developer's skills, keeps running costs near flat, and because the simulation is its own package, moving it to the server later (B → C) stays possible if co-op takes off.

### Networking: relay vs. browser-to-browser
Considered an introduction (signaling) server + WebRTC between browsers. Rejected: 10–20% of players sit behind networks where browser-to-browser fails, so a relay is needed anyway as fallback; WebRTC data channels are painful to debug; a farm game's traffic is tiny. **Decision: WebSocket relay, host-owned simulation.**

### Time: day-based vs. real-time
Considered a gentle real-time clock with no day end. Rejected: less rhythm, and "check-in" pressure. **Decision: day-based, Stardew-style, with the host ending the day.**

### Selling: NPC town vs. player market
**Decision: NPC town with shops and prices.** A player market is a non-goal.

---

## 7. Decisions — how the game works

### 7.1 The core loop

```
   ┌──────────┐    harvest / produce    ┌───────────┐
   │   FARM   │ ──────────────────────► │  PRODUCTS │
   └──────────┘                         └───────────┘
        ▲                                     │ sell to town
        │ buy seeds, animals, tools           ▼
   ┌──────────┐      buy land / kit     ┌───────────┐
   │   LAND   │ ◄────────────────────── │   GOLD    │
   │  VILLA   │                         └───────────┘
   └──────────┘
```

Every gold source is the town; every gold sink is the farm, the villa, or land. There is no gold from nothing and no gold sink that doesn't change the world.

### 7.2 Time (owner decision: day-based, Stardew-style)

- A day is a fixed number of real minutes. **Proposal: 15 minutes**, tuned in playtesting. The clock runs 6:00 → 2:00 in-game.
- Crops advance one growth stage per day. Animals produce once per day. Shops have opening hours.
- The day ends when the **host** sleeps. Overnight the farm "settles": crops grow, animals produce, the shipping bin pays out, the season ticks if it's the last day, and the game **saves**.
- **Pausing (author's call).** In single-player the clock pauses in menus, shops and build mode. In co-op the clock **never pauses**: building or shopping costs the host farm time, same as it does any other player, so guests are never frozen waiting for the host. The sim is **wall-clock driven** (it computes elapsed time from timestamps, not from counting frames), so if the host's tab is throttled in the background it catches up on return rather than losing time; the host's sim runs in a Web Worker to soften throttling further. If the host is gone long enough that guests see no updates (proposal: 30 s), guests get a "host is away" banner, and the normal host-disconnect rules apply after the relay's reconnection grace.
- Nothing bad happens overnight. No crop death from a missed watering (unwatered crops simply don't advance). No animal unhappiness penalties beyond reduced output. (proposal, in service of the "no grind" anti-goal)
- **Seasons:** four seasons of 28 days (proposal). Crops are seasonal; out-of-season crops don't grow. A greenhouse (a villa upgrade) removes that limit.
- **Passing out:** if the clock hits 2:00 and the host hasn't slept, the day ends automatically; no penalty beyond waking up a little late. (proposal)

### 7.3 Co-op (owner decisions, with proposals marked)

**Topology.** One player **hosts**; their farm is the world. Up to **4 players** total (host + 3 guests) (proposal; the limit is a tuning knob). Guests join by a short **join code** the host shares, or a link that carries it. The host's browser runs the simulation; a relay server passes messages. Single-player is a host with zero guests and no server connection needed for the sim (the server is still used for login and saves).

**Join flow (owner decision: instant guest, upgrade later).** A first-time friend who opens a join link picks a quick look (a few clay heads, hair, outfits, colors; no sliders) and is on the farm within seconds. Under the hood they get an **anonymous Supabase account**, which is a real account with a real profile (character, inventory, gold) and a real JWT for the relay, so nothing else in the design changes. At any later point they can attach an email to keep that account across devices and browser clears; the game nudges them once after their first visit and once if they ever host a farm, never more. The trade-off they accept by not attaching: an anonymous account lives in one browser, and clearing site data loses it. Anonymous accounts can host their own farm too, with the same nudge.

**What a guest can do** (owner decision: "they just help and hang out, with their own wallet separate from mine"):

| Guest can | Guest cannot |
|---|---|
| Walk anywhere on the host's farm and in town | Place, move or remove anything on the farm or in the villa (build mode is host-only everywhere) |
| Water, harvest, plant seeds **from the host's storage**, feed animals, pick up dropped items | Buy land, buy villa upgrades, or spend the host's gold |
| Put what they harvest into the host's storage / shipping bin | Take items out of the host's storage into their own inventory |
| Shop in town with **their own gold**; what they buy goes home with them | Sell the host's items for their own gold |
| Use the host's processing machines on the host's materials | Change farm settings, kick other guests, or end the day |
| Chat (text) and emote | Trigger the sleep/day-end |

**Guest identity.** A guest's character, inventory and gold live on their own account. They look and carry the same at home and when visiting.

**One wallet per player (author's call).** Gold belongs to the **player profile**, never to the farm save. The host's shipping bin and market sales pay into the host's profile; land, villa tiers and kit pieces are bought from the host's profile; a visiting guest shops from their own profile. A player therefore has exactly one gold number wherever they are, and there is nothing to explain in the UI. The farm save holds items, buildings and state, not money.

**Who writes a profile (author's call).** Each player's own client writes their own profile (inventory, gold, character) under Supabase row-level security; nobody else can. This means a player can, with effort, edit their own economy. That is accepted: there is no competition, no trading, and no way for a cheated wallet to touch anyone else's farm, so **anti-cheat is a non-goal**. The one cross-player write, the thank-you tip, goes through a **`gifts` table**: the host inserts a row (sender = self, enforced by policy; recipient; item or gold; farm id), and the recipient's client claims it on next login or on the spot if still connected. The relay stays relay-only; no edge function is needed for v1.

**Day end in co-op.** The host sleeping starts a short countdown (proposal: 20 seconds) that guests see. When it ends, everyone's day rolls over together.

**Thank-you mechanic** (owner accepted the proposal). When a guest leaves, or at day end, the host sees a one-screen summary of what each guest did that day (watered 24 tiles, harvested 18 turnips, fed 3 animals). The host can tip each guest from the farm's storage — a crate of produce, some gold, or nothing — in one tap. Optional, never required, never prompted twice. The tip arrives in the guest's own inventory/wallet.

**Disconnects.** If a guest drops, nothing is lost: the host's farm is the only persistent thing, and the guest's own stuff lives on their account. If the **host** drops, the session ends for guests with a clear message; the host's last save is intact. Host migration is a non-goal for v1.

**Visiting symmetry.** Any player can host their own farm and visit others. "Join a friend" and "host my farm" are the only two multiplayer actions.

### 7.4 The economy (owner decision: NPC town with shops and prices)

- **One town**, walkable from the farm. Proposal for v1 shops:
  - **General store** — seeds (seasonal stock), basic tools, cooking ingredients.
  - **Carpenter** — villa kit pieces, villa upgrades, land parcels.
  - **Rancher** — animals, feed, animal buildings.
  - **Shipping bin** (on the farm) — sell anything at base price overnight.
  - **Market stall** (in town, proposal) — sells produce at a better price during the day, with a small daily "wanted" bonus on one or two items to give the day a goal.
- **Prices:** fixed base prices per item, with a quality multiplier (normal / good / great) based on soil and care. No dynamic market simulation in v1. (proposal)
- **Processing:** raw → product machines on the farm (proposal: a keg or jam press, a cheese press, a loom), each taking 1–3 days, each a meaningful price multiplier. These are the mid-game money.
- **Money pacing target (proposal):** first land parcel affordable by mid-Spring of year 1; first villa tier by early Summer; greenhouse by Fall; the final villa tier and last parcel around the end of year 1. A player who keeps going into year 2 has everything and is playing for the villa.

### 7.5 The villa

The villa is the owner's long-term goal and the reason the modular kit exists.

- **Built from a modular clay kit**: wall segments, doors, windows, roof pieces, floors, stairs, porch pieces, fences, paths, lanterns, furniture, plants. Every piece snaps to a grid.
- **Footprint tiers** (proposal, three tiers): the villa starts as a one-room cottage on a fixed footprint. Buying a tier from the carpenter enlarges the allowed footprint (and the number of storeys allowed), and unlocks new kit categories. Within the footprint the player builds freely.
  - Tier 1: one storey, small footprint, basic kit.
  - Tier 2: two storeys, larger footprint, porch and garden kit, a kitchen upgrade (unlocks cooking).
  - Tier 3: three storeys / wing, greenhouse attachment available, full decorative kit.
- **Build mode is one editor for the whole farm (author's call).** The camera pulls up and the kit palette appears, and the host places anything the farm owns anywhere on tiles they own: fences, paths, lanterns, plants, animal buildings, processing machines, and villa pieces. The **villa footprint tier only constrains villa structure pieces** (walls, floors, roofs, stairs, storeys); everything else goes wherever the host likes. Pieces are placed, rotated in 90° steps, and recolored from a palette of clay colors. Undo is unlimited within a session. Build mode is host-only. In the save, every placed thing is one "placement" record (kit piece id, tile, rotation, color, storey) so the villa and the farm layout share one schema.
- **Interior and exterior** are both buildable. Furniture is functional where it makes sense (bed = sleep, kitchen = cook, chest = storage) and decorative otherwise.
- **The 40-hour villa** should visibly carry its history: a porch added in Spring, a second storey in Summer, a greenhouse wing in Fall. Upgrades enlarge what's allowed; they never replace what the player built.

### 7.6 Land

- The farm is a grid of tiles. The starting plot is small (proposal: 24 × 24 tiles usable).
- **Parcels** adjacent to the farm can be bought from the carpenter (proposal: four parcels, each roughly the size of the starting plot, with a rising price). Buying a parcel clears the fence and the land is immediately usable: for crops, animals, buildings, or villa footprint.
- Parcels have character (proposal): one is by the river (fishing-free, just pretty and good soil), one is a meadow (good for animals), one is an orchard with existing fruit trees, one is a hillside with a view.
- **The playable grid is flat (author's call).** Every tile the player can walk on or build on is at one height. Rivers, hills and the "view" are scenery around and beyond the grid, not elevation inside it; the hillside parcel is a flat plateau whose edge drops away to the view. This keeps the character controller, placement rules and camera simple and the kit free of ramps and terraces.

### 7.7 Farming content (v1 scope, proposal)

Deliberately small and complete rather than large and thin.

- **Crops:** about 12, three per season, each with 3–5 growth stages visible in the clay style. At least two per season are multi-harvest (regrow) so the mid-season isn't idle.
- **Animals:** chickens (eggs), cows (milk), sheep (wool). Each needs a building from the rancher, daily feed, and gives one product per day. Petting raises happiness, happiness raises quality.
- **Processing:** three machines (see §7.4).
- **Cooking:** unlocked by the Tier 2 kitchen; a short recipe list (proposal: ~10) that sells for more than ingredients and can be tipped to guests.
- **Tools:** hoe, watering can, scythe, axe (for clearing debris and existing trees on parcels), hammer (build mode). Two upgrade levels each from the general store, bought with gold (no ore, no smithing, no mines).
- **Foraging:** a few seasonal forageables around the farm edges and in town to give the walk somewhere to go.

### 7.8 The town and NPCs

- A small walkable town, in the same diorama as the farm (no loading screen between them).
- Shopkeeper NPCs with names, a line or two of personality, opening hours, and a seasonal line. They stand in their shop and wander a little. No friendship meters in v1.
- The town is where guests see the other side of the world when they're not helping.

### 7.9 Art direction (owner reference: WoraWork / TRIOE "clay diorama" look)

- **Clay diorama.** Chunky, rounded forms with thick walls and soft edges. Trees as stacked blobs. Flowers as dots of color. Pebble paths. Everything looks pinched from modeling clay.
- **Flat, matte, warm.** Saturated but soft palette: grass green, terracotta roofs, cream walls, teal water. No realistic textures. Color comes from materials, not texture maps.
- **Lighting does the work.** Soft shadows, a warm key light, a toon-ish shading step and a gentle rim/outline so kit pieces look coherent however they're assembled. Day-night cycle shifts the key light color and sky.
- **Camera.** High, tilted, looking down into the model, following a small character on foot. Build mode pulls up further.
- **One connected miniature.** Farm, path, town: one scene, no loading screens.
- **Pipeline.** Blender → glTF (Draco-compressed), one consistent unit scale and pivot convention for every kit piece, a shared material palette. A free clay/low-poly asset pack is acceptable for prototyping; the shipped game uses its own kit.

### 7.10 Business and platforms

- **Web version:** free, in-browser, accounts required (for saves and co-op). No microtransactions, no ads (proposal).
- **Steam version:** paid, later, the web build wrapped in Electron. It needs a reason to buy when the web version is free. **Open question for the owner**, deferred until after the web launch; candidates are offline play with local saves, Steam cloud saves and achievements, and content past where the web build stops.
- The relay server works unchanged inside Electron.

---

## 8. Decisions — how it's built

### 8.1 Stack (approach B)

| Layer | Choice | Why |
|---|---|---|
| Rendering | **Three.js** via **React Three Fiber** + **drei** | Owner's choice of Three.js; R3F fits a React developer and makes scene composition declarative. |
| UI | **React** (menus, villa builder palette, shop screens, HUD) | Same toolchain as the web work the owner already does. |
| Game state | **Shared simulation package** (`packages/sim`), pure TypeScript, no Three.js, no React | Runs in the host's browser now; could run on the server later. Deterministic given inputs. Fully unit-testable. |
| Client build | **Vite** | A game is one page; Next.js adds nothing here. (If a marketing site is wanted, it's a separate Next or static site.) |
| Networking | **Colyseus** (server) + Colyseus JS client | Rooms, join codes, reconnection, message relay for free. |
| Accounts & saves | **Supabase** (Auth + Postgres + Storage) | Accounts and cloud saves in a day; row-level security protects each player's save. |
| Physics | **None.** Grid-based collision in the sim. | A farm doesn't need a physics engine. |
| Audio | **Howler.js** | Simple, well-trodden. |
| Language | **TypeScript** everywhere | One language across sim, client and server. |
| Repo | **pnpm monorepo**: `packages/sim`, `apps/web`, `apps/relay` | Lets the sim package be shared and tested in isolation. |

### 8.2 Architecture

```
┌─────────────── apps/web (host browser) ────────────────┐
│  React UI  ◄──►  packages/sim  ◄──►  R3F scene         │
│  (menus,          (tiles, crops,      (reads sim state   │
│   builder)         animals, economy,   each frame,       │
│                    day rollover)       never owns it)    │
│                        ▲   │                             │
│        intents from    │   │  state deltas +             │
│        guests          │   ▼  snapshots                  │
└────────────────────────┼───┼─────────────────────────────┘
                         │   │
                  ┌──────┴───┴──────┐        ┌────────────┐
                  │  apps/relay     │        │  Supabase  │
                  │  (Colyseus)     │        │  auth +    │
                  │  FarmRoom:      │        │  saves     │
                  │  trusts host,   │        └────────────┘
                  │  relays only    │              ▲
                  └──────┬───┬──────┘              │ host saves
                         │   │                     │ at day end
┌────────────────────────┼───┼─────────────────────┼─────────┐
│  guest browser         ▼   │                     │         │
│  React UI  ◄──►  sim (replica, read-only) ◄──► R3F scene   │
│  sends intents ("water tile 12,7") ───────────────────►    │
└────────────────────────────────────────────────────────────┘
```

**The host is the authority.** Guests send *intents*. The host's sim validates and applies them and emits *deltas*. The relay forwards deltas to all guests, who apply them to a read-only replica. On join, the host sends a full *snapshot*. Character positions are sent as lightweight unreliable-style updates (10 Hz, proposal) and interpolated; they are not part of the saved state.

**The sim is deterministic and input-driven.** Given the same starting state and the same ordered list of intents and ticks, it produces the same result. This makes it testable, replayable for bug reports, and movable to the server later.

**Rendering reads, never writes.** R3F components read sim state via a store (proposal: Zustand with a transient subscribe, or a plain ref the frame loop reads) and never mutate it. Instanced meshes for tiles, crops and kit pieces; the villa is rebuilt into instanced batches when build mode exits.

### 8.3 Saves

- A save is the **serialized sim state** of one farm: tiles, crops, animals, placements (buildings, machines, fences, villa pieces), storage, calendar, settings. No gold (see §7.3). JSON, versioned with a schema number and a migration function per version.
- Saved to Supabase at every day end, on leaving the game, and every N minutes as a safety net (proposal: 5). One current save per farm plus a short rolling history (proposal: last 3 day-ends) so a corrupted save can be rolled back.
- A **player profile** (character appearance, personal inventory, gold) is a separate record; it's what travels when visiting. A **`gifts`** table carries thank-you tips between players (see §7.3).
- Supabase **anonymous sign-in** is enabled so instant guests get real accounts (see §7.3); the relay accepts their JWTs like any other.
- Local browser storage is a cache only, never the source of truth.

### 8.4 Relay server

- One Colyseus `FarmRoom` per hosted session, created when a host "opens the farm," closed when the host leaves.
- Join codes: short, human-typeable (proposal: 6 characters), mapped to room ids, expiring with the room.
- The room authenticates every connection with the Supabase JWT and records who is host. It forwards intents to the host and deltas/snapshots from the host to guests. It does not simulate.
- Rate limits per client to keep a misbehaving guest from flooding the host.
- Hosting: a single small VPS or container (proposal: Fly.io or Railway) is enough for launch scale.

### 8.5 Testing

- `packages/sim` has unit tests for every rule (growth, pricing, day rollover, guest permission checks, save migrations). This is where correctness lives.
- A headless "two sims" test harness: a host sim and a guest replica fed the same deltas must agree. Run in CI.
- The rendering layer gets smoke tests (scene mounts, no console errors) and manual playtests.

### 8.6 Performance budget (proposal)

- Target 60 fps on an integrated-GPU laptop at 1080p; degrade to 30 fps gracefully with a quality toggle (shadow resolution, outline pass off).
- Initial load under 10 MB with the kit Draco-compressed and loaded on demand by category.

---

## 9. Release plan and build order

### 9.1 Release plan (owner decision: thin playable slice first)

The first public thing is a **thin playable slice**, put online for friends early, then grown toward the full v1 in §7. The slice is complete on its own loop, not a demo of disconnected features:

| | Slice (first public) | Full v1 (§7) |
|---|---|---|
| Seasons | Spring only (28 days, then Spring again) | Four seasons |
| Crops | 3–4 | ~12 |
| Animals | Chickens | Chickens, cows, sheep |
| Processing | None | 3 machines |
| Cooking | None | ~10 recipes |
| Villa | Tier 1 with the basic kit | 3 tiers, full kit |
| Land | Starting plot + 1 parcel | Starting plot + 4 parcels |
| Town | General store, carpenter, shipping bin | + rancher, market stall, NPC lines |
| Co-op | Working: join link, instant guest, chores, thank-you tip | Same |
| Saves/accounts | Working | Same |

Co-op and saves are in the slice because they are the risky parts and the parts friends will test; content is what grows later. Everything in the table's right column is designed now (schema, sim rules, kit conventions) so the slice is the first step of v1, not a throwaway.

### 9.2 Suggested build order (not a schedule)

1. **Walkable diorama.** One scene, character controller, camera, clay lighting, placeholder kit. Prove the look.
2. **Sim package, single-player.** Tiles, one crop, day rollover, save/load to Supabase. Playable loop with nothing else.
3. **Town and economy.** Shops, prices, shipping bin, gold. The loop closes.
4. **Villa build mode.** Kit, grid, placement, tiers. The long-term goal exists.
5. **Co-op.** Relay, join codes, intents/deltas, guest permissions, thank-you screen.
6. **Slice polish and put it online for friends.** Onboarding for the first ten minutes, sound, performance pass. This is the first public release.
7. **Content fill toward v1.** Remaining seasons, crops, animals, machines, cooking, parcels, villa tiers, NPC lines — in whatever order friend feedback suggests.
8. **Ship the web v1.**
9. Later: Electron wrap, Steam differentiators, then whatever players ask for.

Co-op comes fifth, but the sim is written for it from step 2 (intents, deltas, no direct mutation from the UI). That is the "host with zero guests" discipline.

---

## 10. Left to the builder

- Exact crop list, prices, growth times, and animal numbers (keep §7.4's pacing targets).
- Grid cell size and the kit's unit scale and pivot conventions.
- The precise delta/intent message schema and how large a snapshot can get.
- Which toon-shading approach (custom shader vs. post-process outline vs. matcap-style) achieves the clay look at the frame budget.
- Character creator contents (the shape is fixed in §7.3: a handful of clay heads, hair, outfits and colors; no sliders).
- Relay reconnection grace period and guest-side movement prediction.
- Interior rendering when the camera looks into the villa (cutaway roof, fade walls, or a separate interior view).
- Onboarding: how the first ten minutes teach planting, selling, and building without a tutorial wall.
- Sound design.
- Save migration tooling.

## 11. Open questions for the owner (deferred, do not block v1)

- What makes the paid Steam version worth buying when the web version is free (see §7.10).
- Whether the web version ever gets a monetization path, and if so, what (the proposal here is "none").
