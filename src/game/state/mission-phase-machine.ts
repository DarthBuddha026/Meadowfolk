import { assign, createActor, setup } from 'xstate';
import { getInvestigation, isInvestigationComplete } from '@/game/data';
import type { MissionPhase } from '@/game/data';

/**
 * Mission Phase Machine
 *
 * Enforces the mandatory phase order — no skipping:
 * ENTRY → CALL_FOR_HELP → INVESTIGATION → HYPOTHESIS → CHALLENGE → RESULT → REFLECTION → REWARD
 *
 * A failed challenge goes to RESULT and then back to CHALLENGE — wrong
 * attempts never fail the mission.
 */

export interface MissionPhaseContext {
  missionId: string;
  discoveredClues: string[];
  selectedHypothesis: string | null;
  hypothesisRedirects: number;
  challengeAttempts: number;
  challengeResult: 'success' | 'failure' | null;
}

export type MissionPhaseEvent =
  | { type: 'ENTRY_COMPLETE' }
  | { type: 'DIALOGUE_COMPLETE' }
  | { type: 'CLUE_DISCOVERED'; clueId: string }
  | { type: 'INVESTIGATION_COMPLETE' }
  | { type: 'HYPOTHESIS_REDIRECT' }
  | { type: 'HYPOTHESIS_SELECTED'; hypothesisId: string }
  | { type: 'CHALLENGE_SUCCESS' }
  | { type: 'CHALLENGE_FAILURE' }
  | { type: 'RESULT_COMPLETE' }
  | { type: 'REFLECTION_COMPLETE' }
  /** Start a mission from ENTRY (replay, or the next signal). */
  | { type: 'RESET'; missionId?: string };

const initialContext = (missionId = 'mission-1'): MissionPhaseContext => ({
  missionId,
  discoveredClues: [],
  selectedHypothesis: null,
  hypothesisRedirects: 0,
  challengeAttempts: 0,
  challengeResult: null,
});

export const missionPhaseMachine = setup({
  types: {
    context: {} as MissionPhaseContext,
    events: {} as MissionPhaseEvent,
  },
  actions: {
    recordClue: assign({
      discoveredClues: ({ context, event }) =>
        event.type === 'CLUE_DISCOVERED' && !context.discoveredClues.includes(event.clueId)
          ? [...context.discoveredClues, event.clueId]
          : context.discoveredClues,
    }),
  },
  guards: {
    hasEnoughEvidence: ({ context }) => {
      const data = getInvestigation(context.missionId);
      return !!data && isInvestigationComplete(data, context.discoveredClues);
    },
    isSuccess: ({ context }) => context.challengeResult === 'success',
  },
}).createMachine({
  id: 'missionPhase',
  initial: 'entry',
  context: () => initialContext(),
  states: {
    entry: {
      on: { ENTRY_COMPLETE: 'callForHelp' },
    },
    callForHelp: {
      on: {
        // Dialogue can surface evidence early (e.g. Mika says when the pump starts).
        CLUE_DISCOVERED: { actions: 'recordClue' },
        DIALOGUE_COMPLETE: 'investigation',
      },
    },
    investigation: {
      on: {
        CLUE_DISCOVERED: { actions: 'recordClue' },
        INVESTIGATION_COMPLETE: { target: 'hypothesis', guard: 'hasEnoughEvidence' },
      },
    },
    hypothesis: {
      on: {
        HYPOTHESIS_REDIRECT: {
          actions: assign({ hypothesisRedirects: ({ context }) => context.hypothesisRedirects + 1 }),
        },
        HYPOTHESIS_SELECTED: {
          target: 'challenge',
          actions: assign({ selectedHypothesis: ({ event }) => event.hypothesisId }),
        },
      },
    },
    challenge: {
      on: {
        CHALLENGE_SUCCESS: {
          target: 'result',
          actions: assign({
            challengeResult: 'success',
            challengeAttempts: ({ context }) => context.challengeAttempts + 1,
          }),
        },
        CHALLENGE_FAILURE: {
          target: 'result',
          actions: assign({
            challengeResult: 'failure',
            challengeAttempts: ({ context }) => context.challengeAttempts + 1,
          }),
        },
      },
    },
    result: {
      on: {
        RESULT_COMPLETE: [
          { target: 'reflection', guard: 'isSuccess' },
          { target: 'challenge', actions: assign({ challengeResult: null }) },
        ],
      },
    },
    reflection: {
      on: { REFLECTION_COMPLETE: 'reward' },
    },
    // Not a final state, so RESET (replay) still works afterwards.
    reward: {},
  },
  on: {
    RESET: {
      target: '.entry',
      actions: assign(({ context, event }) => initialContext(event.missionId ?? context.missionId)),
    },
  },
});

/** The single running mission actor, shared by the 3D scene and the HUD. */
export const missionActor = createActor(missionPhaseMachine);
missionActor.start();

export function getPhase(): MissionPhase {
  return missionActor.getSnapshot().value as MissionPhase;
}

export function getMissionContext(): MissionPhaseContext {
  return missionActor.getSnapshot().context;
}
