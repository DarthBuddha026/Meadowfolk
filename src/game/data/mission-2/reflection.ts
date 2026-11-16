import type { Reflection } from '../types';

/**
 * Mission 2 — authored reflection (shown only after success).
 * Captain T asks the question; these sections carry the conclusions.
 */
export const MISSION_2_REFLECTION: Reflection = {
  missionId: 'mission-2',
  mentorPrompt: 'Before the System can remember this — say it plainly. Why did "off" turn the pump on?',
  sections: [
    {
      heading: 'What went wrong',
      body: "Mika's pump ran while the soil was soaked, and the screen insisted it was off. It even started before the sketch had read the soil.",
    },
    {
      heading: 'Why it failed',
      body: 'The relay module is active-LOW: a LOW on its input switches it on. The sketch was written for a relay that switches on with HIGH, so every "pump OFF" switched the pump on — including the very first write in setup().',
    },
    {
      heading: 'How it was fixed',
      body: "Every write to RELAY_PIN now speaks the relay's language: LOW for on, HIGH for off. setup() starts with HIGH, so the pump stays off at boot.",
    },
    {
      heading: 'Concept learned',
      body: 'A signal means whatever the device receiving it says it means. HIGH isn\'t "on" until you have checked what the receiver expects.',
    },
    {
      heading: 'Debugging habit',
      body: 'When the log and the hardware disagree, believe the hardware — and measure. A log only reports what the code intended.',
    },
  ],
  inYourField: {
    electronics: 'Active-low inputs are everywhere: resets, chip selects, enables. A bar over a pin name on a datasheet is telling you this exact story.',
    robotics: 'Motor drivers, brakes and enable pins often trigger on LOW. A robot that lurches at power-up usually has a pin that starts in the wrong state.',
    software: 'Your log is a claim about the world, not a measurement of it. Instrument what actually happened, not just what the code meant.',
    computer: "Every peripheral defines its own logic levels. Drivers exist so that 'on' means the same thing on both sides of the wire.",
    aerospace: "Flight hardware documents every signal's polarity and tests it at power-up — because power-up is when a wrong default fires a valve.",
    ai: "A model's decision is only as good as the actuator that obeys it. Swap 'act' and 'don't act' downstream, and a perfect prediction floods the garden.",
  },
  gemName: 'Read the Receiver',
  gemColor: '#19b3a6',
};
