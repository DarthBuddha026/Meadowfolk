'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { setJoystick, setRunToggle, triggerAction } from '@/game/engine/input';
import { getInteractLabel, interact } from '@/game/state/mission-director';
import { useSession } from '@/game/state/session-store';

export function useIsTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const update = () => setTouch(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return touch;
}

/** "[E] Talk to Sarah" — shown when standing near something useful. */
export function InteractPrompt() {
  const nearby = useSession((s) => s.nearbyId);
  const blocked = useSession((s) => !!s.dialogue || !!s.panel || !!s.shot || !!s.transition);
  const touch = useIsTouch();
  const show = nearby && !blocked;

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          key={nearby}
          className="paper fixed bottom-6 left-1/2 z-30 flex items-center gap-2 px-4 py-2 font-display text-lg font-semibold"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2 }}
          onClick={() => interact(nearby)}
          style={{ x: '-50%' }}
        >
          {!touch && <span className="key">E</span>}
          {getInteractLabel(nearby)}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

const RADIUS = 46;

function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef<number | null>(null);

  const update = (clientX: number, clientY: number) => {
    const rect = base.current?.getBoundingClientRect();
    if (!rect) return;
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    setJoystick(dx / RADIUS, -dy / RADIUS);
  };

  const release = () => {
    active.current = null;
    setKnob({ x: 0, y: 0 });
    setJoystick(0, 0);
  };

  return (
    <div
      ref={base}
      className="fixed bottom-6 left-6 z-30 h-32 w-32 touch-none rounded-full border-3 border-ink bg-paper/70"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => active.current === e.pointerId && update(e.clientX, e.clientY)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <div
        className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-3 border-ink bg-sun shadow-[0_3px_0_#2b2340]"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}

/** On-screen joystick and buttons for touch devices. */
export function MobileControls() {
  const touch = useIsTouch();
  const [run, setRun] = useState(false);
  const locked = useSession((s) => !!s.panel || !!s.shot);
  const inDialogue = useSession((s) => !!s.dialogue);

  useEffect(() => () => setRunToggle(false), []);

  if (!touch || locked) return null;
  if (inDialogue) return null;

  return (
    <>
      <Joystick />
      <div className="fixed bottom-6 right-6 z-30 flex items-end gap-3">
        <button
          className={`btn btn--icon h-14 w-14 text-xs ${run ? '' : 'btn--ghost'}`}
          onClick={() => {
            setRun(!run);
            setRunToggle(!run);
          }}
        >
          RUN
        </button>
        <button className="btn btn--icon btn--teal h-16 w-16 text-sm" onClick={() => triggerAction('jump')}>
          JUMP
        </button>
      </div>
    </>
  );
}
