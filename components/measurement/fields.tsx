// components/measurement/fields.tsx — small controlled inputs shared by the Measurement panels.
import React, { useEffect, useRef, useState } from 'react';
import { UI, inputCls } from '../ui';

export const NumInput: React.FC<{ value: number; onChange: (n: number) => void; className?: string; title?: string }> = ({ value, onChange, className, title }) => {
  const [txt, setTxt] = useState(String(value));
  const focus = useRef(false);
  useEffect(() => { if (!focus.current) setTxt(String(value)); }, [value]);
  return (
    <input type="text" inputMode="decimal" title={title} className={className ?? inputCls} value={txt}
      onFocus={e => { focus.current = true; e.target.select(); }} onBlur={() => { focus.current = false; setTxt(String(value)); }}
      onChange={e => { setTxt(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(n); else if (e.target.value === '') onChange(0); }} />
  );
};

export const TextInput: React.FC<{ value: string; onChange: (s: string) => void; placeholder?: string; className?: string; type?: string }> = ({ value, onChange, placeholder, className, type }) => (
  <input type={type ?? 'text'} className={className ?? inputCls} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
);

export const Select: React.FC<{ value: string; onChange: (s: string) => void; options: [string, string][]; className?: string }> = ({ value, onChange, options, className }) => (
  <select className={className ?? inputCls} value={value} onChange={e => onChange(e.target.value)}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
);

export const Check: React.FC<{ checked: boolean; onChange: (b: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
  <label className="flex items-center gap-2 text-xs cursor-pointer select-none"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label}</label>
);

export const Lbl: React.FC<{ label: string; unit?: string; hint?: string; children: React.ReactNode }> = ({ label, unit, hint, children }) => (
  <label className="block">
    <span className="text-[11px]" style={{ color: UI.dim }}>{label}{unit ? ` (${unit})` : ''}</span>
    <div className="mt-0.5">{children}</div>
    {hint && <span className="text-[10px] block mt-0.5" style={{ color: UI.dim }}>{hint}</span>}
  </label>
);

export const Card: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({ title, note, children }) => (
  <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] p-3">
    <div className="text-xs font-semibold mb-2" style={{ color: 'var(--ui-strong)' }}>{title}</div>
    {note && <div className="text-[11px] mb-2" style={{ color: UI.dim }}>{note}</div>}
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</div>
  </div>
);

export const fmt = (n: number, dp = 2) => n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
