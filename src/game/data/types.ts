/**
 * Shared data types for missions, dialogue, and investigation.
 * Ported from trioe-lms-mission so mission content stays interchangeable.
 */

export type Vec3 = [number, number, number];

export type SpeakerType = 'npc' | 'player' | 'mr-t' | 'system';

export type MissionPhase =
  | 'entry'
  | 'callForHelp'
  | 'investigation'
  | 'hypothesis'
  | 'challenge'
  | 'result'
  | 'reflection'
  | 'reward';

/* ------------------------------------------------------------------ */
/* Dialogue                                                            */
/* ------------------------------------------------------------------ */

export type DialogueEffect =
  | { type: 'UNLOCK_CLUE'; clueId: string }
  | { type: 'SET_FLAG'; flagId: string }
  | { type: 'TRIGGER_EVENT'; eventId: string };

export interface DialogueChoice {
  id: string;
  text: string;
  nextNodeId: string;
  effects?: DialogueEffect[];
  requiresFlags?: string[];
  /** Hide this choice once these flags are set (e.g. already-asked questions). */
  hideIfFlags?: string[];
}

export interface DialogueNode {
  id: string;
  speaker: SpeakerType;
  /** Display name override. `{heroName}` is replaced at render time. */
  speakerName?: string;
  /** Line text. `{heroName}` and `{role}` are replaced at render time. */
  text: string;
  choices?: DialogueChoice[];
  /** Node to continue to when there are no choices. Absent = tree ends. */
  nextNodeId?: string;
  setsFlags?: string[];
  effects?: DialogueEffect[];
}

/**
 * A conversation "stage": where each character stands and where the camera
 * frames the shot. Follows the GUIDE.md composition rule —
 * Left = help seeker, Right = player hero, Bottom-center = Captain T.
 */
export interface ConversationStage {
  npc?: Vec3;
  hero: Vec3;
  mrT?: Vec3;
  camera: Vec3;
  lookAt: Vec3;
}

export interface DialogueTree {
  id: string;
  /** Who is physically on stage (drives positioning + speaker highlight). */
  stageId: string;
  startNodeId: string;
  nodes: DialogueNode[];
}

/* ------------------------------------------------------------------ */
/* Investigation                                                       */
/* ------------------------------------------------------------------ */

export type ClueCategory = 'evidence' | 'observation' | 'analysis' | 'system' | 'code';

export interface Clue {
  id: string;
  title: string;
  description: string;
  category: ClueCategory;
  dependencies?: string[];
  requiredForCompletion?: boolean;
  /** Captain T's guiding reaction when the clue is found (never an answer). */
  mentorLine?: string;
}

export interface InvestigationData {
  missionId: string;
  clues: Clue[];
  minimumCluesRequired: number;
  /** Captain T's nudge when evidence is examined before its prerequisites, per clue id. */
  missingDependencyLines?: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Evidence surfaces — what each inspectable object shows             */
/* ------------------------------------------------------------------ */

export interface EvidenceItem {
  id: string;
  /** What the player sees (code line, log line, observation). `{FIELD}` = a sketch field. */
  text: string;
  /** Clue this item reveals when examined. */
  clueId?: string;
  /** Flavor line shown when examined (no clue). */
  note?: string;
}

export interface EvidenceTab {
  id: string;
  label: string;
  /** code = the sketch (editable fields during the challenge), log = device output, list = observations, wiring = a hands-on cable board. */
  kind: 'code' | 'log' | 'list' | 'wiring';
  items: EvidenceItem[];
  /** This tab shows the upload log and the new run's output once the player uploads. */
  output?: boolean;
  board?: WiringBoard;
}

/* ------------------------------------------------------------------ */
/* Wiring boards — drag a cable's loose end onto a port                */
/* ------------------------------------------------------------------ */

/** A point in board space (the SVG viewBox is 100 × 64). */
export type BoardPt = [number, number];

export interface WirePort {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Ports wired together share a net (default: the port id); probe readings are keyed by net. */
  net?: string;
  /** Unit direction pointing out of the device here (default: from the device edge the port sits on). */
  out?: BoardPt;
  /** Print the label outside the device instead of inside. */
  labelOutside?: boolean;
}

export interface WireDevice {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  ports: WirePort[];
  /** Draw the device as it looks in the world instead of a plain slab (x/y/w/h = its bounding box). */
  art?: 'laptop' | 'display' | 'esp32' | 'plate' | 'enclosure' | 'relay' | 'meter';
}

export interface WireCable {
  id: string;
  label: string;
  color: string;
  /** The fixed end. */
  from: BoardPt;
  /** Where the loose end lies while unplugged. */
  rest: BoardPt;
}

/** What the multimeter shows with its probes across two nets. */
export interface WireReading extends EvidenceItem {
  nets: [string, string];
  value: string;
}

/**
 * A hands-on board. Guided (`steps`): Boldoo-style numbered steps for checks and setup
 * that are never the mission's answer — only the current cable moves, its port glows,
 * a wrong drop springs back, and finishing examines `done`. Probe (`readings`): the
 * `red` and `black` cables are multimeter probes the player places freely; each
 * reading is examined like any evidence item.
 */
export interface WiringBoard {
  devices: WireDevice[];
  cables: WireCable[];
  steps?: { cable: string; port: string; text: string }[];
  done?: EvidenceItem;
  readings?: WireReading[];
  /** Fixed wiring drawn for the picture (not draggable): each end is a port id or a point. */
  links?: { from: string | BoardPt; to: string | BoardPt; color: string }[];
  /** Where the multimeter prints its value. */
  meter?: BoardPt;
}

/** An inspectable object: its id is also its interact point, panel and camera shot. */
export interface EvidenceSurface {
  id: string;
  title: string;
  kicker: string;
  tabs: EvidenceTab[];
}

/* ------------------------------------------------------------------ */
/* Challenge — the hands-on test on simulated hardware                 */
/* ------------------------------------------------------------------ */

export type FieldEditor = { kind: 'text'; maxLength: number; label: string } | { kind: 'toggle'; options: string[]; label: string };

export interface ChallengeRun {
  /** What the device prints after the upload. */
  serial: string[];
  /** Names the behaviour the player will observe; picks the RESULT dialogue. */
  outcome: string;
  success: boolean;
}

/**
 * A mission's hands-on test. The simulation is pure and must behave like the real
 * hardware would (GAME_CONCEPT §4.1: the System cannot lie).
 */
export interface MissionChallenge {
  /** The sketch's editable fields as the help seeker left them. */
  fields: Record<string, string>;
  /** The fields once the problem is understood and fixed (how the world looks afterwards). */
  solvedFields: Record<string, string>;
  editors: Record<string, FieldEditor>;
  /** Compiler error line, or null when the sketch compiles. */
  compile: (fields: Record<string, string>) => string | null;
  uploadLog: string[];
  run: (fields: Record<string, string>) => ChallengeRun;
  resultTree: (outcome: string) => string;
  introLine: string;
}

/* ------------------------------------------------------------------ */
/* Reflection                                                          */
/* ------------------------------------------------------------------ */

export type RoleId =
  | 'robotics'
  | 'software'
  | 'aerospace'
  | 'ai'
  | 'electronics'
  | 'computer';

export interface Reflection {
  missionId: string;
  /** Captain T asks; the authored sections carry the conclusions. */
  mentorPrompt: string;
  sections: { heading: string; body: string }[];
  /** One "in your field" line per role (GAME_CONCEPT §5.4). */
  inYourField: Record<RoleId, string>;
  gemName: string;
  gemColor: string;
}
