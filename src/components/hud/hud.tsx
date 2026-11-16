'use client';

import { AnimatePresence } from 'framer-motion';
import { useSession } from '@/game/state/session-store';
import { useMissionScript } from '@/game/state/use-mission';
import { InteractPrompt, MobileControls } from './controls';
import { DialogueCloud } from './dialogue-cloud';
import { EvidencePanel } from './evidence-panel';
import { MapTransition } from './map-transition';
import { MentorToast } from './mentor-toast';
import { CompletePanel, HelpPanel, JournalPanel, LockedSignalPanel, PausePanel, ReflectionPanel } from './panels';
import { TopBar } from './top-bar';

/** In-play HUD layered over the 3D world. */
export function Hud() {
  const panel = useSession((s) => s.panel);
  const dialogue = useSession((s) => s.dialogue);
  const script = useMissionScript();

  return (
    <>
      {!dialogue && <TopBar />}
      <DialogueCloud />
      <MentorToast />
      <InteractPrompt />
      <MobileControls />
      <MapTransition />
      <AnimatePresence>
        {panel && script.evidence.includes(panel) && <EvidencePanel key={panel} id={panel} />}
        {panel === 'journal' && <JournalPanel key="journal" />}
        {panel === 'reflection' && <ReflectionPanel key="reflection" />}
        {panel === 'complete' && <CompletePanel key="complete" />}
        {panel === 'locked-signal' && <LockedSignalPanel key="locked" />}
        {panel === 'help' && <HelpPanel key="help" />}
        {panel === 'pause' && <PausePanel key="pause" />}
      </AnimatePresence>
    </>
  );
}
