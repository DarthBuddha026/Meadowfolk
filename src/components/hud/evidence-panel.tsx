'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { getChallenge, getSurface, type EvidenceItem, type EvidenceTab, type FieldEditor } from '@/game/data';
import { playSound } from '@/game/engine/sound';
import { canEditSketch, examineEvidence, uploadSketch } from '@/game/state/mission-director';
import { useSession } from '@/game/state/session-store';
import { useMissionContext, useMissionPhase, useMissionScript } from '@/game/state/use-mission';
import { WiringBoard } from './wiring-board';

function PanelShell({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  const closePanel = useSession((s) => s.closePanel);
  return (
    <motion.div
      className="fixed inset-x-2 bottom-2 z-30 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-24 sm:w-[530px]"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.3 }}
    >
      <div className="paper flex max-h-[62vh] flex-col overflow-hidden sm:max-h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between border-b-3 border-ink bg-mint px-4 py-2">
          <div>
            <p className="font-display text-[10px] font-semibold tracking-[0.2em] text-ink-soft">{kicker}</p>
            <h3 className="font-display text-lg font-semibold">{title}</h3>
          </div>
          <button
            className="btn btn--ghost btn--icon h-9 w-9 text-sm"
            onClick={() => {
              playSound('close');
              closePanel();
            }}
            title="Step back (Esc)"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-3">{children}</div>
        <p className="border-t-2 border-ink/20 px-4 py-2 text-xs font-bold text-ink-soft">
          Click anything to examine it. <span className="key">Esc</span> to step back.
        </p>
      </div>
    </motion.div>
  );
}

function EvidenceRow({ item, mono, children }: { item: EvidenceItem; mono?: boolean; children?: ReactNode }) {
  const examined = useSession((s) => s.examined.includes(item.id));
  const found = useMissionContext((c) => (item.clueId ? c.discoveredClues.includes(item.clueId) : false));
  return (
    <button className={`evidence-row ${mono ? 'py-0.5' : ''}`} onClick={() => examineEvidence(item)}>
      <span className={`flex items-start gap-2 ${mono ? 'font-mono text-[13px]' : 'text-sm font-semibold'}`}>
        <span className="mt-0.5 w-4 shrink-0 text-center text-teal">{found ? '✓' : examined ? '·' : ''}</span>
        <span className="whitespace-pre-wrap">{children ?? item.text}</span>
      </span>
      {examined && item.note && <span className="mt-1 block pl-6 text-xs font-bold italic text-ink-soft">{item.note}</span>}
    </button>
  );
}

/** A `{FIELD}` token in a sketch line (split keeps the field name). */
const FIELD = /\{([A-Z_]+)\}/;

/** Replace `{FIELD}` tokens with the sketch's current values. */
function fill(text: string, fields: Record<string, string>) {
  return text.replace(/\{([A-Z_]+)\}/g, (_, name: string) => fields[name] ?? name);
}

/**
 * One editable sketch field: a text box or a HIGH/LOW toggle. Never auto-focused:
 * the E press that opens the panel would type into it.
 */
function FieldInput({ name, editor, busy }: { name: string; editor: FieldEditor; busy: boolean }) {
  const value = useSession((s) => s.sketch[name] ?? '');
  const setField = useSession((s) => s.setSketchField);
  if (editor.kind === 'toggle') {
    return (
      <button
        disabled={busy}
        onClick={() => {
          playSound('blip');
          const i = editor.options.indexOf(value);
          setField(name, editor.options[(i + 1) % editor.options.length]);
        }}
        className="mx-0.5 rounded-md border-2 border-sun bg-[#2b2840] px-1.5 font-mono text-[#ffd166] hover:bg-[#3a3656]"
        aria-label={`${editor.label}: ${value} (click to change)`}
        title={`${editor.label} — click to change`}
      >
        {value} ⇅
      </button>
    );
  }
  return (
    <input
      value={value}
      disabled={busy}
      onChange={(e) => setField(name, e.target.value.slice(0, editor.maxLength))}
      onKeyDown={(e) => e.key === 'Enter' && uploadSketch()}
      className="mx-0.5 rounded-md border-2 border-sun bg-[#2b2840] px-1.5 font-mono text-[#ffd166] outline-none focus:bg-[#3a3656]"
      style={{ width: `${Math.max(6, value.length + 2)}ch` }}
      aria-label={editor.label}
      spellCheck={false}
    />
  );
}

function CodeTab({ tab, editable, busy }: { tab: EvidenceTab; editable: boolean; busy: boolean }) {
  const missionId = useMissionContext((c) => c.missionId);
  const sketch = useSession((s) => s.sketch);
  const { editors } = getChallenge(missionId);
  return (
    // Ligatures off: code must read exactly as typed (`!=`, not ≠).
    <div className="rounded-xl bg-[#1d1b2c] p-2 text-[#f2efe6] [font-variant-ligatures:none] overflow-x-auto">
      {tab.items.map((line, i) => {
        const number = <span className="mr-2 text-[#5c5878]">{String(i + 1).padStart(2, ' ')}</span>;
        if (line.text === '') return <div key={line.id} className="h-4" />;
        if (editable && FIELD.test(line.text)) {
          const parts = line.text.split(FIELD);
          return (
            <div key={line.id} className="flex items-center whitespace-pre py-1 pl-[34px] pr-2 font-mono text-[13px]">
              {number}
              {parts.map((part, k) => {
                if (k % 2 === 0) return <Fragment key={k}>{part}</Fragment>;
                return <FieldInput key={k} name={part} editor={editors[part]} busy={busy} />;
              })}
            </div>
          );
        }
        return (
          <div key={line.id} className="[&_.evidence-row:hover]:bg-[#2b2840] [&_.evidence-row]:text-[#f2efe6]">
            <EvidenceRow item={line} mono>
              {number}
              {fill(line.text, sketch)}
            </EvidenceRow>
          </div>
        );
      })}
    </div>
  );
}

function LogTab({ tab }: { tab: EvidenceTab }) {
  const upload = useSession((s) => s.upload);
  const lines = tab.output && upload.lines.length > 0 ? upload.lines.map((text, i) => ({ id: `u${i}`, text })) : tab.items;
  return (
    <div className="rounded-xl bg-[#11101b] p-2 text-[#cfe9d9] [font-variant-ligatures:none]">
      {lines.map((line) =>
        line.text === '' ? (
          <div key={line.id} className="h-3" />
        ) : (
          <div key={line.id} className="[&_.evidence-row:hover]:bg-[#22203a] [&_.evidence-row]:text-[#cfe9d9]">
            <EvidenceRow item={line} mono />
          </div>
        )
      )}
    </div>
  );
}

/** Any inspectable object of the current mission; the challenge target also edits and uploads the sketch. */
export function EvidencePanel({ id }: { id: string }) {
  const phase = useMissionPhase();
  const script = useMissionScript();
  const surface = getSurface(script.missionId, id);
  const upload = useSession((s) => s.upload);
  const [tabId, setTabId] = useState(surface?.tabs[0]?.id);
  if (!surface) return null;
  const tab = surface.tabs.find((t) => t.id === tabId) ?? surface.tabs[0];
  const editable = id === script.challengeTarget && canEditSketch(phase);
  const busy = upload.status === 'uploading';

  return (
    <PanelShell title={surface.title} kicker={editable ? 'TEST YOUR CLAIM' : surface.kicker}>
      {surface.tabs.length > 1 && (
        <div className="mb-2 flex gap-2">
          {surface.tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTabId(t.id)}
              className={`rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${t.id === tab.id ? 'bg-sun' : 'bg-white'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab.kind === 'code' ? (
        <CodeTab tab={tab} editable={editable} busy={busy} />
      ) : tab.kind === 'log' ? (
        <LogTab tab={tab} />
      ) : tab.board ? (
        <WiringBoard key={tab.id} board={tab.board} />
      ) : (
        <div className="space-y-1">
          {tab.items.map((item) => (
            <EvidenceRow key={item.id} item={item} />
          ))}
        </div>
      )}

      {editable && (
        <div className="mt-3 space-y-2">
          <button className="btn w-full" disabled={busy} onClick={uploadSketch}>
            {busy ? 'Uploading…' : '⬆ Upload to board'}
          </button>
          {tab.kind === 'code' && upload.lines.length > 0 && (
            <div
              className={`rounded-lg px-3 py-2 font-mono text-xs font-bold ${
                upload.status === 'error' ? 'bg-[#ffe1dc] text-coral' : 'bg-[#11101b] text-[#cfe9d9]'
              }`}
            >
              {upload.lines.slice(-2).map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </PanelShell>
  );
}
