# TRIOE: Smart Town Rescue — Season One Storyboard: *Project Bantay*

**Status:** Adopted for this repo — **Missions 1 and 2 are built and playable**; 3–6 are locked signals. It replaces Season One (*Project Beacon*, `GAME_CONCEPT.md` §5.3 and §6); the canon docs in `../trioe-lms-mission` have not been updated yet.
**Read with:** `../trioe-lms-mission/GAME_CONCEPT.md` and `GUIDE.md` and this repo's `CLAUDE.md`. Every rule there still holds:
- Briefs lead with a person and a symptom, never a topic.
- Every fault is a real failure mode, because the System cannot lie.
- The phase order is fixed: ENTRY → CALL_FOR_HELP → INVESTIGATION → HYPOTHESIS → CHALLENGE → RESULT → REFLECTION → REWARD.
- Hypotheses are claims the player makes, never quiz answers.
- Captain T only asks questions. He never confirms a claim, gives an answer, solves the challenge or names the root cause.
- Wrong claims redirect and never fail the mission.
- There is exactly one Insight Gem per mission, awarded after the authored reflection.

**Hardware:** the TRIOE board (ESP32-WROOM, 2.4 GHz Wi-Fi), programmed in Arduino-style C++.

---

## 1. Season premise

"Bantay" means *watch* or *guard*.

The river through Junction rises every storm season. Last year the warning came by word of mouth, and it came late. This year the **Circuit Club** is building **Project Bantay**, a neighbourhood early-warning network:
- a river-level node at the bridge,
- a shared dashboard everyone can check on their phone,
- alert lights and displays in homes and shops.

Every help signal this season comes from one node of that network that won't behave. The people asking for help are students and neighbours. Each problem is one that real people hit with real IoT devices at home, and each fix teaches one layer of IoT:

| # | Layer | Mission | Help seeker | Place in the 3D Junction |
|---|---|---|---|---|
| 1 | Connect | **NO SIGNAL** | Sarah (Circuit Club, Grade 11) | Circuit Club interior (existing map) |
| 2 | Act | **THE PUMP THAT WON'T QUIT** | Mika (runs the community garden) | Mika's greenhouse, southwest of the plaza |
| 3 | Sense | **WORKS UNTIL ONLINE** | Jordan (Circuit Club, Grade 11) | The river bridge (the signal calls from Jordan's house on the north bank) |
| 4 | Talk | **THE SILENT DASHBOARD** | Alex (Circuit Club, Grade 12) | Junction Node plaza |
| 5 | Time | **MIDNIGHT LIGHTS** | Mang Ben (the baker) | Bakery cottage |
| 6 | Stay up | **STORM NIGHT** (finale) | Taylor (Circuit Club, Grade 12) | All of Junction, at night, in rain |

**How the thread is revealed.** The thread surfaces gradually, as Project Beacon's did:
- M1: Sarah mentions that the display is "for the river alert".
- M2: Mika's pump controller doubles as the garden's alert light.
- M3 to M5: the player sees one dashboard filling in, node by node.
- M6: the storm arrives and tests every part at once.

**Theme, stated once:** *a network is only as reliable as its weakest link, and no one keeps a neighbourhood safe alone.* The six gems are the six layers of the network the player has come to understand.

**Characters.**
- **Sarah, Jordan, Alex and Taylor** keep their canon personalities (§5.3). Only their problems change.
  - Sarah follows tutorials faithfully.
  - Jordan trusts numbers.
  - Alex is fast and messy.
  - Taylor is fluent in code.
- **Mika and Mang Ben** are new adult help seekers. They show that IoT is everyday life, not just a club project. Both names come from the canon Season Two slate. If Season Two keeps them, give them new names there.

**Difficulty ramp** (the `GAME_CONCEPT.md` §10 dials):

| Mission | Reproducibility | Cause count | Evidence honesty | Observation cost |
|---|---|---|---|---|
| 1 NO SIGNAL | always | one | honest, with one easy herring | low |
| 2 PUMP | always | one | honest | low |
| 3 ONLINE | always, but only online | one, in another subsystem | two herrings | medium |
| 4 DASHBOARD | always | one | two herrings | **high**: choose which hop to inspect |
| 5 LIGHTS | depends on the time of day | one | two herrings | medium |
| 6 STORM | **intermittent**: only after an outage | one, plus a second one revealed by the fix | two herrings | high |

---

## 2. How each mission is boarded

Each mission is a sequence of panels, one or more per phase. Each panel notes:
- **Shot:** what the camera shows in the 3D world.
- **Who:** who speaks. Conversation stages keep the help seeker on the left, the hero on the right and Captain T at bottom centre.
- **Player:** what the player does.

Each mission also lists:
- 4–5 clues, three needed to leave INVESTIGATION, including at least one red herring;
- the supported claim and the redirects;
- a hands-on challenge whose simulated board behaves like the real one, including what *wrong* attempts do;
- a hands-on wiring board (a `wiring` evidence tab, after the Grandpa Boldoo cable quest in Univision's *Fix-It*): Boldoo-style numbered steps only for checks that are not the answer; free placement wherever it touches the cause;
- the authored reflection;
- the gem.

Dialogue lines here are calibration samples, not final scripts. Each line should read in under about 4 seconds.

---

## 3. Mission 1 — NO SIGNAL · *Connect*

> **Signal:** "Sarah's river-alert display won't go online."

**ENTRY**
- **Shot:** Junction at midday. A help signal pulses above the Circuit Club. The hero walks up, and the door transition fades into the interior.
- **Player:** walks in.

**CALL FOR HELP**
- **Shot:** Sarah at the workbench. A small display reads `Connecting…` and the laptop beside it shows the serial monitor.
- **Sarah:** "Sorry — it's probably something dumb. It worked on my laptop's hotspot yesterday."
- **Sarah:** "Here it just says *connecting*. Forever. I triple-checked the password."
- **Captain T:** "Forever is a long time. What has it actually *told* you while it waited?"
- **Player:** chooses how to respond. Every route leads to the investigation.

**INVESTIGATION** (3 of 5 needed)

| # | Clue | Where | What it shows |
|---|---|---|---|
| 1 | **Serial monitor** | laptop | `Connecting to ClubNet_5G .......` repeats. The status line reads `WL_NO_SSID_AVAIL`, meaning *the network wasn't found*. |
| 2 | **Router sticker** | router on the shelf | It broadcasts two networks: `ClubNet` (2.4 GHz) and `ClubNet_5G` (5 GHz). Both use the same password. |
| 3 | **Board datasheet card** | pinned beside the pinout poster | "ESP32-WROOM — Wi-Fi 802.11 b/g/n, **2.4 GHz**." |
| 4 | **Sarah's phone** | on the bench | Happily connected to `ClubNet_5G`. That is where she copied the name from. |
| 5 | *Red herring:* **the password** | Sarah's notebook | It matches the sticker exactly. Clue 1 already says the *network* wasn't found. |

- **Captain T, on clue 1:** "Not found. Not *refused*. Is that the same complaint?"
- **Captain T, on clue 4:** "Your phone can see it. Does that tell you what the board can see?"

**HYPOTHESIS**
- **Supported:** "The board is looking for a network its radio can't hear."
- **Redirect, "The password is wrong":** "What did the board *say* went wrong — and is that the same thing?"
- **Redirect, "The board's Wi-Fi is broken":** "It found a hotspot yesterday. What's different today?"

**CHALLENGE.** A Wi-Fi settings panel opens on Sarah's sketch with an SSID and a password. The player edits, then uploads. The simulated board behaves as the real one would:
- `ClubNet_5G` keeps printing dots, then `WL_NO_SSID_AVAIL`.
- `ClubNet` with a wrong password fails with a different status. It does not report a missing network.
- `ClubNet` with the right password prints `Connected! IP 192.168.1.42`, and the display's online light turns on.

**HANDS-ON** (guided check, built): the board's *Check cables* tab. Five Boldoo-style steps reseat the USB cable and the display's VCC/GND/SDA/SCL. The display still says "Connecting...", which gives the *Alive and Asking* clue and rules out a loose cable without touching the answer.

**RESULT**
- **Shot:** the display flips to `River: waiting for data…`.
- **Sarah:** "So it was never my password."

**REFLECTION** (authored, shown after success)
- **What went wrong:** the display never joined the network.
- **Why:** the sketch named the router's 5 GHz network, and the ESP32's radio only works on 2.4 GHz. The hotspot worked because it broadcast on 2.4 GHz.
- **How it was fixed:** the sketch now names the router's 2.4 GHz network.
- **Concept:** a connection needs both sides to speak the same radio. What your phone can see is not what your device can see.
- **Habit:** read the exact error. "Not found" and "wrong password" are different failures with different causes.

**REWARD.** Gem: ***Same Wavelength***.

*Authoring note:* `WL_NO_SSID_AVAIL` is the documented status for an SSID that isn't found. The status a wrong password produces varies between Arduino-ESP32 core versions; it is often `WL_CONNECT_FAILED`. Pin the core version before writing the exact log text.

---

## 4. Mission 2 — THE PUMP THAT WON'T QUIT · *Act*

> **Signal:** "Mika's garden is flooding — the watering pump runs when it's supposed to be off."

**ENTRY**
- **Shot:** Mika's greenhouse, water seeping out under its door. Inside, puddles between the beds and a small pump humming.
- **Player:** walks in.

**CALL FOR HELP**
- **Mika:** "The little screen says *Pump OFF*. The pump disagrees."
- **Mika:** "And the minute I plug the board in, it starts. Before anything even checks the soil."
- **Captain T:** "Two witnesses, two stories. Which one has wet feet?"

**INVESTIGATION** (3 of 5 needed)

| # | Clue | Where | What it shows |
|---|---|---|---|
| 1 | **Serial log** | Mika's tablet | `soil: 71% (wet) → Pump OFF → digitalWrite(RELAY, LOW)` |
| 2 | **Relay module** | weatherproof box | Its red indicator LED is lit. You can hear the relay's click and water flowing. |
| 3 | **Relay silkscreen** | the module's label | `IN — Low level trigger` |
| 4 | **Multimeter on IN** | probe tool | 0 V while the log says "OFF". |
| 5 | *Red herring:* **soil sensor** | in the bed | Its readings follow the soil: wet beds read wet, and a dry pot reads dry. |

**HYPOTHESIS**
- **Supported:** "This relay switches on when its input is LOW, so the code's 'off' is the relay's 'on'."
- **Redirect, "The moisture sensor is lying":** "What does the soil look like? What does the sensor say? Do they disagree?"
- **Redirect, "The pump is wired wrong":** "Then what happens when that pin goes HIGH?"

**CHALLENGE.** The player edits the lines that drive the relay pin, uploads, then watches the pump, the relay LED and the screen together. The simulation stays honest:
- As written, the pump runs when the soil is wet and stops when it's dry: exactly backwards.
- Flipping only the "off" write means the pump never runs, even in dry soil.
- Flipping only the "on" write keeps the pump running the whole time.
- Flipping both makes the pump follow the soil.
- `pinMode(RELAY, OUTPUT)` starts the pin LOW, so the pump also runs from boot until `setup()` drives the pin to the relay's "off" level. A fix that leaves that out shows a short run every time the board restarts.

**HANDS-ON** (free probe, built): the control box's *Multimeter* tab. The player puts the red and black probes anywhere. Signal to GND reads 0.0 V (the *0 Volts* clue, still gated behind the sketch). COM to NO beeps closed (*The Relay Is On*). VCC and 3V3 read healthy.

**RESULT**
- **Shot:** the beds drain and the pump stays silent.
- **Mika** (pouring tea): "So 'OFF' meant 'ON'. The screen *believed* it."

**REFLECTION**
- **What went wrong:** the pump ran when the code said it was off.
- **Why:** the relay module is *active-LOW*: a LOW input energises it. The code assumed HIGH means on.
- **How it was fixed:** both relay writes were inverted, and `setup()` drives the pin to "off" straight away.
- **Concept:** a signal's meaning is decided by the device that receives it. HIGH isn't "on" until you check what the receiver expects.
- **Habit:** when the log and the hardware disagree, believe the hardware and measure.

**REWARD.** Gem: ***Read the Receiver***.

---

## 5. Mission 3 — WORKS UNTIL ONLINE · *Sense*

> **Signal:** "Jordan's river sensor reads perfectly on the bench — and nothing at all once it's online."

**ENTRY**
- **Shot:** the bridge over the river. A stake with a level sensor stands in the water, with a sealed box on the railing.

**CALL FOR HELP**
- **Jordan** (formal, rattled): "I logged two hundred readings offline. Every one correct."
- **Jordan:** "Then I turned on Wi-Fi so the dashboard could see it, and the data died."
- **Captain T:** "Died. Or changed? Those are different symptoms."

**INVESTIGATION** (3 of 6 needed)

| # | Clue | Where | What it shows |
|---|---|---|---|
| 1 | **Offline test log** | Jordan's spreadsheet | The levels are smooth and plausible, and they rise when the hero splashes water. |
| 2 | **Online log** | serial, with Wi-Fi on | The reads fail and the values flatline from the moment `WiFi.begin()` runs. |
| 3 | **Wiring** | inside the box | The sensor output goes to GPIO 25. |
| 4 | **Pinout poster** | Circuit Club wall (a door away) | GPIO 25 is marked **ADC2**. The footnote reads "ADC2 is used by the Wi-Fi driver." |
| 5 | *Red herring:* **long cable "noise"** | the cable run | A short test cable gives the same failure. |
| 6 | *Red herring:* **faulty sensor** | — | Clue 1 already shows it working offline. |

- **Captain T, on clue 2:** "When, exactly? Before the radio starts, or after?"

**HYPOTHESIS**
- **Supported:** "When Wi-Fi is on, the radio takes over the converter that pin depends on."
- **Redirect, "Wi-Fi interference":** "If it's noise, why are the readings perfect right up until the instant Wi-Fi starts?"
- **Redirect, "The sensor is broken":** "Then which log are you calling a liar?"

**CHALLENGE.** The player moves the sensor wire to another pin, updates the pin in the code and uploads with Wi-Fi on. The simulation stays honest:
- Any **ADC1** pin (GPIO 32–39) reads correctly online.
- Another ADC2 pin fails the same way.
- A pin that has no ADC reads nothing useful.

**HANDS-ON** (free, it is the challenge): a wiring board of the ESP32 header. The player drags the sensor's signal wire to a pin, then sets the same pin in the code. There are no steps: where the wire goes is the player's claim, and the simulation above judges it.

**RESULT**
- **Shot:** the dashboard shows the first live river level.
- **Jordan** quietly adds a column to the spreadsheet: *Wi-Fi state*.

**REFLECTION**
- **What went wrong:** the sensor only failed once the board went online.
- **Why:** GPIO 25 reads through ADC2, which the ESP32's Wi-Fi driver uses while Wi-Fi is active.
- **How it was fixed:** the sensor moved to an ADC1 pin.
- **Concept:** a connected device's parts share hidden resources. A symptom in one subsystem, the sensor, can have its cause in another, the radio.
- **Habit:** change one condition at a time (Wi-Fi on or off) to find exactly when a fault appears.

**REWARD.** Gem: ***Shared Ground***.

*Authoring note:* the exact value an ADC2 read returns while Wi-Fi is active differs between Arduino-ESP32 core versions: an error, 0, or the maximum. Pin the core version before writing the log text.

---

## 6. Mission 4 — THE SILENT DASHBOARD · *Talk*

> **Signal:** "The dashboard says the river node is online — but the level never moves, and nobody's phone gets alerts."

**ENTRY**
- **Shot:** the Junction Node, the network's glowing heart, with a large public dashboard screen. The river tile reads `ONLINE` with a level frozen at `—`.

**CALL FOR HELP**
- **Alex** (breezy): "Server's down, obviously. I'll just restart everything."
- **Captain T:** "Everything? Which part do you *know* is broken?"

**INVESTIGATION** (3 of 6 needed). The message path is shown as three stations, device → broker → dashboard. The player chooses which station to inspect, so deciding where to look is part of the puzzle.

| # | Clue | Station | What it shows |
|---|---|---|---|
| 1 | **Device serial** | river node | `publish junction/River/level 1.42 … ok` every 10 s |
| 2 | **Broker activity log** | Junction Node | Messages are arriving on `junction/River/level`. |
| 3 | **Dashboard config** | public screen | The river tile is subscribed to `junction/river/level`. |
| 4 | **Other tiles** | public screen | The garden tile from Mission 2 updates every minute, so the broker is working. |
| 5 | *Red herring:* **Wi-Fi** | river node | Clue 1 shows the publish succeeding. |
| 6 | *Red herring:* **phone app** | Alex's phone | Garden alerts arrive fine. |

**HYPOTHESIS**
- **Supported:** "The messages are going to an address nobody is listening to."
- **Redirect, "The broker is down":** "Then how did the garden's update arrive a minute ago?"
- **Redirect, "Restart everything":** "And if it comes back the same — what will you have learned?"

**CHALLENGE.** A topic editor is available on both the device and the dashboard. The player edits one of them, republishes and watches. The simulation stays honest:
- Topics are case-sensitive: any mismatch in case, spelling or a stray `/` stays silent.
- Making the two sides match, on either side, brings the tile to life.
- A wildcard subscription such as `junction/+/level` also works. The reflection names it as a trade-off: it is convenient, but it also catches other nodes' messages.

**HANDS-ON** (guided check): reseat the river node's sensor and power cables in numbered steps. The node keeps publishing on the serial log, which clears the hardware suspect. The topic case fix stays in code.

**RESULT**
- **Shot:** the river tile shows `1.42 m`, and every phone in the plaza buzzes once with a test alert.

**REFLECTION**
- **What went wrong:** the river node's messages never reached the dashboard.
- **Why:** MQTT topics are case-sensitive. `River` and `river` are different addresses, so nothing was subscribed to the topic the node published on.
- **How it was fixed:** both sides now use the exact same topic.
- **Concept:** messages only arrive where sender and receiver agree on the exact same address.
- **Habit:** trace a message one hop at a time, and prove each hop before suspecting the next.

**REWARD.** Gem: ***Follow the Message***.

---

## 7. Mission 5 — MIDNIGHT LIGHTS · *Time*

> **Signal:** "Mang Ben's flood-alert sign turns on at 2 AM and off at 2 PM."

**ENTRY**
- **Shot:** the bakery cottage at dusk. The alert sign in the window is dark exactly when the street fills with people.

**CALL FOR HELP**
- **Mang Ben** (gruff): "Sign's possessed. On when I'm asleep. Off when customers come."
- **Captain T:** "Possessed things are rarely punctual. Is this one?"

**INVESTIGATION** (3 of 6 needed)

| # | Clue | Where | What it shows |
|---|---|---|---|
| 1 | **The schedule** | sketch | `ON_HOUR = 18`, `OFF_HOUR = 6` |
| 2 | **Serial clock print** | laptop | `10:02:41` while the bakery's wall clock says 18:02, exactly 8 hours apart. |
| 3 | **Time setup** | sketch | `configTime(0, 0, "pool.ntp.org");`, an offset of 0. |
| 4 | **Town noticeboard** | outside | "Junction time = UTC + 8." |
| 5 | *Red herring:* **light sensor** | on the sign | Wired, but the schedule never reads it. |
| 6 | *Red herring:* **dead clock battery** | — | Clue 3 shows the board gets its time from the network. |

**HYPOTHESIS**
- **Supported:** "The board is keeping the right time — for the wrong place."
- **Redirect, "It's glitching randomly":** "Is it random? What time does it switch — every day?"

**CHALLENGE.** The player sets the time offset, uploads, then watches a fast-forwarded day: the sign, the street and the sky. The simulation stays honest:
- `28800` (8 × 3600 seconds) fixes it.
- `-28800` doubles the error, so the sign turns on at 10 AM.
- `8` shifts the clock by 8 *seconds*, because the offset is in seconds, not hours.

**HANDS-ON** (free probe): put the multimeter on the light sensor. It reads well and drops when it is covered, but the schedule never reads it. Measuring clears the red herring.

**RESULT**
- **Shot:** the sign lights as the evening crowd arrives.
- **Mang Ben:** "Hm. Not possessed. Just foreign."

**REFLECTION**
- **What went wrong:** the sign switched 8 hours off schedule, every day.
- **Why:** network time arrives as UTC. With an offset of 0, the board's "18:00" was 18:00 UTC, which is 2 AM in Junction.
- **How it was fixed:** `configTime` now receives Junction's offset, `28800` seconds.
- **Concept:** a device's "now" is whatever it was told. Local time is your job, not the network's.
- **Habit:** compare the device's view to an outside reference, and look for the pattern inside "random" faults.

**REWARD.** Gem: ***Whose Clock?***

---

## 8. Mission 6 — STORM NIGHT · *Stay up* · season finale

> **Signal:** "The storm's here. The river node went silent at 9:14 PM — and it's still silent."

**ENTRY**
- **Shot:** the most cinematic entry of the season. Junction at night, in rain. Every window is lit, the river is high and the dashboard tile is grey.
- The loading line changes once: *"Responding to a signal… in the storm."*

**CALL FOR HELP**
- **Taylor** (quick, then rattled): "The code's fine — I read it top to bottom. It ran six days straight."
- **Taylor:** "Then the lights flickered and it just… stopped talking."
- **Captain T:** "Six days of working is evidence. So is tonight. Which one are you ignoring?"

**INVESTIGATION** (3 of 6 needed)

| # | Clue | Where | What it shows |
|---|---|---|---|
| 1 | **Router log** | Circuit Club | `21:13 power loss — reboot` |
| 2 | **The node itself** | bridge, in the rain | It is alive: its uptime counter is still climbing and its last publish was 21:13. |
| 3 | **The code** | Taylor's laptop | `WiFi.begin()` and the broker connect happen only in `setup()`. `loop()` never checks either. |
| 4 | **Reset button** | the node | Pressing it brings the node back instantly, but only while someone stands at the bridge in a storm. |
| 5 | *Red herring:* **storm damage** | sensor | It reads correctly right after a reset. |
| 6 | *Red herring:* **battery** | — | The uptime never stopped. |

**HYPOTHESIS**
- **Supported:** "The node connects once. When the network came back, it never tried again."
- **Redirect, "Water got into it":** "Then why did one button press fix it?"
- **Redirect, "Just press reset when it happens":** "At 2 AM? In this? Who's pressing it?"

**CHALLENGE.** The player adds a reconnect check to `loop()` and uploads. Then the System replays the outage with the router off, then on. The simulation stays honest, and it reveals one fault behind another:
- If nothing reconnects, the node stays silent.
- If only Wi-Fi reconnects, the node shows "online" but stays silent: the broker connection was lost too. This calls back to Mission 4.
- If Wi-Fi and the broker both reconnect, the node is back within seconds, with no one at the bridge.

**HANDS-ON** (free): drag the router's power plug out, then back in. The node never reconnects, which gives the reconnect-in-`loop()` clue.

**RESULT and season payoff.** This is the beat Project Bantay was built for.
- **Shot:** the river crosses the alert line.
- **Shot:** the whole network fires in sequence:
  - Jordan's sensor reports.
  - The broker relays the reading.
  - Alex's dashboard turns red.
  - Phones buzz.
  - Sarah's display, Mika's garden light and Mang Ben's sign all blink at once.
- **Shot:** neighbours carry sacks and furniture upstairs together, with the four students among them.
- Each student knows exactly how their part works, because they struggled through it.
- **Captain T**, for once making no question of it, says only: "Listen. That's what a network sounds like when it holds."

**REFLECTION**
- **What went wrong:** after a power flicker, the river node stayed silent until someone pressed reset.
- **Why:** it connected to Wi-Fi and the broker only once, at start-up. When the router rebooted, both connections dropped, and nothing tried again.
- **How it was fixed:** `loop()` now checks both connections and reconnects whichever has dropped.
- **Concept:** connected devices must expect connections to drop. Reliability is reconnection you planned for, not hope.
- **Habit:** test the failure you fear on purpose. Pull the plug before the storm does.

**REWARD.** Gem: ***Expect the Drop***. Below the gem, the season's six gems form the shape of the network.

---

## 9. Season Two seeds (not boarded)

- **Brownout on transmit:** the board resets every time it connects to Wi-Fi when it is powered from a weak USB cable or port.
- **The battery that lasts a day:** a battery node that never sleeps.
- **"Anyone can open my gate":** a smart gate on a broker with no password.
- **Two sensors, one bus:** an I2C address clash. This is already in the canon Season Two slate (*Crossed Signals*).

---

## 10. Follow-up work

Done: the north bank — a hamlet past the ridge north of the river, with Jordan's house and Mission 3's signal, opened by Mission 2's gem (a barrier in the ridge's cutting lifts in a one-time reveal); Mission 1 rebuilt as NO SIGNAL (router, display and datasheet poster in the Circuit Club); Mission 2 built inside Mika's greenhouse (its own interior map, entered from Junction); the mission list replaced with Missions 1–6; the poster retitled ESP32-WROOM with the ADC1/ADC2 row. Still to do:

1. **Canon:** update `GAME_CONCEPT.md` §5.3 (help seekers), §6 (season arc) and §9, and add Mika and Mang Ben to the cast.
2. **Missions 3–6:** author each as a `src/game/data/mission-N/` folder (set `playable: true` in `missions.ts`), with scenes for the bridge, the Junction Node dashboard and the bakery. Mission 6 needs a night-and-rain look for the junction map.
3. **Pinout poster:** mark the ADC1/ADC2 pins on the board drawing itself, not only in the spec rows (Mission 3 leans on it).
4. **Core version:** pin the Arduino-ESP32 core version the simulation imitates, and write the exact log text for M1 and M3 to match it.
