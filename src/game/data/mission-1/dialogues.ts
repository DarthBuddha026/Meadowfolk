import type { DialogueTree } from '../types';

/**
 * Mission 1 — No Signal: dialogue trees.
 *
 * Captain T rules (GUIDE.md): he asks guiding questions and challenges
 * assumptions. He never gives answers, confirms a hypothesis, solves the
 * challenge, or reveals the root cause — not even after success.
 */

/** ENTRY — Captain T meets the hero in the plaza. */
const entry: DialogueTree = {
  id: 'm1-entry',
  stageId: 'plaza',
  startNodeId: 'welcome',
  nodes: [
    {
      id: 'welcome',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'Welcome to Junction, {heroName}. Feel that hum?',
      nextNodeId: 'windows',
    },
    {
      id: 'windows',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "Every light in those windows is someone's sketch, running somewhere in the real world.",
      nextNodeId: 'signal',
    },
    {
      id: 'signal',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "And that amber flicker at the Circuit Club house? That's a help signal. Someone's stuck.",
      choices: [
        { id: 'whats-wrong', text: "What's wrong with them?", nextNodeId: 'dont-know' },
        { id: 'on-my-way', text: "I'm on my way.", nextNodeId: 'go' },
      ],
    },
    {
      id: 'dont-know',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "I don't know yet. Neither do you. That's the best way to start.",
      nextNodeId: 'go',
    },
    {
      id: 'go',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'Go. And remember — look before you touch.',
    },
  ],
};

const askChoices = [
  { id: 'ask-what', text: "What's the display for?", nextNodeId: 'details', hideIfFlags: ['asked-details'] },
  { id: 'ask-before', text: 'Did it ever work?', nextNodeId: 'before', hideIfFlags: ['asked-before'] },
  { id: 'ask-password', text: 'Could the Wi-Fi password be wrong?', nextNodeId: 'password', hideIfFlags: ['asked-password'] },
];

/** CALL_FOR_HELP — Sarah explains the symptom. */
const callForHelp: DialogueTree = {
  id: 'm1-call-for-help',
  stageId: 'workshop',
  startNodeId: 'entry',
  nodes: [
    {
      id: 'entry',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: "Oh! Hi! Sorry — this is probably something dumb. My river-alert display won't go online. It just says Connecting… forever.",
      choices: [
        ...askChoices,
        { id: 'investigate', text: "Let's investigate the system together.", nextNodeId: 'mr-t-guidance', requiresFlags: ['asked-any'] },
      ],
    },
    {
      id: 'details',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: "It's for Project Bantay — the club's flood warning for the river. My display shows the river level. Once it's online, anyway.",
      setsFlags: ['asked-details', 'asked-any'],
      nextNodeId: 'entry-return',
    },
    {
      id: 'before',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: 'Yesterday, at home! I ran it on my laptop\'s hotspot and it connected right away. Here it just… doesn\'t.',
      setsFlags: ['asked-before', 'asked-any'],
      nextNodeId: 'entry-return',
    },
    {
      id: 'password',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: 'I triple-checked! I copied it off the router sticker, letter for letter.',
      setsFlags: ['asked-password', 'asked-any'],
      nextNodeId: 'entry-return',
    },
    {
      id: 'entry-return',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: 'Anything else you want to know?',
      choices: [...askChoices, { id: 'investigate', text: "Let's investigate the system together.", nextNodeId: 'mr-t-guidance' }],
    },
    {
      id: 'mr-t-guidance',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "Forever is a long time. What has the board actually told you while it waited? Engineers don't guess — they investigate.",
      choices: [{ id: 'ready', text: "I'm ready to investigate.", nextNodeId: 'sarah-wait' }],
    },
    {
      id: 'sarah-wait',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: 'Thank you! Look at anything you want — my laptop, the board, the router, the datasheet poster.',
    },
  ],
};

/** INVESTIGATION — optional chat with Sarah while gathering evidence. */
const sarahInvestigation: DialogueTree = {
  id: 'm1-sarah-investigation',
  stageId: 'workshop',
  startNodeId: 'start',
  nodes: [
    {
      id: 'start',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: "Find anything? The router's right there — I didn't touch it, promise.",
      choices: [
        { id: 'which-phone', text: 'Which network is your phone on?', nextNodeId: 'phone', hideIfFlags: ['asked-phone'] },
        { id: 'hotspot', text: 'Tell me about the hotspot that worked.', nextNodeId: 'hotspot', hideIfFlags: ['asked-hotspot'] },
        { id: 'keep-looking', text: "Still looking. I'll be back.", nextNodeId: 'bye' },
      ],
    },
    {
      id: 'phone',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: "ClubNet_5G — full bars! That's where I copied the network name from.",
      setsFlags: ['asked-phone'],
      effects: [{ type: 'UNLOCK_CLUE', clueId: 'clue-phone' }],
      nextNodeId: 'start',
    },
    {
      id: 'hotspot',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: "Just my laptop sharing its internet. I typed its name and password into the sketch, and it connected in two seconds flat.",
      setsFlags: ['asked-hotspot'],
      nextNodeId: 'start',
    },
    {
      id: 'bye',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: "Okay! I'll be right here.",
    },
  ],
};

/** HYPOTHESIS — the hero states a claim; Captain T challenges, never confirms. */
const hypothesis: DialogueTree = {
  id: 'm1-hypothesis',
  stageId: 'workshop',
  startNodeId: 'ask',
  nodes: [
    {
      id: 'ask',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "You've gathered evidence. So — what do you think is going on?",
      nextNodeId: 'choose',
    },
    {
      id: 'choose',
      speaker: 'player',
      speakerName: '{heroName}',
      text: 'I think…',
      choices: [
        { id: 'password', text: "…Sarah's Wi-Fi password is wrong.", nextNodeId: 'password' },
        { id: 'broken', text: "…the board's Wi-Fi is broken.", nextNodeId: 'broken' },
        { id: 'router', text: '…the router is down.', nextNodeId: 'router' },
        {
          id: 'band-mismatch',
          text: '…the board is looking for a network its radio can\'t hear.',
          nextNodeId: 'test-it',
          effects: [{ type: 'TRIGGER_EVENT', eventId: 'HYPOTHESIS:band-mismatch' }],
        },
      ],
    },
    {
      id: 'password',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'What did the board say went wrong — and is that the same thing?',
      effects: [{ type: 'TRIGGER_EVENT', eventId: 'HYPOTHESIS_REDIRECT' }],
      nextNodeId: 'choose',
    },
    {
      id: 'broken',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "It joined a hotspot yesterday. What's different about today's network?",
      effects: [{ type: 'TRIGGER_EVENT', eventId: 'HYPOTHESIS_REDIRECT' }],
      nextNodeId: 'choose',
    },
    {
      id: 'router',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'Is it? Something in this room is using it right now. What does that tell you?',
      effects: [{ type: 'TRIGGER_EVENT', eventId: 'HYPOTHESIS_REDIRECT' }],
      nextNodeId: 'choose',
    },
    {
      id: 'test-it',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "That's a claim. Claims get tested. What would you change to find out — and what would you expect to see?",
      nextNodeId: 'sarah-laptop',
    },
    {
      id: 'sarah-laptop',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: 'Use my laptop! The sketch is still open.',
    },
  ],
};

/** RESULT (success) — the display comes online. */
const resultSuccess: DialogueTree = {
  id: 'm1-result-success',
  stageId: 'workshop',
  startNodeId: 'online',
  nodes: [
    {
      id: 'online',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: "It's online! River: waiting for data! But… I typed that password perfectly the whole time.",
      nextNodeId: 'mr-t',
    },
    {
      id: 'mr-t',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'You did. So what changed — and why did it matter?',
    },
  ],
};

/** RESULT (unchanged) — the same network name, the same answer. No punishment. */
const resultSame: DialogueTree = {
  id: 'm1-result-same',
  stageId: 'workshop',
  startNodeId: 'dots',
  nodes: [
    {
      id: 'dots',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: 'Still dots. Same message as before: WL_NO_SSID_AVAIL.',
      nextNodeId: 'mr-t',
    },
    {
      id: 'mr-t',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: "Good — that's data, not failure. Same test, same answer. What did your claim say needed to change?",
    },
  ],
};

/** RESULT (a name the router doesn't broadcast). */
const resultNotFound: DialogueTree = {
  id: 'm1-result-not-found',
  stageId: 'workshop',
  startNodeId: 'dots',
  nodes: [
    {
      id: 'dots',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: "Still dots — and it still can't find the network.",
      nextNodeId: 'mr-t',
    },
    {
      id: 'mr-t',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'Names are exact — every letter, every capital. Is that a name the router actually broadcasts?',
    },
  ],
};

/** RESULT (the right network, the wrong password) — a different, honest error. */
const resultPassword: DialogueTree = {
  id: 'm1-result-password',
  stageId: 'workshop',
  startNodeId: 'new-error',
  nodes: [
    {
      id: 'new-error',
      speaker: 'npc',
      speakerName: 'Sarah',
      text: 'Wait — a different message this time! WL_CONNECT_FAILED.',
      nextNodeId: 'mr-t',
    },
    {
      id: 'mr-t',
      speaker: 'mr-t',
      speakerName: 'Captain T',
      text: 'Different words, different problem. It found something this time. What did it trip over?',
    },
  ],
};

export const MISSION_1_DIALOGUES: DialogueTree[] = [
  entry,
  callForHelp,
  sarahInvestigation,
  hypothesis,
  resultSuccess,
  resultSame,
  resultNotFound,
  resultPassword,
];
