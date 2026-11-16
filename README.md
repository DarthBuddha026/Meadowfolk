# TRIOE: Smart Town Rescue

A 3D, walk-around diorama version of **TRIOE: Mission Mode** — a detective-style Internet of Everything (IoE) learning game. Explore **Junction**, answer help signals, investigate real electronics/microcontroller faults, and earn Insight Gems.

Inspired by the clay-diorama look and explorable feel of [WoraWork](https://worawork.vercel.app/); story, characters, and learning rules come from the 2D game in `trioe-lms-mission`. The world (terrain, cottages, trees, props) is generated in code; the characters are rigged GLB models in `public/models/` (credits in `CREDITS.md`). Rendered with three.js **WebGPU** (Chrome/Edge 113+, Safari 26+, Firefox 141+ on Windows); other browsers automatically use the WebGL2 fallback.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
```

Add `?debug` to the URL to expose `window.__trioe` (teleport, phase, session) for testing.

## Controls

| Input | Action |
|---|---|
| WASD / Arrows | Move |
| Shift | Run |
| Space | Jump · continue dialogue |
| E / Enter | Interact |
| 1–4 | Pick a dialogue choice |
| J | Evidence journal |
| Scroll | Zoom |
| Esc | Step back / close |

Touch devices get an on-screen joystick, Run and Jump buttons; tap prompts and the dialogue cloud to interact.

Every mission runs the same eight phases: **Entry → Call for help → Investigation → Hypothesis → Challenge → Result → Reflection → Reward**. Wrong claims get redirected with questions from Captain T, never failed. The simulated hardware behaves like the real thing. Each mission awards exactly one Insight Gem, saved in localStorage.

## Mission 1 — No Signal

*"Sarah's river-alert display won't go online."* Inside the Circuit Club, her ESP32 display says `Connecting…` forever, even though she triple-checked the password.

- **Investigate** the serial monitor on her laptop, the router's sticker, the ESP32 datasheet poster, Sarah's phone and her notebook (one of them is a red herring). The board's *Check cables* tab walks through reseating the USB cable and the display wiring.
- **Challenge:** edit the Wi-Fi settings in Sarah's sketch and upload. A missing network, a wrong password and a successful connection each produce their own honest log.
- **Concept:** 2.4 GHz vs 5 GHz Wi-Fi. What your phone can see is not what your device can see.

## Mission 2 — The Pump That Won't Quit

*"Mika's garden is flooding — the watering pump runs when it's supposed to be off."* Inside Mika's greenhouse, the screen says *Pump OFF* while the pump keeps humming.

- **Investigate** the serial log on Mika's tablet, the relay module and its silkscreen, and the soil sensor (a red herring). The control box's *Multimeter* tab lets the player probe anywhere on the board.
- **Challenge:** edit the lines that drive the relay pin, upload, and watch the pump, the relay LED and the screen. Half-fixes behave as they would on real hardware: the pump never runs, never stops, or runs briefly at every boot.
- **Concept:** active-LOW relays. A signal's meaning is decided by the device that receives it.

Missions 3–6 appear as locked signals in the world.
