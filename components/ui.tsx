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
  table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  thermal: 'M10 14V5a2 2 0 014 0v9a4 4 0 11-4 0zM12 9v7',
  loads: 'M4 18h16M6 18V9h12v9M12 3v6M9 6l3 3 3-3',
  carbon: 'M12 3c5 3 7 7 4 11a6 6 0 01-8 1c-3-3-2-8 4-12zM12 21v-8',
  gantt: 'M4 6h8M8 12h10M6 18h7M4 3v18',
  risk: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
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

/** Bottom status bar (same strip the studios use). */
export const StatusBar: React.FC<{ left?: React.ReactNode; right?: React.ReactNode }> = ({ left, right }) => (
  <footer style={{ background: UI.raised, borderColor: UI.rule, fontFamily: MONO, color: UI.dim }} className="h-7 border-t flex items-center gap-4 px-3 text-xs shrink-0">
    {left}<span className="flex-1" />{right}
  </footer>
);

/** Left icon rail: tab / tool buttons in the same style as the studio tool palette. */
export const Rail: React.FC<{ items: { id: string; icon: string; label: string }[]; value: string; onChange: (id: string) => void }> = ({ items, value, onChange }) => (
  <nav style={{ background: UI.panel, borderColor: UI.rule }} className="w-12 border-r flex flex-col items-center py-2 gap-1 shrink-0">
    {items.map(it => (
      <button key={it.id} title={it.label} onClick={() => onChange(it.id)}
        style={{ background: value === it.id ? UI.accent : 'transparent', color: value === it.id ? UI.accentInk : UI.text }}
        className="w-9 h-9 grid place-items-center rounded-[3px] hover:brightness-125 focus-visible:outline outline-2 outline-offset-1">
        <Icon n={it.icon} />
      </button>
    ))}
  </nav>
);

/** Right-hand properties panel. */
export const Panel: React.FC<{ children: React.ReactNode; width?: string }> = ({ children, width = 'w-72' }) => (
  <aside style={{ background: UI.panel, borderColor: UI.rule }} className={`${width} border-l overflow-y-auto shrink-0`}>{children}</aside>
);

export const Empty: React.FC<{ icon: string; title: string; hint: string }> = ({ icon, title, hint }) => (
  <div className="h-full grid place-items-center">
    <div className="text-center max-w-xs">
      <div style={{ color: UI.dim }} className="flex justify-center"><Icon n={icon} s={28} /></div>
      <div className="mt-3 font-semibold" style={{ color: '#e6e9ed' }}>{title}</div>
      <div className="mt-1 text-xs" style={{ color: UI.dim }}>{hint}</div>
    </div>
  </div>
);

export const Stat: React.FC<{ label: string; value: string; unit?: string; tone?: 'ok' | 'warn' | 'danger' }> = ({ label, value, unit, tone }) => (
  <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] px-3 py-2">
    <div className="text-[11px]" style={{ color: UI.dim }}>{label}</div>
    <div className="mt-0.5 text-xl" style={{ fontFamily: MONO, color: tone === 'ok' ? UI.ok : tone === 'warn' ? UI.warn : tone === 'danger' ? UI.danger : '#e6e9ed' }}>
      {value}{unit && <span className="text-xs" style={{ color: UI.dim }}> {unit}</span>}
    </div>
  </div>
);

export const thCls = 'px-3 py-2 font-medium text-left';
export const tdCls = 'px-3 py-2';
