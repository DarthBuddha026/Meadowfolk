import type { MissionScript } from '../mission-script';
import { GARDEN, MR_T_GREENHOUSE } from '../world-layout';

const flat = (p: readonly number[], y = 0): [number, number, number] => [p[0], y, p[2]];

/** Mission 2 — The Pump That Won't Quit: Mika's greenhouse, southwest of the plaza. */
export const MISSION_2_SCRIPT: MissionScript = {
  missionId: 'mission-2',
  map: 'greenhouse',
  helpSeeker: { id: 'mika', name: 'Mika', home: GARDEN.mikaHome },
  trees: {
    entry: 'm2-entry',
    callForHelp: 'm2-call-for-help',
    chat: 'm2-mika-investigation',
    hypothesis: 'm2-hypothesis',
    success: 'm2-result-success',
  },
  entryAt: 'signal',
  evidence: ['tablet', 'relay-box', 'soil-sensor'],
  challengeTarget: 'tablet',
  resultShot: 'result-m2',
  markers: {
    tablet: flat(GARDEN.tablet),
    'relay-box': flat(GARDEN.controlPost, 0.3),
    'soil-sensor': flat(GARDEN.sensor),
    mika: flat(GARDEN.mikaHome),
  },
  // Captain T waits at the signal outside, then joins Mika in the greenhouse.
  mentorPoint: (phase) =>
    phase === 'entry'
      ? { map: 'junction', position: MR_T_GREENHOUSE, radius: 1.7 }
      : { map: 'greenhouse', position: GARDEN.mrTHome, radius: 1.7 },
  gem: GARDEN.gem,
  labels: {
    mika: 'Talk to Mika',
    tablet: "Use Mika's tablet",
    'relay-box': 'Open the control box',
    'soil-sensor': 'Check the soil sensors',
  },
  awayFocus: { junction: 'door-greenhouse', clubhouse: 'door-exit' },
  objective: (phase, i) => {
    switch (phase) {
      case 'entry':
        return i.map === 'junction' ? "Answer the new signal — Mika's greenhouse, southwest of the plaza" : 'Head outside — a new signal is calling';
      case 'callForHelp':
        return i.map === 'greenhouse' ? 'Find out who called for help' : 'Answer the help signal — enter the greenhouse';
      case 'investigation':
        return i.readyToClaim
          ? `Tell Captain T your hypothesis — clues ${i.cluesFound}/${i.totalClues}`
          : `Investigate the greenhouse — clues found ${i.cluesFound}/${i.totalClues}`;
      case 'hypothesis':
        return 'State your hypothesis to Captain T';
      case 'challenge':
        return "Test your claim on Mika's tablet";
      case 'result':
        return 'Watch the pump';
      case 'reflection':
        return 'Reflect on what you learned';
      default:
        return 'Collect your Insight Gem';
    }
  },
  lines: {
    onArrive: "Another signal's lit up — southwest of the plaza. Mika's greenhouse. I'll meet you there.",
    afterEntry: "Mika's inside. Go on — and mind your feet.",
    greet: 'In here! Mind the puddles!',
    seeker: {
      hypothesis: "Captain T's waiting on you. I'm waiting on my tomatoes.",
      challenge: 'The sketch is on my tablet — go ahead.',
      reward: 'Dry paths! I might plant something where the puddles were.',
    },
    askFirst: "That's Mika's greenhouse. Talk to her before you touch anything.",
    stillGuessing: "You're close. But one piece is still a guess. Have you checked both ends of that wire — what the board sends, and what the relay wants?",
    complete: "Mika's pump finally listens — and you know exactly what LOW meant to it.",
  },
};
