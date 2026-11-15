// components/measurement/Stepper.tsx — the SMM7 workflow: labelled steps, a one-line explanation per page, and Back / Next.
import React from 'react';
import { UI, btnGhost, btnPrimary, tint } from '../ui';

export type Step = 'project' | 'drawing' | 'quantities' | 'rates' | 'estimate';
export type Tone = 'done' | 'todo' | 'warn' | 'idle';
export interface StepInfo { id: Step; label: string; blurb: string; status: string; tone: Tone }

const toneColor = (t: Tone) => (t === 'done' ? UI.ok : t === 'warn' ? UI.warn : UI.dim);

export const Stepper: React.FC<{ steps: StepInfo[]; value: Step; onChange: (s: Step) => void }> = ({ steps, value, onChange }) => (
  <nav className="flex items-center gap-1.5 px-6 pb-3 overflow-x-auto shrink-0" aria-label="Estimate steps">
    {steps.map((st, i) => {
      const on = st.id === value;
      return (
        <button key={st.id} onClick={() => onChange(st.id)} aria-current={on ? 'step' : undefined}
          className="flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-full text-left transition-colors"
          style={{ background: on ? UI.accent : 'transparent' }}>
          <span className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-extrabold shrink-0"
            style={on ? { background: tint(UI.accentInk, 18), color: UI.accentInk } : st.tone === 'done' ? { background: tint(UI.ok, 16), color: UI.ok } : { background: UI.field, color: UI.dim }}>
            {st.tone === 'done' ? '✓' : i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold leading-tight" style={{ color: on ? UI.accentInk : UI.strong }}>{st.label}</span>
            <span className="block text-[11px] leading-tight truncate max-w-[130px]" style={{ color: on ? tint(UI.accentInk, 70) : toneColor(st.tone) }}>{st.status}</span>
          </span>
        </button>
      );
    })}
  </nav>
);

export const StepHeader: React.FC<{ n: number; total: number; title: string; blurb: string; children?: React.ReactNode }> = ({ n, total, title, blurb, children }) => (
  <div className="max-w-5xl mx-auto mb-5 flex items-end justify-between gap-4 flex-wrap">
    <div>
      <div className="text-[11px] font-semibold" style={{ color: UI.dim }}>Step {n} of {total}</div>
      <h2 className="text-3xl font-extrabold tracking-tight leading-tight" style={{ color: 'var(--ui-strong)' }}>{title}</h2>
      <p className="text-xs mt-1 max-w-2xl" style={{ color: UI.dim }}>{blurb}</p>
    </div>
    {children}
  </div>
);

export const StepFooter: React.FC<{ prev?: StepInfo; next?: StepInfo; onGo: (s: Step) => void }> = ({ prev, next, onGo }) => (
  <div className="flex items-center justify-between gap-3 px-6 py-3 shrink-0">
    {prev ? <button className={btnGhost} onClick={() => onGo(prev.id)}>← {prev.label}</button> : <span />}
    {next ? <button className={btnPrimary} onClick={() => onGo(next.id)}>Next: {next.label} →</button> : <span className="text-xs" style={{ color: UI.dim }}>Last step. Print or export from the top bar.</span>}
  </div>
);
