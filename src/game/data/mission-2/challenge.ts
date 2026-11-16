import type { ChallengeRun, MissionChallenge } from '../types';

/**
 * Mission 2 — The Pump That Won't Quit: the hands-on test.
 *
 * The player flips the three relay writes in Mika's sketch (setup's first write,
 * "pump ON", "pump OFF") and uploads. The simulated relay behaves like a real
 * active-LOW module (GAME_CONCEPT §4.1: the System cannot lie): a LOW on its input
 * switches the pump on. setup() holds its first write for two seconds while the
 * sensor settles, so a LOW there runs the pump at every boot.
 */

/** The relay energises (and the pump runs) when its input is LOW. */
export const relayOn = (level: string) => level === 'LOW';

/** Seconds setup() holds its first write before the loop reads the soil. */
export const SETTLE_SECONDS = 2;

/** Is the pump running `t` seconds after boot, with the soil this wet? */
export function pumpRunning(fields: Record<string, string>, t: number, soilWet = true): boolean {
  if (t < SETTLE_SECONDS) return relayOn(fields.START);
  return relayOn(soilWet ? fields.OFF : fields.ON);
}

function run(fields: Record<string, string>): ChallengeRun {
  const onWhenDry = relayOn(fields.ON);
  const onWhenWet = relayOn(fields.OFF);
  const outcome = onWhenWet
    ? onWhenDry
      ? 'always'
      : 'backwards'
    : !onWhenDry
      ? 'never'
      : relayOn(fields.START)
        ? 'boot'
        : 'fixed';
  // The log only reports what the sketch decided — never what the pump did.
  return {
    serial: ['soil: 72% -> Pump OFF', 'soil: 18% -> Pump ON', 'soil: 71% -> Pump OFF'],
    outcome,
    success: outcome === 'fixed',
  };
}

const RESULT_TREES: Record<string, string> = {
  fixed: 'm2-result-success',
  backwards: 'm2-result-backwards',
  never: 'm2-result-never',
  always: 'm2-result-always',
  boot: 'm2-result-boot',
};

const LEVEL = { kind: 'toggle' as const, options: ['HIGH', 'LOW'] };

export const MISSION_2_CHALLENGE: MissionChallenge = {
  fields: { START: 'LOW', ON: 'HIGH', OFF: 'LOW' },
  solvedFields: { START: 'HIGH', ON: 'LOW', OFF: 'HIGH' },
  editors: {
    START: { ...LEVEL, label: "setup()'s first write" },
    ON: { ...LEVEL, label: '"pump ON" write' },
    OFF: { ...LEVEL, label: '"pump OFF" write' },
  },
  compile: () => null,
  uploadLog: [
    'Compiling sketch...',
    'Sketch uses 289,457 bytes (22%) of program storage space.',
    'Connecting.... Chip is ESP32-D0WD-V3 (revision v3.1)',
    'Writing at 0x00010000... (100 %)',
    'Hard resetting via RTS pin...',
    'Done uploading.',
  ],
  run,
  resultTree: (outcome) => RESULT_TREES[outcome] ?? 'm2-result-backwards',
  introLine: 'Your claim, your test. Change only what the evidence points to — then watch the pump.',
};
