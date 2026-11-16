import type { ChallengeRun, MissionChallenge } from '../types';

/**
 * Mission 1 — No Signal: the hands-on test.
 *
 * The player edits the network name and password in Sarah's sketch and uploads.
 * The simulated board behaves like a real ESP32 (GAME_CONCEPT §4.1: the System
 * cannot lie): its radio only hears 2.4 GHz, so ClubNet_5G is never found
 * (WL_NO_SSID_AVAIL); names are exact, so any typo is not found either; the
 * right network with a wrong password is found but refused (WL_CONNECT_FAILED —
 * the status a wrong password reports varies between Arduino-ESP32 core versions;
 * this follows the common one), and a password under 8 characters is rejected
 * before the board even tries.
 */

const NETWORK_24 = 'ClubNet';
const NETWORK_5 = 'ClubNet_5G';
const PASSWORD = 'fixthings2gether';
export const BOARD_IP = '192.168.1.42';

const dots = (n: number) => '.'.repeat(n);

function run(fields: Record<string, string>): ChallengeRun {
  const ssid = fields.SSID;
  const password = fields.PASSWORD;
  const first = `Connecting to ${ssid}`;
  if (password.length > 0 && password.length < 8) {
    return {
      serial: ['[E][WiFiSTA.cpp] begin(): passphrase too short!', first, `${dots(20)} WiFi status: WL_CONNECT_FAILED`],
      outcome: 'wrong-password',
      success: false,
    };
  }
  if (ssid === NETWORK_24) {
    if (password === PASSWORD) return { serial: [first, dots(5) + BOARD_IP], outcome: 'connected', success: true };
    return {
      serial: [first, `${dots(20)} WiFi status: WL_CONNECT_FAILED`, `${dots(20)} WiFi status: WL_CONNECT_FAILED`],
      outcome: 'wrong-password',
      success: false,
    };
  }
  return {
    serial: [first, `${dots(20)} WiFi status: WL_NO_SSID_AVAIL`, `${dots(20)} WiFi status: WL_NO_SSID_AVAIL`],
    outcome: ssid === NETWORK_5 ? 'same' : 'not-found',
    success: false,
  };
}

const RESULT_TREES: Record<string, string> = {
  connected: 'm1-result-success',
  same: 'm1-result-same',
  'not-found': 'm1-result-not-found',
  'wrong-password': 'm1-result-password',
};

export const MISSION_1_CHALLENGE: MissionChallenge = {
  fields: { SSID: NETWORK_5, PASSWORD },
  solvedFields: { SSID: NETWORK_24, PASSWORD },
  editors: {
    SSID: { kind: 'text', maxLength: 32, label: 'Wi-Fi network name (ssid)' },
    PASSWORD: { kind: 'text', maxLength: 63, label: 'Wi-Fi password' },
  },
  compile: (fields) => {
    const bad = Object.entries(fields).find(([, v]) => v.includes('"') || v.includes('\\'));
    return bad ? `sketch.ino:${bad[0] === 'SSID' ? 4 : 5}:24: error: missing terminating " character` : null;
  },
  uploadLog: [
    'Compiling sketch...',
    'Sketch uses 742,113 bytes (56%) of program storage space.',
    'Connecting.... Chip is ESP32-D0WD-V3 (revision v3.1)',
    'Writing at 0x00010000... (100 %)',
    'Hard resetting via RTS pin...',
    'Done uploading.',
  ],
  run,
  resultTree: (outcome) => RESULT_TREES[outcome] ?? 'm1-result-same',
  introLine: 'Your claim, your test. Change only what the evidence points to — then watch.',
};

/** What the river-alert display shows while a sketch with these fields runs. */
export function displayState(fields: Record<string, string>): 'online' | 'connecting' {
  return run(fields).success ? 'online' : 'connecting';
}
