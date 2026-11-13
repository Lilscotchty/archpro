// components/ui.tsx
// Shared design tokens + small primitives so every page matches the Drafting Studio /
// Elevation Studio look: flat dark panels, 1px rules, 3px corners, mono numerals,
// a single blue accent, a 44px title bar. No gradients, glass or glow.

import React from 'react';

export const UI = {
  bg: '#15171a', panel: '#1f2227', raised: '#181a1e', rule: '#2e333a',
  text: '#c9cfd6', dim: '#7d8590', accent: '#4aa3ff', accentInk: '#06121f',
  danger: '#e5484d', warn: '#f5b83d', ok: '#3ddb8a',
};
export const FONT = '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif';
export const MONO = 'ui-monospace, "IBM Plex Mono", "JetBrains Mono", Consolas, monospace';

export const inputCls = 'w-full bg-[#15171a] border border-[#2e333a] rounded-[3px] px-2 py-1.5 text-xs text-[#c9cfd6] font-mono focus:outline-none focus:border-[#4aa3ff]';
export const btnGhost = 'px-3 py-1.5 text-xs border border-[#2e333a] rounded-[3px] hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed';
export const btnPrimary = 'px-3 py-1.5 text-xs rounded-[3px] font-medium bg-[#4aa3ff] text-[#06121f] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed';
export const btnDanger = 'px-3 py-1.5 text-xs border border-[#e5484d] text-[#e5484d] rounded-[3px] hover:bg-[#e5484d]/10 disabled:opacity-40 disabled:cursor-not-allowed';
export const boxCls = 'border border-[#2e333a] rounded-[3px] p-3 bg-[#181a1e]';

const ICONS: Record<string, string> = {
  drawings: 'M4 20L20 4M5 6h6v6H5zM13 14h6v6h-6z',
  elevations: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  measure: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  method: 'M4 20V8l6-4v16M10 20V10l10 4v6M3 20h18M7 11h.01M7 15h.01',
  physics: 'M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M8 15h8',
  back: 'M10 19l-7-7 7-7M3 12h18',
  download: 'M12 4v12m0 0l-4-4m4 4l4-4M4 20h16',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  close: 'M6 6l12 12M18 6L6 18',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  tool: 'M14 6a4 4 0 105 5l-9 9a2 2 0 01-3-3l9-9',
};

export const Icon: React.FC<{ n: keyof typeof ICONS | string; s?: number }> = ({ n, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[n]} /></svg>
);

/** Full-height app page with the standard 44px title bar. */
export const Screen: React.FC<{
  crumb?: string; onHome?: () => void; actions?: React.ReactNode; children: React.ReactNode;
}> = ({ crumb, onHome, actions, children }) => (
  <div className="h-screen w-full flex flex-col" style={{ background: UI.bg, color: UI.text, fontFamily: FONT, fontSize: 13 }}>
    <header style={{ background: UI.panel, borderColor: UI.rule }} className="h-11 flex items-center gap-3 px-3 border-b shrink-0">
      {onHome
        ? <button onClick={onHome} className="font-semibold tracking-tight hover:text-white" title="Back to dashboard">ArchPro</button>
        : <span className="font-semibold tracking-tight">ArchPro</span>}
      {crumb && <span style={{ color: UI.dim }}>/ {crumb}</span>}
      <div className="flex-1" />
      {actions}
    </header>
    {children}
  </div>
);

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ borderColor: UI.rule }} className="border-b px-3 py-3 space-y-2">
    <div className="text-xs font-semibold" style={{ color: UI.text }}>{title}</div>
    {children}
  </div>
);

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="text-xs" style={{ color: UI.dim }}>{label}</span>
    <div className="mt-1">{children}</div>
    {hint && <span className="text-[10px]" style={{ color: UI.dim }}>{hint}</span>}
  </label>
);

export const Segmented: React.FC<{ value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }> = ({ value, options, onChange }) => (
  <div className="flex gap-1 p-0.5 border rounded-[3px]" style={{ borderColor: UI.rule, background: UI.bg }}>
    {options.map(o => (
      <button key={o.id} onClick={() => onChange(o.id)}
        className={`flex-1 py-1.5 text-xs rounded-[3px] ${value === o.id ? 'bg-[#4aa3ff] text-[#06121f] font-medium' : 'hover:bg-white/5'}`}>{o.label}</button>
    ))}
  </div>
);

export const Tag: React.FC<{ tone?: 'ok' | 'warn' | 'dim'; children: React.ReactNode }> = ({ tone = 'dim', children }) => {
  const c = tone === 'ok' ? UI.ok : tone === 'warn' ? UI.warn : UI.dim;
  return <span className="px-1.5 py-0.5 text-[10px] border rounded-[3px] uppercase tracking-wide" style={{ color: c, borderColor: c + '66', fontFamily: MONO }}>{children}</span>;
};
