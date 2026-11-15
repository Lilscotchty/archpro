// components/drafting/fields.tsx — small inputs used by the Drafting Studio panels.
import React, { useEffect, useState } from 'react';
import { UI, MONO } from '../ui';

/** Numeric field that only commits on Enter / blur, so typing "1" on the way to "1200" never moves geometry. */
export const NumField: React.FC<{
  value: number; onCommit: (n: number) => void; suffix?: string; min?: number; max?: number; decimals?: number; disabled?: boolean; width?: string;
}> = ({ value, onCommit, suffix, min, max, decimals = 0, disabled, width = 'w-full' }) => {
  const show = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(decimals))) : '');
  const [txt, setTxt] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setTxt(show(value)); }, [value, focus]); // eslint-disable-line
  const commit = () => {
    const n = parseFloat(txt.replace(',', '.'));
    if (!Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) { setTxt(show(value)); return; }
    if (n !== value) onCommit(n);
    setTxt(show(n));
  };
  return (
    <span className={`relative inline-flex items-center ${width}`}>
      <input type="text" inputMode="decimal" disabled={disabled} value={txt} onFocus={e => { setFocus(true); e.currentTarget.select(); }}
        onChange={e => setTxt(e.target.value)} onBlur={() => { setFocus(false); commit(); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } if (e.key === 'Escape') { setTxt(show(value)); e.currentTarget.blur(); } e.stopPropagation(); }}
        style={{ background: UI.bg, borderColor: UI.rule, color: UI.text, fontFamily: MONO, paddingRight: suffix ? 30 : undefined }}
        className="w-full px-2 py-1.5 border rounded-[var(--ui-r)] text-xs text-right focus:outline-none focus:border-[var(--ui-accent)] disabled:opacity-40" />
      {suffix && <span className="absolute right-2 text-[10px] pointer-events-none" style={{ color: UI.dim }}>{suffix}</span>}
    </span>
  );
};

export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 text-xs">
    <span style={{ color: UI.dim }} className="shrink-0">{label}</span>
    <span className="w-28">{children}</span>
  </div>
);

export const Check: React.FC<{ checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ checked, onChange, children }) => (
  <label className="flex items-center gap-2 py-0.5 text-xs cursor-pointer"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{children}</label>
);
