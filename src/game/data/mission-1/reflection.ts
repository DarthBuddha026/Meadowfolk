import type { Reflection } from '../types';

/**
 * Mission 1 — authored reflection (shown only after success).
 * Captain T asks the question; these sections carry the conclusions.
 */
export const MISSION_1_REFLECTION: Reflection = {
  missionId: 'mission-1',
  mentorPrompt: 'Before the System can remember this — say it plainly. What actually went wrong?',
  sections: [
    {
      heading: 'What went wrong',
      body: "Sarah's river-alert display never joined the network. It printed dots, then WL_NO_SSID_AVAIL, over and over.",
    },
    {
      heading: 'Why it failed',
      body: "The sketch asked for ClubNet_5G — the router's 5 GHz network. The ESP32's radio only works on the 2.4 GHz band, so to the board that network didn't exist. Her phone could see it; her board never could. Yesterday's hotspot broadcast on 2.4 GHz, which is why it worked.",
    },
    {
      heading: 'How it was fixed',
      body: "The sketch now names ClubNet, the router's 2.4 GHz network. Same password — it was right all along.",
    },
    {
      heading: 'Concept learned',
      body: 'A connection needs both sides to speak the same radio. What your phone can see is not what your device can see — check what the device supports.',
    },
    {
      heading: 'Debugging habit',
      body: 'Read the exact error. "Not found" and "wrong password" are different failures with different causes — the status said which one before anyone touched the password.',
    },
  ],
  inYourField: {
    electronics: 'Every radio module lives on a band. Before you pick an antenna, a network or a part, read which frequencies it actually speaks.',
    robotics: 'Robots on a busy field talk over radio. Know which band your controller and your robot share before the match — not during it.',
    software: 'A network name is an exact string, like every config value your code depends on. Error codes tell you which one failed — read them by name.',
    computer: 'Interfaces only work when both ends implement the same standard. Today it was a radio band; tomorrow it will be a protocol version.',
    aerospace: 'Spacecraft and ground stations agree on frequencies long before launch. Every link budget starts with: can these two radios hear each other at all?',
    ai: 'Edge devices feed models through networks. If the device never joins, the smartest model upstream never sees a single reading.',
  },
  gemName: 'Same Wavelength',
  gemColor: '#4d8dff',
};
