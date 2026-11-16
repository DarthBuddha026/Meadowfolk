import type { MissionPhase, Vec3 } from './types';
import type { InteractPoint, MapId } from './world-layout';

/** What the HUD objective line needs to know. */
export interface ObjectiveInfo {
  map: MapId;
  cluesFound: number;
  /** Every clue the mission hides (the counter reads found / total). */
  totalClues: number;
  /** Enough evidence (and every required clue) to state a claim. */
  readyToClaim: boolean;
  gemCollected: boolean;
}

/**
 * How one mission plays out in the world: who called, where things are, which
 * dialogue trees drive each phase, and the short lines around them. The mission
 * director runs every mission from this data — new missions are new data folders.
 */
export interface MissionScript {
  missionId: string;
  /** Map where the help seeker, the evidence and the gem are. */
  map: MapId;
  helpSeeker: { id: string; name: string; home: Vec3 };
  trees: {
    /** ENTRY: Captain T sets the scene. */
    entry: string;
    /** CALL_FOR_HELP: the help seeker explains. */
    callForHelp: string;
    /** Optional chat with the help seeker while investigating. */
    chat: string;
    hypothesis: string;
    /** RESULT trees: the success tree opens the reflection; every other one returns to the challenge. */
    success: string;
  };
  /**
   * 'arrival': the entry dialogue starts as the hero lands in Junction (Mission 1's welcome).
   * 'signal': the hero walks to the mission's help signal to start it.
   */
  entryAt: 'arrival' | 'signal';
  /** Interactables that open an evidence panel (the id is also the panel and camera shot). */
  evidence: string[];
  /** The evidence surface where the claim is tested (has the editable sketch). */
  challengeTarget: string;
  /** Camera shot while the test runs. */
  resultShot: string;
  /** Where the diamond marker floats over each interactable (on `map`). */
  markers: Record<string, Vec3>;
  /** Captain T's spot this phase. */
  mentorPoint: (phase: MissionPhase) => InteractPoint;
  gem: Vec3;
  labels: Record<string, string>;
  /** Interactable every step points to while the hero is on another map. */
  awayFocus: Partial<Record<MapId, string>>;
  objective: (phase: MissionPhase, info: ObjectiveInfo) => string;
  lines: {
    /** Captain T, as the hero lands for a mission that starts at its signal. */
    onArrive?: string;
    /** Captain T, once the entry dialogue ends. */
    afterEntry?: string;
    /** The help seeker, when the hero walks in during CALL_FOR_HELP. */
    greet?: string;
    /** The help seeker's short line per phase, when talked to outside a dialogue. */
    seeker: Partial<Record<MissionPhase, string>>;
    /** Touching evidence before talking to the help seeker. */
    askFirst: string;
    /** Enough clues, but a required one is missing. */
    stillGuessing: string;
    /** First line on the completion card. */
    complete: string;
  };
}
