import type { DialogueTree } from '../types';

/**
 * Mission 2 — The Pump That Won't Quit: dialogue trees.
 *
 * Captain T rules (GUIDE.md): he asks guiding questions and challenges
 * assumptions. He never gives answers, confirms a hypothesis, solves the
 * challenge, or reveals the root cause — not even after success.
 */

/** ENTRY — Captain T meets the hero at the help signal outside the greenhouse. */
const entry: DialogueTree = {
  id: 'm2-entry',
  stageId: 'greenhouse-entry',
  startNodeId: 'smell',
  nodes: [
    {
      id: 'smell',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'Another signal, {heroName}. Smell that? Wet earth. A lot of it.',
      nextNodeId: 'garden',
    },
    {
      id: 'garden',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "That's Mika's greenhouse. Her beds water themselves — or they're supposed to.",
      choices: [
        { id: 'whats-wrong', text: "What's wrong with it?", nextNodeId: 'dont-know' },
        { id: 'on-it', text: "Let's find out.", nextNodeId: 'go' },
      ],
    },
    {
      id: 'dont-know',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'I know what Mika told the System. You know nothing yet. Good — nothing to unlearn.',
      nextNodeId: 'go',
    },
    {
      id: 'go',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'Same as before: look before you touch. Ask before you fix.',
    },
  ],
};

const askChoices = [
  { id: 'ask-system', text: 'How is the watering supposed to work?', nextNodeId: 'system', hideIfFlags: ['asked-system'] },
  { id: 'ask-when', text: 'When does the pump run?', nextNodeId: 'when', hideIfFlags: ['asked-when'] },
  { id: 'ask-changed', text: 'Did anything change recently?', nextNodeId: 'changed', hideIfFlags: ['asked-changed'] },
];

/** CALL_FOR_HELP — Mika explains the symptom. */
const callForHelp: DialogueTree = {
  id: 'm2-call-for-help',
  stageId: 'garden',
  startNodeId: 'entry',
  nodes: [
    {
      id: 'entry',
      speaker: 'npc',
      speakerName: 'Mika',
      text: 'Oh, thank goodness — mind the puddles! My pump won\'t stop. The screen says Pump OFF, and the pump disagrees.',
      choices: [
        ...askChoices,
        { id: 'investigate', text: "Let's investigate the system together.", nextNodeId: 'mr-t-guidance', requiresFlags: ['asked-any'] },
      ],
    },
    {
      id: 'system',
      speaker: 'npc',
      speakerName: 'Mika',
      text: 'A sensor in each farm reads the soil. If either bed is dry, the board switches the pump on through a relay. Wet, it switches it off. That\'s the idea, anyway.',
      setsFlags: ['asked-system', 'asked-any'],
      nextNodeId: 'entry-return',
    },
    {
      id: 'when',
      speaker: 'npc',
      speakerName: 'Mika',
      text: "All the time! The moment I plug the board in, it starts — before it's even looked at the soil.",
      setsFlags: ['asked-when', 'asked-any'],
      effects: [{ type: 'UNLOCK_CLUE', clueId: 'clue-boot-run' }],
      nextNodeId: 'entry-return',
    },
    {
      id: 'changed',
      speaker: 'npc',
      speakerName: 'Mika',
      text: 'The Circuit Club rebuilt my control box last week, so it can flash an alert light for Project Bantay. Same sketch as before.',
      setsFlags: ['asked-changed', 'asked-any'],
      nextNodeId: 'entry-return',
    },
    {
      id: 'entry-return',
      speaker: 'npc',
      speakerName: 'Mika',
      text: 'What else?',
      choices: [...askChoices, { id: 'investigate', text: "Let's investigate the system together.", nextNodeId: 'mr-t-guidance' }],
    },
    {
      id: 'mr-t-guidance',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'Two witnesses, two stories. The screen says off. The pump says on. Which one has wet feet?',
      choices: [{ id: 'ready', text: "I'll find out.", nextNodeId: 'mika-wait' }],
    },
    {
      id: 'mika-wait',
      speaker: 'npc',
      speakerName: 'Mika',
      text: "The sketch is on my tablet, on the device table. The board and the relay are in the grey box on the post. There's a soil sensor in each farm.",
    },
  ],
};

/** INVESTIGATION — optional chat with Mika while gathering evidence. */
const mikaInvestigation: DialogueTree = {
  id: 'm2-mika-investigation',
  stageId: 'garden',
  startNodeId: 'start',
  nodes: [
    {
      id: 'start',
      speaker: 'npc',
      speakerName: 'Mika',
      text: "Any luck? I've started calling it the pump that won't quit.",
      choices: [
        { id: 'ask-relay', text: "What's the relay for?", nextNodeId: 'relay', hideIfFlags: ['asked-relay'] },
        { id: 'ask-sketch', text: 'Where did the sketch come from?', nextNodeId: 'sketch', hideIfFlags: ['asked-sketch'] },
        { id: 'ask-when', text: 'When does the pump start?', nextNodeId: 'when', hideIfFlags: ['asked-when'] },
        { id: 'keep-looking', text: "Still looking. I'll be back.", nextNodeId: 'bye' },
      ],
    },
    {
      id: 'relay',
      speaker: 'npc',
      speakerName: 'Mika',
      text: "The board's too weak to run a pump by itself. The relay is a switch it can flip — click, pump on; click, pump off.",
      setsFlags: ['asked-relay'],
      nextNodeId: 'start',
    },
    {
      id: 'sketch',
      speaker: 'npc',
      speakerName: 'Mika',
      text: 'Alex wrote it from a watering tutorial. HIGH for on, LOW for off — the comments say so right there.',
      setsFlags: ['asked-sketch'],
      nextNodeId: 'start',
    },
    {
      id: 'when',
      speaker: 'npc',
      speakerName: 'Mika',
      text: 'The second I plug the board in. Before it has read a single drop of soil.',
      setsFlags: ['asked-when'],
      effects: [{ type: 'UNLOCK_CLUE', clueId: 'clue-boot-run' }],
      nextNodeId: 'start',
    },
    {
      id: 'bye',
      speaker: 'npc',
      speakerName: 'Mika',
      text: "I'll be here, bailing water.",
    },
  ],
};

/** HYPOTHESIS — the hero states a claim; Captain T challenges, never confirms. */
const hypothesis: DialogueTree = {
  id: 'm2-hypothesis',
  stageId: 'garden',
  startNodeId: 'ask',
  nodes: [
    {
      id: 'ask',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "Evidence first, then claims. You've got evidence. So — what's happening here?",
      nextNodeId: 'choose',
    },
    {
      id: 'choose',
      speaker: 'player',
      speakerName: '{heroName}',
      text: 'I think…',
      choices: [
        { id: 'sensor', text: '…the moisture sensor is lying.', nextNodeId: 'sensor' },
        { id: 'wiring', text: '…the pump is wired to the wrong relay terminals.', nextNodeId: 'wiring' },
        { id: 'board', text: "…the board isn't sending what the code says.", nextNodeId: 'board' },
        {
          id: 'active-low',
          text: "…this relay switches on when its input is LOW — so the code's 'off' is the relay's 'on'.",
          nextNodeId: 'test-it',
          effects: [{ type: 'TRIGGER_EVENT', eventId: 'HYPOTHESIS:active-low' }],
        },
      ],
    },
    {
      id: 'sensor',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'What does the soil look like? What does the sensor say? Do they disagree?',
      effects: [{ type: 'TRIGGER_EVENT', eventId: 'HYPOTHESIS_REDIRECT' }],
      nextNodeId: 'choose',
    },
    {
      id: 'wiring',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "Maybe. Then why does the relay's own light come on with the pump? What is the relay being told?",
      effects: [{ type: 'TRIGGER_EVENT', eventId: 'HYPOTHESIS_REDIRECT' }],
      nextNodeId: 'choose',
    },
    {
      id: 'board',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'Did you measure that pin? Did the board send what the code told it to?',
      effects: [{ type: 'TRIGGER_EVENT', eventId: 'HYPOTHESIS_REDIRECT' }],
      nextNodeId: 'choose',
    },
    {
      id: 'test-it',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "That's a claim. How would you test it — and what should the pump do if you're right?",
      nextNodeId: 'mika-tablet',
    },
    {
      id: 'mika-tablet',
      speaker: 'npc',
      speakerName: 'Mika',
      text: 'The sketch is on my tablet. Change whatever you need.',
    },
  ],
};

/** RESULT trees — Mika reports what the pump actually did; Captain T asks. */
function result(id: string, mika: string, mrT: string): DialogueTree {
  return {
    id,
    stageId: 'garden',
    startNodeId: 'mika',
    nodes: [
      { id: 'mika', speaker: 'npc', speakerName: 'Mika', text: mika, nextNodeId: 'mr-t' },
      { id: 'mr-t', speaker: 'mr-t', speakerName: 'Captain T', text: mrT },
    ],
  };
}

export const MISSION_2_DIALOGUES: DialogueTree[] = [
  entry,
  callForHelp,
  mikaInvestigation,
  hypothesis,
  result(
    'm2-result-success',
    "It booted — not a drop. Wet beds, pump quiet. Now the dry pot… it's watering! Back in the wet bed… it stops!",
    'Same pump. Same board. So what changed — and why did it matter?'
  ),
  result(
    'm2-result-backwards',
    'Still running on the wet beds. And when I tried the dry pot — nothing at all.',
    "Good — that's data, not failure. Same behaviour as before. What did your claim say needed to change?"
  ),
  result(
    'm2-result-never',
    'Quiet on the wet beds — finally! But the dry pot got nothing either. Now it never runs.',
    'Off works. On doesn\'t. When the soil is dry, what does the relay hear?'
  ),
  result(
    'm2-result-always',
    "It's running on the wet beds AND the dry pot. Now it never stops.",
    "On works. Off doesn't. When the soil is wet, what does the relay hear?"
  ),
  result(
    'm2-result-boot',
    'So close! Wet beds quiet, dry pot watering… but when it booted, it gave a two-second spurt first.',
    'Before the loop ever reads the soil, the board tells the relay one thing. What is it?'
  ),
];
