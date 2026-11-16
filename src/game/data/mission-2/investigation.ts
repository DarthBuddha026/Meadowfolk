import type { EvidenceSurface, InvestigationData } from '../types';

/**
 * Mission 2 — The Pump That Won't Quit: clues and the evidence the world offers.
 *
 * The control box's relay module is active-LOW ("Trigger: LOW level"): a LOW on
 * its input energises it. The sketch was written for a relay that switches on
 * with HIGH, so every "pump OFF" (LOW) switches the pump on — including the first
 * write in setup(), which is why it starts the moment the board powers up.
 */
export const MISSION_2_INVESTIGATION: InvestigationData = {
  missionId: 'mission-2',
  minimumCluesRequired: 4,
  clues: [
    {
      id: 'clue-sketch-logic',
      title: 'What the Sketch Means',
      description: 'Below 40% moisture the sketch writes HIGH to RELAY_PIN for "pump ON"; otherwise it writes LOW for "pump OFF".',
      category: 'code',
      requiredForCompletion: true,
      mentorLine: "That's what the sketch intends. What does the garden actually do?",
    },
    {
      id: 'clue-log-says-off',
      title: 'The Log Says Off',
      description: 'Every reading says the soil is soaked (70–72%), and the sketch answers "Pump OFF" every time.',
      category: 'system',
      requiredForCompletion: true,
      mentorLine: 'The board believes the pump is off. Is it?',
    },
    {
      id: 'clue-relay-on',
      title: 'The Relay Is On',
      description: "The relay's red indicator is lit and it has clicked in. The pump is running while the log says OFF.",
      category: 'observation',
      requiredForCompletion: true,
      mentorLine: 'Something between the log and the pump disagrees. Where?',
    },
    {
      id: 'clue-low-trigger',
      title: 'Trigger: LOW Level',
      description: 'Printed beside the relay module\'s input pins: "IN · Trigger: LOW level".',
      category: 'evidence',
      requiredForCompletion: true,
      mentorLine: 'Makers print things for a reason. What does that one mean for this pin?',
    },
    {
      id: 'clue-probe-0v',
      title: '0 Volts on the Input',
      description: 'The multimeter reads 0.0 V — LOW — on the relay\'s IN pin while the log says "Pump OFF".',
      category: 'observation',
      dependencies: ['clue-sketch-logic'],
      mentorLine: 'So the board sends exactly what the code asked for. Then who disagrees?',
    },
    {
      id: 'clue-sensor-honest',
      title: 'The Sensor Tells the Truth',
      description: "Both farm sensors read the soaked soil as 70–72%. Pushed into Mika's dry test pot, a sensor reads 18%. They follow the soil.",
      category: 'evidence',
      mentorLine: "So the sensors tell the truth. Good — that's one suspect cleared.",
    },
    {
      id: 'clue-boot-run',
      title: 'Starts at Power-Up',
      description: 'The pump starts the moment the board powers up — before the sketch has read the soil.',
      category: 'observation',
      mentorLine: 'Before the loop ever runs, something switches the pump on. What runs before the loop?',
    },
  ],
  missingDependencyLines: {
    'clue-probe-0v': 'A voltage only means something once you know what the code was trying to send. Read the sketch first.',
  },
};

/** The garden sketch. `{START}` / `{ON}` / `{OFF}` are the relay writes the player can flip. */
const SKETCH = [
  { id: 't0', text: '// Garden watering — Project Bantay garden node', note: 'Alex wrote it from a watering tutorial, Mika says.' },
  { id: 't1', text: '#define RELAY_PIN   26' },
  { id: 't2', text: '#define SOIL_LEFT   34' },
  { id: 't2b', text: '#define SOIL_RIGHT  35' },
  { id: 't3', text: '' },
  { id: 't4', text: 'void setup() {' },
  { id: 't5', text: '  Serial.begin(115200);' },
  { id: 't6', text: '  pinMode(RELAY_PIN, OUTPUT);' },
  { id: 't7', text: '  digitalWrite(RELAY_PIN, {START});  // start with the pump off', note: 'The very first thing the relay hears.' },
  { id: 't8', text: '  delay(2000);  // let the soil sensor settle', note: 'Two seconds before the first reading.' },
  { id: 't9', text: '}' },
  { id: 't10', text: '' },
  { id: 't11', text: 'void loop() {' },
  { id: 't12', text: '  int left  = readMoisturePercent(SOIL_LEFT);' },
  { id: 't12b', text: '  int right = readMoisturePercent(SOIL_RIGHT);' },
  { id: 't12c', text: '  int moisture = min(left, right);  // the driest bed decides', note: 'Water as soon as either farm runs dry.' },
  { id: 't13', text: '  Serial.printf("soil: %d%% -> ", moisture);' },
  { id: 't14', text: '  if (moisture < 40) {', clueId: 'clue-sketch-logic' },
  { id: 't15', text: '    digitalWrite(RELAY_PIN, {ON});  // pump ON', clueId: 'clue-sketch-logic' },
  { id: 't16', text: '    Serial.println("Pump ON");' },
  { id: 't17', text: '  } else {' },
  { id: 't18', text: '    digitalWrite(RELAY_PIN, {OFF});  // pump OFF', clueId: 'clue-sketch-logic' },
  { id: 't19', text: '    Serial.println("Pump OFF");' },
  { id: 't20', text: '  }' },
  { id: 't21', text: '  delay(5000);' },
  { id: 't22', text: '}' },
];

export const MISSION_2_SURFACES: EvidenceSurface[] = [
  {
    id: 'tablet',
    title: "garden.ino — Mika's tablet",
    kicker: 'EVIDENCE',
    tabs: [
      { id: 'sketch', label: 'Sketch', kind: 'code', items: SKETCH },
      {
        id: 'log',
        label: 'Serial Log',
        kind: 'log',
        output: true,
        items: [
          { id: 'l0', text: 'soil: 70% -> Pump OFF', clueId: 'clue-log-says-off' },
          { id: 'l1', text: 'soil: 71% -> Pump OFF', clueId: 'clue-log-says-off' },
          { id: 'l2', text: 'soil: 72% -> Pump OFF', note: 'Wetter every reading.' },
          { id: 'l3', text: 'soil: 72% -> Pump OFF', note: 'Five seconds apart, every time.' },
        ],
      },
    ],
  },
  {
    id: 'relay-box',
    title: 'Control box',
    kicker: 'OBSERVE',
    tabs: [
      {
        id: 'look',
        label: 'Look',
        kind: 'list',
        items: [
          { id: 'x0', text: 'Relay module: its red indicator LED is lit, and it has clicked in.', clueId: 'clue-relay-on' },
          { id: 'x1', text: 'Printed beside its input pins: "IN · Trigger: LOW level"', clueId: 'clue-low-trigger' },
          { id: 'x3', text: "Pump power: a 12 V adapter, switched by the relay's COM and NO terminals.", note: 'The relay is the switch. The board only tells it what to do.' },
          { id: 'x4', text: 'The TRIOE board: PWR light on, sketch running.', note: 'Alive, and logging every five seconds.' },
        ],
      },
      {
        id: 'meter',
        label: 'Multimeter',
        kind: 'wiring',
        items: [],
        board: {
          devices: [
            { id: 'box', label: '', art: 'enclosure', x: 2, y: 5, w: 72, h: 44, color: '#8d939c', ports: [] },
            // Probe points on the TRIOE board are esp32Pin(box, 1, i): pins 0, 2, 4 and 6 of its right header.
            {
              id: 'board',
              label: 'TRIOE board',
              art: 'esp32',
              x: 7,
              y: 12,
              w: 28,
              h: 26,
              color: '#1d5fc4',
              ports: [
                { id: 'b-26', label: 'GPIO 26', x: 31.49, y: 36.54, net: 'sig', out: [0.88, -0.47], labelOutside: true },
                { id: 'b-gnd', label: 'GND', x: 28.29, y: 30.59, net: 'gnd', out: [0.88, -0.47], labelOutside: true },
                { id: 'b-5v', label: '5V', x: 25.09, y: 24.65, net: 'vcc', out: [0.88, -0.47], labelOutside: true },
                { id: 'b-3v3', label: '3V3', x: 21.89, y: 18.71, net: '3v3', out: [0.88, -0.47], labelOutside: true },
              ],
            },
            {
              id: 'relay',
              label: '',
              art: 'relay',
              x: 42,
              y: 13,
              w: 28,
              h: 22,
              color: '#1d5fc4',
              ports: [
                { id: 'r-vcc', label: 'DC+', x: 42, y: 19, net: 'vcc' },
                { id: 'r-gnd', label: 'DC-', x: 42, y: 24, net: 'gnd' },
                { id: 'r-in', label: 'IN', x: 42, y: 29, net: 'sig' },
                { id: 'no', label: 'NO', x: 70, y: 21 },
                { id: 'com', label: 'COM', x: 70, y: 26 },
                { id: 'nc', label: 'NC', x: 70, y: 31 },
              ],
            },
            { id: 'meter', label: '', art: 'meter', x: 78, y: 26, w: 20, h: 34, color: '#f2c94c', ports: [] },
          ],
          // The jumpers from the board to the relay, the pump circuit and the USB cable, as wired in the box.
          links: [
            { from: 'b-5v', to: 'r-vcc', color: '#e8594a' },
            { from: 'b-gnd', to: 'r-gnd', color: '#2b2b33' },
            { from: 'b-26', to: 'r-in', color: '#ffd166' },
            { from: 'com', to: [34, 49], color: '#e8594a' },
            { from: 'no', to: [30, 49], color: '#e8594a' },
            { from: [18.2, 38], to: [38, 49], color: '#33363e' },
          ],
          cables: [
            { id: 'red', label: 'RED', color: '#e8594a', from: [84, 26], rest: [81, 18] },
            { id: 'black', label: 'BLACK', color: '#3a3440', from: [92, 26], rest: [95, 18] },
          ],
          meter: [88, 36],
          readings: [
            {
              id: 'x2',
              nets: ['sig', 'gnd'],
              value: '0.00 V',
              text: "The relay's IN line (RELAY_PIN 26) reads 0.0 V — LOW — while the log says \"Pump OFF\".",
              clueId: 'clue-probe-0v',
            },
            { id: 'm-vcc', nets: ['vcc', 'gnd'], value: '5.00 V', text: "The relay module's DC+: 5.0 V from the board.", note: 'It has power. Power was never the question.' },
            { id: 'm-3v3', nets: ['3v3', 'gnd'], value: '3.30 V', text: "The board's 3V3 pin: 3.3 V.", note: 'The board is healthy.' },
            {
              id: 'm-open',
              nets: ['com', 'nc'],
              value: 'OL',
              text: 'COM to NC: no beep — those contacts are open.',
              note: 'Whatever the relay is doing, it has switched away from NC.',
            },
            {
              id: 'm-contacts',
              nets: ['com', 'no'],
              value: '0.0 Ω ♪',
              text: "COM to NO: the meter beeps — the contacts are closed. The relay is passing the pump's power right now.",
              clueId: 'clue-relay-on',
            },
          ],
        },
      },
    ],
  },
  {
    id: 'soil-sensor',
    title: 'Soil moisture sensors',
    kicker: 'OBSERVE',
    tabs: [
      {
        id: 'look',
        label: 'Look',
        kind: 'list',
        items: [
          { id: 'y0', text: 'Left farm sensor, in soaked soil: 70%.', clueId: 'clue-sensor-honest' },
          { id: 'y1', text: 'Right farm sensor, in soaked soil: 72%.', clueId: 'clue-sensor-honest' },
          { id: 'y2', text: "Push the right one into Mika's dry test pot: it drops to 18%.", clueId: 'clue-sensor-honest' },
          { id: 'y3', text: 'Their cables run to the control box: SOIL_LEFT 34 and SOIL_RIGHT 35 — snug, and dry.', note: 'Well wired. Somebody was careful here.' },
        ],
      },
    ],
  },
];
