import type { EvidenceSurface, InvestigationData } from '../types';

/**
 * Mission 1 — No Signal: clues and the evidence the world offers.
 *
 * The club router broadcasts two networks: ClubNet (2.4 GHz) and ClubNet_5G (5 GHz).
 * Sarah copied the network name from her phone, which sits on the 5 GHz one. The
 * ESP32's radio only works on 2.4 GHz, so to the board that network doesn't exist:
 * WiFi.status() reports WL_NO_SSID_AVAIL ("network not found"), forever. The
 * password was right all along.
 */
export const MISSION_1_INVESTIGATION: InvestigationData = {
  missionId: 'mission-1',
  minimumCluesRequired: 4,
  clues: [
    {
      id: 'clue-sketch-code',
      title: 'What the Sketch Asks For',
      description: 'The sketch joins a Wi-Fi network by name — ssid = "ClubNet_5G" — using the password beside it, and keeps asking until it is connected.',
      category: 'code',
      requiredForCompletion: true,
      mentorLine: 'A name and a password. Which of the two has the board actually complained about?',
    },
    {
      id: 'clue-serial-status',
      title: 'Network Not Found',
      description:
        'Every ten seconds the board reports WL_NO_SSID_AVAIL: it cannot find any network called ClubNet_5G. It never got as far as trying the password.',
      category: 'system',
      dependencies: ['clue-sketch-code'],
      requiredForCompletion: true,
      mentorLine: 'Not found. Not refused. Is that the same complaint?',
    },
    {
      id: 'clue-router-bands',
      title: 'Two Networks, One Router',
      description: 'The club router broadcasts two networks: ClubNet on the 2.4 GHz band and ClubNet_5G on the 5 GHz band.',
      category: 'observation',
      requiredForCompletion: true,
      mentorLine: 'Two networks, one router. Are they the same to everyone who is listening?',
    },
    {
      id: 'clue-radio-spec',
      title: "The Board's Radio",
      description: "The board's datasheet lists one Wi-Fi band: 802.11 b/g/n on 2.4 GHz.",
      category: 'evidence',
      requiredForCompletion: true,
      mentorLine: 'A radio is a listener. What can this one hear?',
    },
    {
      id: 'clue-phone',
      title: "Sarah's Phone",
      description: "Sarah's phone is connected to ClubNet_5G with full bars — that's where she copied the network name from.",
      category: 'observation',
      mentorLine: 'Her phone can see it. Does that tell you what the board can see?',
    },
    {
      id: 'clue-password-ok',
      title: 'Password Checks Out',
      description: 'The password in the sketch matches the router sticker exactly — and both networks share it.',
      category: 'evidence',
      dependencies: ['clue-sketch-code'],
      mentorLine: 'So the password checks out. What does that leave?',
    },
    {
      id: 'clue-board-alive',
      title: 'Alive and Asking',
      description: 'The board is powered and running: it prints, retries, and keeps its display updated. It is not dead — it is searching.',
      category: 'observation',
      mentorLine: "It's alive, and still asking. Asking for what, exactly?",
    },
  ],
  missingDependencyLines: {
    'clue-serial-status': 'Logs make more sense once you know what the code was trying to do. Start with the sketch.',
    'clue-password-ok': 'Matches what? Read the sketch first — then compare.',
  },
};

/** Sarah's sketch. `{SSID}` / `{PASSWORD}` are the editable fields. */
const SKETCH = [
  { id: 's0', text: '// River alert display — Project Bantay', note: "Sarah's part of the river network." },
  { id: 's1', text: '#include <WiFi.h>' },
  { id: 's2', text: '' },
  { id: 's3', text: 'const char* ssid     = "{SSID}";', clueId: 'clue-sketch-code' },
  { id: 's4', text: 'const char* password = "{PASSWORD}";', note: 'Copied off the router sticker, Sarah says.' },
  { id: 's5', text: '' },
  { id: 's6', text: 'void setup() {' },
  { id: 's7', text: '  Serial.begin(115200);' },
  { id: 's8', text: '  display.show("Connecting...");', note: 'So that is what the display has been saying.' },
  { id: 's9', text: '  Serial.printf("Connecting to %s\\n", ssid);' },
  { id: 's10', text: '  WiFi.begin(ssid, password);', clueId: 'clue-sketch-code' },
  { id: 's11', text: '  int tries = 0;' },
  { id: 's12', text: '  while (WiFi.status() != WL_CONNECTED) {', clueId: 'clue-sketch-code' },
  { id: 's13', text: '    delay(500);' },
  { id: 's14', text: '    Serial.print(".");' },
  { id: 's15', text: '    if (++tries == 20) {', note: 'Twenty tries, half a second apart: ten seconds of asking.' },
  { id: 's16', text: '      Serial.print(" WiFi status: ");' },
  { id: 's17', text: '      Serial.println(statusName(WiFi.status()));', note: "statusName() is the tutorial's helper: it prints the status by name." },
  { id: 's18', text: '      tries = 0;' },
  { id: 's19', text: '    }' },
  { id: 's20', text: '  }' },
  { id: 's21', text: '  Serial.println(WiFi.localIP());' },
  { id: 's22', text: '  display.show("River: waiting for data");' },
  { id: 's23', text: '}' },
];

export const MISSION_1_SURFACES: EvidenceSurface[] = [
  {
    id: 'laptop',
    title: "sketch.ino — Sarah's laptop",
    kicker: 'EVIDENCE',
    tabs: [
      { id: 'sketch', label: 'Sketch', kind: 'code', items: SKETCH },
      {
        id: 'serial',
        label: 'Serial Monitor',
        kind: 'log',
        output: true,
        items: [
          { id: 'o0', text: 'Connecting to ClubNet_5G', note: "The name it's asking for." },
          { id: 'o1', text: '.................... WiFi status: WL_NO_SSID_AVAIL', clueId: 'clue-serial-status' },
          { id: 'o2', text: '.................... WiFi status: WL_NO_SSID_AVAIL', clueId: 'clue-serial-status' },
          { id: 'o3', text: '.................... WiFi status: WL_NO_SSID_AVAIL', clueId: 'clue-serial-status' },
          { id: 'o4', text: '.......', note: 'Still asking.' },
        ],
      },
    ],
  },
  {
    id: 'board',
    title: 'TRIOE board + display',
    kicker: 'OBSERVE',
    tabs: [
      {
        id: 'look',
        label: 'Look',
        kind: 'list',
        items: [
          { id: 'b0', text: 'Red PWR light: glowing steadily.', clueId: 'clue-board-alive' },
          { id: 'b1', text: 'The display wired to the board reads "Connecting..." — and the laptop keeps logging new dots.', clueId: 'clue-board-alive' },
          { id: 'b2', text: 'Under the gray lid: ESP32-WROOM. Its antenna is the zig-zag trace printed at the tip.', note: 'The radio is built right into the module.' },
        ],
      },
      {
        id: 'cables',
        label: 'Check cables',
        kind: 'wiring',
        items: [],
        board: {
          devices: [
            { id: 'plate', label: '', art: 'plate', x: 50, y: 1, w: 46, h: 59, color: '#e3e9ea', ports: [] },
            // Port positions on the TRIOE board are esp32Pin(box, -1, i) for pins 0, 1, 5 and 6 of its left header.
            {
              id: 'board',
              label: 'TRIOE board (ESP32)',
              art: 'esp32',
              x: 54,
              y: 24,
              w: 38,
              h: 32,
              color: '#1d5fc4',
              ports: [
                { id: 'usb', label: 'USB', x: 69.2, y: 56, out: [0, 1] },
                { id: '3v3', label: '3V3', x: 57.96, y: 54.03, out: [-0.86, -0.51], labelOutside: true },
                { id: 'gnd', label: 'GND', x: 60.13, y: 50.37, out: [-0.86, -0.51], labelOutside: true },
                { id: 'sda', label: '21', x: 68.82, y: 35.74, out: [-0.86, -0.51], labelOutside: true },
                { id: 'scl', label: '22', x: 70.99, y: 32.09, out: [-0.86, -0.51], labelOutside: true },
              ],
            },
            { id: 'display', label: 'River alert display', art: 'display', x: 58, y: 2, w: 30, h: 15, color: '#1d5fc4', ports: [] },
            { id: 'laptop', label: "Sarah's laptop", art: 'laptop', x: 3, y: 22, w: 32, h: 32, color: '#c9cdd6', ports: [] },
          ],
          cables: [
            { id: 'usb', label: 'USB', color: '#3a3440', from: [35, 47], rest: [44, 59] },
            { id: 'vcc', label: 'VCC', color: '#e8594a', from: [64, 17], rest: [45, 45] },
            { id: 'gnd', label: 'GND', color: '#3a3440', from: [70, 17], rest: [41, 37] },
            { id: 'sda', label: 'SDA', color: '#3d8bd9', from: [76, 17], rest: [45, 29] },
            { id: 'scl', label: 'SCL', color: '#f2c94c', from: [82, 17], rest: [41, 21] },
          ],
          steps: [
            { cable: 'usb', port: 'usb', text: "A loose cable is the first thing to rule out. Push the laptop's USB cable firmly into the board." },
            { cable: 'vcc', port: '3v3', text: "The display's VCC (red) gives it power: seat it on the board's 3V3 pin." },
            { cable: 'gnd', port: 'gnd', text: 'GND (black) closes the circuit: seat it on GND.' },
            { cable: 'sda', port: 'sda', text: 'SDA (blue) carries the data: seat it on GPIO 21, the SDA pin.' },
            { cable: 'scl', port: 'scl', text: 'SCL (yellow) keeps the beat: seat it on GPIO 22, the SCL pin.' },
          ],
          done: {
            id: 'b3',
            text: 'Every cable seated firmly. The display still says "Connecting..." and the laptop keeps logging new dots.',
            clueId: 'clue-board-alive',
            note: 'Nothing was loose. So the board is fine — and still searching.',
          },
        },
      },
    ],
  },
  {
    id: 'poster',
    title: 'ESP32-WROOM datasheet poster',
    kicker: 'REFERENCE',
    tabs: [
      {
        id: 'read',
        label: 'Read',
        kind: 'list',
        items: [
          { id: 'p0', text: 'CPU: dual-core, up to 240 MHz', note: 'Plenty of brains. Not the question today.' },
          { id: 'p1', text: 'Wi-Fi: 802.11 b/g/n · 2.4 GHz band', clueId: 'clue-radio-spec' },
          { id: 'p2', text: 'Bluetooth: v4.2 + BLE', note: 'Another radio, another language.' },
          { id: 'p3', text: 'Built-in LED: GPIO 2 · Supply: 3.3 V', note: 'Good to know. Not today’s problem.' },
          { id: 'p4', text: 'ADC1: GPIO 32–39 · ADC2: GPIO 0, 2, 4, 12–15, 25–27 (used by Wi-Fi)', note: 'A detail for another day, maybe.' },
        ],
      },
    ],
  },
  {
    id: 'router',
    title: 'The club Wi-Fi router',
    kicker: 'OBSERVE',
    tabs: [
      {
        id: 'look',
        label: 'Look',
        kind: 'list',
        items: [
          { id: 'r0', text: 'Sticker — Network 1: ClubNet · 2.4 GHz', clueId: 'clue-router-bands' },
          { id: 'r1', text: 'Sticker — Network 2: ClubNet_5G · 5 GHz', clueId: 'clue-router-bands' },
          { id: 'r2', text: 'Sticker — Password (both networks): fixthings2gether', clueId: 'clue-password-ok' },
          { id: 'r3', text: 'Lights: POWER on · 2.4G blinking · 5G blinking', note: 'Both networks are on the air right now.' },
          { id: 'r4', text: 'Label: "Dual-band Wi-Fi router"', note: 'Dual-band: it talks on two radio bands at once.' },
        ],
      },
    ],
  },
];
