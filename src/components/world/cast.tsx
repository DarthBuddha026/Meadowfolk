'use client';

import { useGLTF } from '@react-three/drei';
import { getDialogueTree, getScript, GARDEN, MISSION_SCRIPTS, STAGES, WORKSHOP, type Vec3 } from '@/game/data';
import { getCurrentNode } from '@/game/state/mission-director';
import { useSession } from '@/game/state/session-store';
import { useMissionContext, useMissionPhase } from '@/game/state/use-mission';
import type { CharacterLook } from './character-model';
import { Npc } from './npc';

/** Every help seeker: where they stand between conversations, and their build. */
const HELP_SEEKERS: Record<string, { name: string; home: Vec3; look: CharacterLook }> = {
  // Their own models (scripts/build-pack-villager.py): `height` is to the top of the hair.
  sarah: { name: 'Sarah', home: WORKSHOP.sarahHome, look: { height: 1.32, model: '/models/sarah.glb' } },
  mika: { name: 'Mika', home: GARDEN.mikaHome, look: { height: 1.42, model: '/models/mika.glb' } },
};
for (const { look } of Object.values(HELP_SEEKERS)) if (look.model) useGLTF.preload(look.model);

// A superhero in the townsfolk's style (scripts/build-pack-villager.py captain-t); `height` is to the top of his hair.
const CAPTAIN_T: CharacterLook = { height: 1.5, model: '/models/captain-t.glb' };
useGLTF.preload(CAPTAIN_T.model!);

function midpoint(a: Vec3, b: Vec3, t = 0.5): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t];
}

/** Help seekers + mentor. Positions follow the active conversation stage. */
export function Cast() {
  const phase = useMissionPhase();
  const missionId = useMissionContext((c) => c.missionId);
  const screen = useSession((s) => s.screen);
  const dialogue = useSession((s) => s.dialogue);
  // Re-render on node change so the speaker highlight follows the line.
  useSession((s) => s.dialogue?.nodeId);
  const map = useSession((s) => s.map);
  const script = getScript(missionId);
  const stage = dialogue ? STAGES[getDialogueTree(dialogue.treeId)?.stageId ?? ''] : undefined;
  const speaker = dialogue ? getCurrentNode()?.speaker : undefined;

  // Name tags stay out of close-ups and result shots.
  const closeUp = useSession((s) => !!s.shot || !!s.panel);
  const showTags = screen === 'play' && !closeUp;
  const mentor = script.mentorPoint(phase);
  // Stage blocking: actors "cheat out" — face between their partner and the camera.
  const cheatOut = stage ? midpoint(stage.hero, stage.camera) : null;

  return (
    <>
      {MISSION_SCRIPTS.map(({ helpSeeker: { id }, map: seekerMap }) => {
        const seeker = HELP_SEEKERS[id];
        const onStage = id === script.helpSeeker.id && !!stage?.npc;
        return (
          <Npc
            key={id}
            name={seeker.name}
            look={seeker.look}
            target={onStage ? stage!.npc! : seeker.home}
            faceTarget={onStage ? cheatOut : null}
            speaking={onStage && speaker === 'npc'}
            inConversation={onStage}
            showTag={showTags && map === seekerMap}
          />
        );
      })}
      <Npc
        name="Captain T"
        look={CAPTAIN_T}
        target={stage?.mrT ?? mentor.position}
        faceTarget={stage ? midpoint(stage.hero, stage.camera, 0.7) : null}
        speaking={speaker === 'mr-t'}
        inConversation={!!stage}
        showTag={showTags && map === mentor.map}
      />
    </>
  );
}
