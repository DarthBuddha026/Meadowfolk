import {
  DOORS,
  canDiscoverClue,
  exitDoorOf,
  followingMission,
  getChallenge,
  getClue,
  getDialogueTree,
  getInvestigation,
  getRoleLabel,
  getScript,
  isInvestigationComplete,
  isMissionOpen,
  isNorthBankOpen,
  nextMissionId,
  type DialogueEffect,
  type DialogueNode,
  type EvidenceItem,
  type MissionPhase,
} from '@/game/data';
import { clearMovement } from '@/game/engine/input';
import { requestTeleport } from '@/game/engine/world-state';
import { playSound } from '@/game/engine/sound';
import { getMissionContext, getPhase, missionActor } from './mission-phase-machine';
import { isDevHero, useProfile } from './profile-store';
import { useSession } from './session-store';

/**
 * Mission Director — all gameplay rules for interactions, dialogue flow,
 * evidence, the challenge upload, reflection, and reward live here. Every mission
 * runs from its data (`src/game/data/mission-N/`); components only call these
 * functions and never decide outcomes.
 */

const session = () => useSession.getState();
const missionId = () => getMissionContext().missionId;
const script = () => getScript(missionId());

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

export function formatLine(text: string): string {
  const { heroName, role } = useProfile.getState();
  return text.replaceAll('{heroName}', heroName || 'Hero').replaceAll('{role}', getRoleLabel(role));
}

/* ------------------------------------------------------------------ */
/* Mission lifecycle                                                   */
/* ------------------------------------------------------------------ */

/** Point the mission machine at a mission, from ENTRY, with fresh session state. */
function selectMission(id: string) {
  missionActor.send({ type: 'RESET', missionId: id });
  session().resetMissionSession(id);
}

/** Before entering the System from the title: pick up where the profile left off. */
export function prepareMission() {
  selectMission(nextMissionId(useProfile.getState().gems, isDevHero()));
}

/** Called when the hero lands in Junction (after the arrival cinematic). */
export function beginMission() {
  // A north bank that opened since the last visit is shown first; the mission's call waits for it.
  const wait = maybeRevealNorthBank() ? REVEAL_MS : 0;
  if (getPhase() !== 'entry') return;
  const s = script();
  if (s.entryAt === 'arrival') window.setTimeout(() => startDialogue(s.trees.entry), wait + 700);
  else if (s.lines.onArrive) window.setTimeout(() => session().say(s.lines.onArrive!), wait + 900);
}

/** Replay the current mission from the top. The gem is never awarded twice (profile guards it). */
export function replayMission() {
  selectMission(missionId());
  session().setMap('junction');
  session().setScreen('entering');
}

/**
 * Leave play for the title screen (pause menu). The profile keeps the hero and gems; Continue
 * picks the open signal up again from its call, back at the plaza.
 */
export function leaveToTitle() {
  session().closePanel();
  session().clearMentorLine();
  session().setMap('junction');
  session().setScreen('title');
}

/** Walk up to an open signal while the current mission is finished: start that mission. */
function answerSignal(id: string) {
  selectMission(id);
  startDialogue(getScript(id).trees.entry);
}

/* ------------------------------------------------------------------ */
/* Dialogue                                                            */
/* ------------------------------------------------------------------ */

export function getCurrentNode(): DialogueNode | undefined {
  const d = session().dialogue;
  if (!d) return undefined;
  return getDialogueTree(d.treeId)?.nodes.find((n) => n.id === d.nodeId);
}

export function startDialogue(treeId: string) {
  const tree = getDialogueTree(treeId);
  if (!tree) return;
  clearMovement();
  useSession.setState({ dialogue: { treeId, nodeId: tree.startNodeId }, panel: null, mentorLine: null });
  playSound('open');
  enterNode(treeId, tree.startNodeId);
}

function enterNode(treeId: string, nodeId: string) {
  const node = getDialogueTree(treeId)?.nodes.find((n) => n.id === nodeId);
  if (!node) return endDialogue(treeId);
  useSession.setState({ dialogue: { treeId, nodeId } });
  node.setsFlags?.forEach(setFlag);
  node.effects?.forEach(applyEffect);
}

/** Space / E / click on the dialogue cloud: finish typing first, then advance. */
export function requestAdvance() {
  const s = session();
  if (!s.dialogue) return;
  if (s.typing) useSession.setState({ skipTypingKey: s.skipTypingKey + 1 });
  else advanceDialogue();
}

/** Advance a node without choices. */
export function advanceDialogue() {
  const d = session().dialogue;
  const node = getCurrentNode();
  if (!d || !node || getVisibleChoices(node).length > 0) return;
  playSound('blip');
  if (node.nextNodeId) enterNode(d.treeId, node.nextNodeId);
  else endDialogue(d.treeId);
}

export function getVisibleChoices(node: DialogueNode) {
  const flags = session().dialogueFlags;
  return (node.choices ?? []).filter(
    (c) =>
      (c.requiresFlags ?? []).every((f) => flags.includes(f)) &&
      !(c.hideIfFlags ?? []).some((f) => flags.includes(f))
  );
}

export function chooseOption(choiceId: string) {
  const d = session().dialogue;
  const node = getCurrentNode();
  const choice = node?.choices?.find((c) => c.id === choiceId);
  if (!d || !choice) return;
  playSound('select');
  choice.effects?.forEach(applyEffect);
  enterNode(d.treeId, choice.nextNodeId);
}

function setFlag(flag: string) {
  const flags = session().dialogueFlags;
  if (!flags.includes(flag)) useSession.setState({ dialogueFlags: [...flags, flag] });
}

function applyEffect(effect: DialogueEffect) {
  switch (effect.type) {
    case 'SET_FLAG':
      setFlag(effect.flagId);
      break;
    case 'UNLOCK_CLUE':
      discoverClue(effect.clueId);
      break;
    case 'TRIGGER_EVENT':
      if (effect.eventId === 'HYPOTHESIS_REDIRECT') {
        missionActor.send({ type: 'HYPOTHESIS_REDIRECT' });
        playSound('nudge');
      } else if (effect.eventId.startsWith('HYPOTHESIS:')) {
        missionActor.send({ type: 'HYPOTHESIS_SELECTED', hypothesisId: effect.eventId.slice('HYPOTHESIS:'.length) });
      }
      break;
  }
}

function endDialogue(treeId: string) {
  useSession.setState({ dialogue: null });
  playSound('close');
  const s = script();
  const phase = getPhase();
  if (treeId === s.trees.entry) {
    missionActor.send({ type: 'ENTRY_COMPLETE' });
    if (s.lines.afterEntry) session().say(s.lines.afterEntry);
  } else if (treeId === s.trees.callForHelp) {
    missionActor.send({ type: 'DIALOGUE_COMPLETE' });
  } else if (phase === 'result') {
    // Every RESULT tree ends here: success opens the reflection, anything else returns to the test.
    missionActor.send({ type: 'RESULT_COMPLETE' });
    session().setShot(null);
    if (treeId === s.trees.success) session().openPanel('reflection');
  }
}

/* ------------------------------------------------------------------ */
/* World interactions                                                  */
/* ------------------------------------------------------------------ */

export function interact(id: string) {
  const s = session();
  if (s.dialogue || s.panel || s.shot || s.transition || s.screen !== 'play') return;
  const phase = getPhase();
  const sc = script();

  if (DOORS[id]) {
    travelThrough(id);
    return;
  }

  if (id.startsWith('signal-')) {
    const signal = id.slice('signal-'.length);
    if (signal === missionId()) {
      if (phase === 'entry') startDialogue(sc.trees.entry);
    } else if (isMissionOpen(signal, useProfile.getState().gems, isDevHero())) {
      // The DEV hero may jump to any open signal, leaving the current mission where it is.
      if ((phase === 'reward' && s.gemCollected) || isDevHero()) answerSignal(signal);
      else {
        playSound('nudge');
        s.say(`One signal at a time. ${sc.helpSeeker.name} is still waiting on you.`);
      }
    } else {
      playSound('open');
      s.openPanel('locked-signal', signal);
    }
    return;
  }

  if (id === sc.helpSeeker.id) {
    if (phase === 'callForHelp') startDialogue(sc.trees.callForHelp);
    else if (phase === 'investigation') startDialogue(sc.trees.chat);
    else if (sc.lines.seeker[phase]) s.say(sc.lines.seeker[phase]!, sc.helpSeeker.name);
    return;
  }

  if (id === 'mr-t') {
    if (phase === 'entry') startDialogue(sc.trees.entry);
    else if (phase === 'callForHelp') s.say('Problems start with people. Talk to the one who called.');
    else if (phase === 'investigation') tryStateHypothesis();
    else if (phase === 'hypothesis') startDialogue(sc.trees.hypothesis);
    else if (phase === 'challenge') s.say('You made a claim. Now test it.');
    else if (phase === 'reflection') s.openPanel('reflection');
    else if (phase === 'reward')
      s.say(s.gemCollected ? "Hear that? Junction's a little quieter. One less person stuck." : "Go on. It's yours.");
    return;
  }

  if (sc.evidence.includes(id)) {
    if (phase === 'callForHelp') {
      s.say(sc.lines.askFirst);
      playSound('nudge');
    } else {
      playSound('open');
      s.openPanel(id);
    }
    return;
  }

  if (id === 'gem' && phase === 'reward' && !s.gemCollected) collectGem();
}

/* ------------------------------------------------------------------ */
/* Doors — each side of a door is a different map                      */
/* ------------------------------------------------------------------ */

const FADE_MS = 380;

function travelThrough(doorId: string) {
  const door = DOORS[doorId];
  const s = session();
  clearMovement();
  playSound('door');
  s.setTransition({ destination: door.destination });
  window.setTimeout(() => {
    session().setMap(door.to);
    requestTeleport(door.spawn[0], door.spawn[2], door.face);
  }, FADE_MS);
  window.setTimeout(() => {
    session().setTransition(null);
    const sc = script();
    if (door.to === sc.map && getPhase() === 'callForHelp' && sc.lines.greet) session().say(sc.lines.greet, sc.helpSeeker.name);
    if (door.to === 'junction') maybeRevealNorthBank();
  }, FADE_MS + 520);
}

/* ------------------------------------------------------------------ */
/* The north bank — opens once Missions 1 and 2 are done               */
/* ------------------------------------------------------------------ */

/** How long the north gate's reveal shot holds (the barrier lifts while it does). */
const REVEAL_MS = 3800;

/**
 * Show the north bank opening, once: the camera looks up the north road while the gate's barrier
 * lifts. Runs when the hero is in Junction with nothing else on screen. The DEV hero has it open
 * from the start, without the show. Returns whether the reveal is playing.
 */
function maybeRevealNorthBank(): boolean {
  const profile = useProfile.getState();
  if (!isNorthBankOpen(profile.gems, isDevHero()) || profile.revealed.includes('north-bank')) return false;
  if (isDevHero()) {
    profile.markRevealed('north-bank');
    return false;
  }
  const s = session();
  if (s.screen !== 'play' || s.map !== 'junction' || s.dialogue || s.panel || s.shot || s.transition) return false;
  clearMovement();
  s.setShot('north-gate');
  playSound('unlock');
  window.setTimeout(() => session().say("The north road's open. Who do you suppose lives past that ridge?"), 1100);
  window.setTimeout(() => {
    if (session().shot === 'north-gate') session().setShot(null);
    useProfile.getState().markRevealed('north-bank');
  }, REVEAL_MS);
  return true;
}

let closedRoadAt = -Infinity;

/** The hero walked up to the north gate while it is closed. */
export function nearClosedRoad() {
  const s = session();
  if (s.screen !== 'play' || s.dialogue || s.panel || s.shot || performance.now() - closedRoadAt < 8000) return;
  closedRoadAt = performance.now();
  playSound('nudge');
  s.say('The north road is closed for now. Who in Junction still needs you first?');
}

/** Is an interactable meaningful right now? Drives markers and prompts. */
export function isInteractable(id: string, phase = getPhase()): boolean {
  if (DOORS[id]) return true;
  const s = session();
  const sc = script();
  if (id.startsWith('signal-')) {
    const signal = id.slice('signal-'.length);
    if (signal === missionId()) return phase === 'entry';
    const gems = useProfile.getState().gems;
    // Finished signals go quiet; open ones wait for the current mission to finish.
    if (isMissionOpen(signal, gems, isDevHero())) return isDevHero() || !gems.includes(signal);
    return true;
  }
  if (id === sc.helpSeeker.id) return phase !== 'entry' && phase !== 'result' && phase !== 'reflection';
  if (id === 'mr-t') return phase !== 'result';
  if (sc.evidence.includes(id)) return phase !== 'entry' && phase !== 'result' && phase !== 'reflection';
  if (id === 'gem') return phase === 'reward' && !s.gemCollected;
  return false;
}

/** The mission after this one, if its signal is open and not yet answered. */
function pendingNext() {
  const gems = useProfile.getState().gems;
  const next = followingMission(missionId(), gems, isDevHero());
  return next && !gems.includes(next.id) ? next : undefined;
}

function readyToClaim(): boolean {
  const data = getInvestigation(missionId());
  return !!data && isInvestigationComplete(data, getMissionContext().discoveredClues);
}

/** Which interactable currently deserves the attention marker. */
export function getFocusTarget(phase = getPhase()): string | null {
  const s = session();
  const sc = script();
  const finished = phase === 'reward' && s.gemCollected;
  if (finished) {
    const next = pendingNext();
    if (!next) return null;
    return s.map === 'junction' ? 'signal-' + next.id : (exitDoorOf(s.map) ?? null);
  }
  if (phase === 'entry') {
    // A mission that starts at its signal: head outside to it first.
    if (sc.entryAt === 'arrival') return null;
    return s.map === 'junction' ? 'signal-' + sc.missionId : (exitDoorOf(s.map) ?? null);
  }
  // On another map, every step points back to the way in.
  if (s.map !== sc.map) return sc.awayFocus[s.map] ?? exitDoorOf(s.map) ?? null;
  switch (phase) {
    case 'callForHelp':
      return sc.helpSeeker.id;
    case 'investigation':
      return readyToClaim() ? 'mr-t' : null;
    case 'hypothesis':
      return 'mr-t';
    case 'challenge':
      return sc.challengeTarget;
    case 'reward':
      return 'gem';
    default:
      return null;
  }
}

/** HUD objective line for the current phase. */
export function getObjective(phase: MissionPhase, cluesFound: number, gemCollected: boolean): string {
  const s = session();
  if (phase === 'reward' && gemCollected) {
    const next = pendingNext();
    if (next) return `A new signal is calling — ${next.whereabouts}`;
    return isNorthBankOpen(useProfile.getState().gems, isDevHero())
      ? 'The north road is open — explore the north bank'
      : 'Signal answered — explore Junction';
  }
  return script().objective(phase, {
    map: s.map,
    cluesFound,
    totalClues: getInvestigation(missionId())?.clues.length ?? cluesFound,
    readyToClaim: readyToClaim(),
    gemCollected,
  });
}

/** "[E] Talk to Sarah" — the prompt for an interactable. */
export function getInteractLabel(id: string): string {
  if (DOORS[id]) return DOORS[id].label;
  if (id === 'mr-t') return 'Talk to Captain T';
  if (id === 'gem') return 'Collect the Insight Gem';
  if (id.startsWith('signal-')) {
    const signal = id.slice('signal-'.length);
    return isMissionOpen(signal, useProfile.getState().gems, isDevHero()) ? 'Answer the signal' : 'Check signal';
  }
  return script().labels[id] ?? 'Interact';
}

function tryStateHypothesis() {
  const data = getInvestigation(missionId());
  const found = getMissionContext().discoveredClues;
  if (readyToClaim()) {
    missionActor.send({ type: 'INVESTIGATION_COMPLETE' });
    startDialogue(script().trees.hypothesis);
    return;
  }
  playSound('nudge');
  if (found.length === 0) session().say("You haven't looked at anything yet. Engineers don't guess — what does the evidence say?");
  else if (found.length < (data?.minimumCluesRequired ?? 3))
    session().say(`${found.length} piece${found.length === 1 ? '' : 's'} of evidence. Enough to be sure? What haven't you looked at?`);
  else session().say(script().lines.stillGuessing);
}

/* ------------------------------------------------------------------ */
/* Evidence                                                            */
/* ------------------------------------------------------------------ */

export function examineEvidence(item: EvidenceItem) {
  const s = session();
  s.markExamined(item.id);
  if (!item.clueId) {
    playSound('blip');
    return;
  }
  const phase = getPhase();
  const found = getMissionContext().discoveredClues;
  const clue = getClue(missionId(), item.clueId);
  if (!clue || found.includes(clue.id) || phase !== 'investigation') {
    playSound('blip');
    return;
  }
  if (canDiscoverClue(clue, found)) {
    discoverClue(clue.id);
  } else {
    playSound('nudge');
    s.say(getInvestigation(missionId())?.missingDependencyLines?.[clue.id] ?? 'Not yet. What do you need to know first?');
  }
}

export function discoverClue(clueId: string) {
  const before = getMissionContext().discoveredClues;
  if (before.includes(clueId)) return;
  missionActor.send({ type: 'CLUE_DISCOVERED', clueId });
  const after = getMissionContext().discoveredClues;
  if (!after.includes(clueId)) return;
  playSound('clue');
  const clue = getClue(missionId(), clueId);
  // Found in conversation, the journal records it quietly; Captain T reacts to what you find yourself.
  if (getPhase() !== 'investigation' || session().dialogue) return;
  if (readyToClaim()) session().say("You've gathered real evidence. When you're ready to state a claim, come find me.");
  else if (clue?.mentorLine) session().say(clue.mentorLine);
}

/* ------------------------------------------------------------------ */
/* Challenge — edit & upload the sketch                                */
/* ------------------------------------------------------------------ */

export function canEditSketch(phase = getPhase()): boolean {
  return phase === 'challenge' || phase === 'reward';
}

let uploading = false;

export function uploadSketch() {
  if (uploading || !canEditSketch()) return;
  const s = session();
  const challenge = getChallenge(missionId());
  const fields = { ...s.sketch };
  const error = challenge.compile(fields);
  if (error) {
    playSound('nudge');
    s.setUpload({ status: 'error', lines: ['Compiling sketch...', error] });
    return;
  }

  uploading = true;
  const log = challenge.uploadLog;
  s.setUpload({ status: 'uploading', lines: [] });
  playSound('upload');
  log.forEach((line, i) => {
    window.setTimeout(() => {
      const done = i === log.length - 1;
      session().setUpload({ status: done ? 'done' : 'uploading', lines: log.slice(0, i + 1) });
      if (done) {
        uploading = false;
        onUploadFinished(fields);
      }
    }, 320 * (i + 1));
  });
}

function onUploadFinished(fields: Record<string, string>) {
  const s = session();
  const challenge = getChallenge(missionId());
  const run = challenge.run(fields);
  s.bootSketch(fields);
  // The device's own output follows the upload log, as in a real serial monitor.
  s.setUpload({ status: 'done', lines: [...challenge.uploadLog, '', ...run.serial] });
  if (getPhase() !== 'challenge') return;

  missionActor.send({ type: run.success ? 'CHALLENGE_SUCCESS' : 'CHALLENGE_FAILURE' });
  window.setTimeout(() => {
    s.closePanel();
    s.setShot(script().resultShot);
    if (run.success) playSound('success');
  }, 700);
  window.setTimeout(() => startDialogue(challenge.resultTree(run.outcome)), 3600);
}

/* ------------------------------------------------------------------ */
/* Reflection & reward                                                 */
/* ------------------------------------------------------------------ */

export function completeReflection() {
  if (getPhase() !== 'reflection') return;
  missionActor.send({ type: 'REFLECTION_COMPLETE' });
  session().closePanel();
  playSound('gem');
  session().say('Understanding has a shape. Go and see it.');
}

function collectGem() {
  useSession.setState({ gemCollected: true });
  useProfile.getState().awardGem(missionId());
  playSound('gem');
  session().openPanel('complete');
}

/** The next open signal after the current mission, for the completion card. */
export function getNextSignal() {
  return pendingNext();
}
