import type { MissionScript } from '../mission-script';
import { INTERACT_POINTS, MR_T_PLAZA, WORKSHOP } from '../world-layout';

const flat = (p: readonly number[], y = 0): [number, number, number] => [p[0], y, p[2]];

/** Mission 1 — No Signal: Sarah's river-alert display, inside the Circuit Club. */
export const MISSION_1_SCRIPT: MissionScript = {
  missionId: 'mission-1',
  map: 'clubhouse',
  helpSeeker: { id: 'sarah', name: 'Sarah', home: WORKSHOP.sarahHome },
  trees: {
    entry: 'm1-entry',
    callForHelp: 'm1-call-for-help',
    chat: 'm1-sarah-investigation',
    hypothesis: 'm1-hypothesis',
    success: 'm1-result-success',
  },
  entryAt: 'arrival',
  evidence: ['laptop', 'board', 'poster', 'router'],
  challengeTarget: 'laptop',
  resultShot: 'result-m1',
  markers: {
    laptop: flat(WORKSHOP.laptop),
    board: flat(WORKSHOP.board),
    poster: flat(WORKSHOP.poster.position, 0.1),
    router: flat(WORKSHOP.router),
    sarah: flat(WORKSHOP.sarahHome),
  },
  mentorPoint: (phase) =>
    phase === 'entry' ? { map: 'junction', position: MR_T_PLAZA, radius: 1.7 } : INTERACT_POINTS['mr-t'],
  gem: WORKSHOP.gem,
  labels: {
    sarah: 'Talk to Sarah',
    laptop: "Use Sarah's laptop",
    board: 'Inspect the board and display',
    poster: 'Read the datasheet poster',
    router: 'Inspect the Wi-Fi router',
  },
  awayFocus: { junction: 'door-clubhouse' },
  objective: (phase, i) => {
    switch (phase) {
      case 'entry':
        return 'Listen to Captain T';
      case 'callForHelp':
        return i.map === 'junction' ? 'Answer the help signal — enter the Circuit Club house' : 'Find out who called for help';
      case 'investigation':
        return i.readyToClaim
          ? `Tell Captain T your hypothesis — clues ${i.cluesFound}/${i.totalClues}`
          : `Investigate the clubroom — clues found ${i.cluesFound}/${i.totalClues}`;
      case 'hypothesis':
        return 'State your hypothesis to Captain T';
      case 'challenge':
        return "Test your claim on Sarah's laptop";
      case 'result':
        return 'Watch the display';
      case 'reflection':
        return 'Reflect on what you learned';
      default:
        return 'Collect your Insight Gem';
    }
  },
  lines: {
    afterEntry: 'The signal is coming from the Circuit Club house, east of the plaza. Someone is waiting inside.',
    greet: 'Oh! Hi — over here!',
    seeker: {
      hypothesis: "Captain T's waiting to hear what you think!",
      challenge: 'Go ahead — use my laptop!',
      reward: "It's online! I'm telling the whole Circuit Club!",
    },
    askFirst: "Easy. That's Sarah's project. Ask before you touch.",
    stillGuessing: "You're close. But one piece is still a guess. Have you checked both ends of the connection — the router and the board?",
    complete: "Sarah's display is online — the first light of Project Bantay. And you know exactly why it couldn't connect.",
  },
};
