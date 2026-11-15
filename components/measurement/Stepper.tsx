// components/measurement/Stepper.tsx — the SMM7 workflow: labelled steps, a one-line explanation per page, and Back / Next.
import React from 'react';
import { UI, btnGhost, btnPrimary, tint } from '../ui';

export type Step = 'project' | 'drawing' | 'quantities' | 'rates' | 'estimate';
export type Tone = 'done' | 'todo' | 'warn' | 'idle';
export interface StepInfo { id: Step; label: string; blurb: string; status: string; tone: Tone }

const toneColor = (t: Tone) => (t === 'done' ? UI.ok : t === 'warn' ? UI.warn : UI.dim);

export const Stepper: React.FC<{ steps: StepInfo[]; value: Step; onChange: (s: Step) => void }> = ({ steps, value, onChange }) => (
  <nav className="flex items-stretch gap-1 px-3 py-2 border-b overflow-x-auto shrink-0" style={{ background: UI.panel, borderColor: UI.rule }} aria-label="Estimate steps">
    {steps.map((st, i) => {
      const on = st.id === value;
      return (
        <button key={st.id} onClick={() => onChange(st.id)} aria-current={on ? 'step' : undefined}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-[var(--ui-r)] text-left min-w-[150px] transition-colors hover:bg-[var(--ui-hover)]"
          style={{ background: on ? tint(UI.accent, 12) : undefined }}>
          <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold shrink-0"
            style={st.tone === 'done' && !on ? { background: tint(UI.ok, 18), color: UI.ok } : on ? { background: UI.accent, color: UI.accentInk } : { background: UI.raised, color: UI.dim }}>
            {st.tone === 'done' ? '✓' : i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold leading-tight" style={{ color: on ? UI.accent : 'var(--ui-strong)' }}>{st.label}</span>
            <span className="block text-[11px] leading-tight truncate" style={{ color: toneColor(st.tone) }}>{st.status}</span>
          </span>
        </button>
      );
    })}
  </nav>
);

export const StepHeader: React.FC<{ n: number; total: number; title: string; blurb: string; children?: React.ReactNode }> = ({ n, total, title, blurb, children }) => (
  <div className="max-w-5xl mx-auto mb-4 flex items-end justify-between gap-4 flex-wrap">
    <div>
      <div className="text-[11px]" style={{ color: UI.dim }}>Step {n} of {total}</div>
      <h2 className="text-lg font-semibold leading-tight" style={{ color: 'var(--ui-strong)' }}>{title}</h2>
      <p className="text-xs mt-0.5 max-w-2xl" style={{ color: UI.dim }}>{blurb}</p>
    </div>
    {children}
  </div>
);

export const StepFooter: React.FC<{ prev?: StepInfo; next?: StepInfo; onGo: (s: Step) => void }> = ({ prev, next, onGo }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t shrink-0" style={{ background: UI.panel, borderColor: UI.rule }}>
    {prev ? <button className={btnGhost} onClick={() => onGo(prev.id)}>← {prev.label}</button> : <span />}
    {next ? <button className={btnPrimary} onClick={() => onGo(next.id)}>Next: {next.label} →</button> : <span className="text-xs" style={{ color: UI.dim }}>Last step. Print or export from the top bar.</span>}
  </div>
);
