/**
 * Input engine — keyboard + virtual joystick, framework-agnostic.
 * Movement is polled each frame by the player; discrete actions are
 * broadcast to subscribers.
 */

export type InputAction =
  | 'interact'
  | 'jump'
  | 'use'
  | 'help'
  | 'escape'
  | 'build'
  | 'rotate'
  | 'erase'
  | 'undo'
  | 'bag'
  | 'chat'
  | 'coop'
  | 'slot';

/** `n` is the hotbar slot (0-based) for 'slot'. */
type Listener = (action: InputAction, n?: number) => void;

const keys = new Set<string>();
const listeners = new Set<Listener>();
const joystick = { x: 0, y: 0 };
let runToggle = false;
let jumpQueued = false;

const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function emit(action: InputAction, n?: number) {
  if (action === 'jump') jumpQueued = true;
  listeners.forEach((l) => l(action, n));
}

function onKeyDown(e: KeyboardEvent) {
  if (isTyping(e.target)) {
    if (e.code === 'Escape') emit('escape');
    return;
  }
  keys.add(e.code);
  if (e.repeat) return;
  if (/^Digit[1-9]$/.test(e.code)) return emit('slot', Number(e.code.slice(5)) - 1);
  if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    return emit('undo');
  }
  switch (e.code) {
    case 'KeyE':
      emit('interact');
      break;
    case 'KeyF':
      emit('use');
      break;
    case 'Space':
      e.preventDefault();
      emit('jump');
      break;
    case 'KeyB':
      emit('build');
      break;
    case 'KeyR':
      emit('rotate');
      break;
    case 'KeyX':
      emit('erase');
      break;
    case 'KeyI':
    case 'Tab':
      e.preventDefault();
      emit('bag');
      break;
    case 'KeyT':
    case 'Enter':
      e.preventDefault();
      emit('chat');
      break;
    case 'KeyC':
      emit('coop');
      break;
    case 'KeyH':
      emit('help');
      break;
    case 'Escape':
      emit('escape');
      break;
  }
}

function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.code);
}

function onBlur() {
  keys.clear();
}

let attached = 0;

/** Attach global listeners. Returns a detach function (ref-counted). */
export function attachInput(): () => void {
  if (attached++ === 0) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
  }
  return () => {
    if (--attached === 0) {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.clear();
    }
  };
}

export function onInputAction(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fire an action from on-screen controls. */
export function triggerAction(action: InputAction, n?: number) {
  emit(action, n);
}

const pressed = (codes: string[]) => codes.some((c) => keys.has(c));

/** Movement intent in screen space: x = right, y = forward. Magnitude ≤ 1. */
export function getMoveIntent(): { x: number; y: number; run: boolean } {
  let x = joystick.x;
  let y = joystick.y;
  if (pressed(MOVE_KEYS.right)) x += 1;
  if (pressed(MOVE_KEYS.left)) x -= 1;
  if (pressed(MOVE_KEYS.up)) y += 1;
  if (pressed(MOVE_KEYS.down)) y -= 1;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || runToggle;
  return { x, y, run };
}

export function setJoystick(x: number, y: number) {
  joystick.x = x;
  joystick.y = y;
}

export function setRunToggle(on: boolean) {
  runToggle = on;
}

export function consumeJump(): boolean {
  const j = jumpQueued;
  jumpQueued = false;
  return j;
}

export function clearMovement() {
  keys.clear();
  joystick.x = 0;
  joystick.y = 0;
  jumpQueued = false;
}
