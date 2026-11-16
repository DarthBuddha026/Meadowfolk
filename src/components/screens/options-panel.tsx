'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { playSound } from '@/game/engine/sound';
import { DEFAULT_SETTINGS, useSettings, type GraphicsQuality, type GraphicsSettings } from '@/game/state/settings-store';

const QUALITIES: { id: GraphicsQuality; label: string; hint: string }[] = [
  { id: 'low', label: 'Low', hint: 'Fastest. Lower resolution, soft shadows, no ambient occlusion.' },
  { id: 'medium', label: 'Medium', hint: 'Balanced. Ambient occlusion on, standard shadows.' },
  { id: 'high', label: 'High', hint: 'Best look. Sharpest picture and crisp shadows.' },
];

function sameSettings(a: GraphicsSettings, b: GraphicsSettings) {
  return a.quality === b.quality && a.shadows === b.shadows && a.bloom === b.bloom;
}

function Segmented<T extends string | boolean>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl border-3 border-ink bg-white p-1">
      {options.map((o) => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          aria-pressed={o.id === value}
          className={`flex-1 rounded-lg px-3 py-1.5 font-display text-base font-semibold transition ${
            o.id === value ? 'bg-sun shadow-[0_2px_0_#2b2340]' : 'hover:bg-paper-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const ON_OFF: { id: boolean; label: string }[] = [
  { id: true, label: 'On' },
  { id: false, label: 'Off' },
];

/**
 * Options menu: graphics quality, shadows, bloom. Edits a draft; nothing changes in
 * the world until Save Settings (each change can recompile shaders once).
 */
export function OptionsPanel({ onBack }: { onBack: () => void }) {
  const saved = useSettings();
  const [draft, setDraft] = useState<GraphicsSettings>({ quality: saved.quality, shadows: saved.shadows, bloom: saved.bloom });
  const [justSaved, setJustSaved] = useState(false);
  const dirty = !sameSettings(draft, saved);
  const isDefault = sameSettings(draft, DEFAULT_SETTINGS);

  const edit = (patch: Partial<GraphicsSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setJustSaved(false);
    playSound('blip');
  };

  const save = () => {
    saved.save(draft);
    setJustSaved(true);
    playSound('success');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onBack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <motion.div
      className="paper flex max-h-full w-full max-w-md flex-col overflow-hidden text-left"
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 24, opacity: 0, transition: { duration: 0.2 } }}
    >
      <div className="border-b-3 border-ink bg-sun px-5 py-3">
        <p className="font-display text-xs font-semibold tracking-[0.2em] text-ink-soft">OPTIONS</p>
        <h2 className="font-display text-2xl font-bold">Graphics</h2>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div>
          <p className="mb-1.5 font-display text-sm font-semibold">Graphics Quality</p>
          <Segmented options={QUALITIES} value={draft.quality} onChange={(quality) => edit({ quality })} />
          <p className="mt-1.5 text-sm text-ink-soft">{QUALITIES.find((q) => q.id === draft.quality)!.hint}</p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="font-display text-sm font-semibold">Shadows</p>
          <div className="w-40 shrink-0">
            <Segmented options={ON_OFF} value={draft.shadows} onChange={(shadows) => edit({ shadows })} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="font-display text-sm font-semibold">Bloom (glow on lights)</p>
          <div className="w-40 shrink-0">
            <Segmented options={ON_OFF} value={draft.bloom} onChange={(bloom) => edit({ bloom })} />
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t-3 border-ink px-5 py-4">
        <div className="flex gap-2">
          <button className="btn btn--ghost flex-1 text-base" disabled={isDefault} onClick={() => edit({ ...DEFAULT_SETTINGS })}>
            Restore Defaults
          </button>
          <button className="btn flex-1 text-base" disabled={!dirty} onClick={save}>
            Save Settings
          </button>
        </div>
        <button className="btn btn--ghost w-full text-base" onClick={onBack}>
          Back
        </button>
        <p className="h-4 text-center text-xs font-bold text-ink-soft" aria-live="polite">
          {dirty ? 'You have unsaved changes.' : justSaved ? 'Settings saved.' : ''}
        </p>
      </div>
    </motion.div>
  );
}
