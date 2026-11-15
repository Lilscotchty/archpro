// components/ui.tsx
// Shared design tokens + small primitives so every page matches the Drafting Studio /
// Elevation Studio look: soft light surfaces, no borders (depth comes only from fill colour), pill buttons,
// rounded corners, Nunito type. No gradients, glass or glow.

import React from 'react';
import { ThemeToggle } from './theme';

// Every colour is a CSS variable (see index.html), so one data-theme switch restyles the whole app.
export const UI = {
  bg: 'var(--ui-bg)', panel: 'var(--ui-panel)', raised: 'var(--ui-raised)', rule: 'var(--ui-rule)', field: 'var(--ui-field)', page: 'var(--ui-page)',
  text: 'var(--ui-text)', dim: 'var(--ui-dim)', strong: 'var(--ui-strong)', accent: 'var(--ui-accent)', accentInk: 'var(--ui-accentInk)',
  danger: 'var(--ui-danger)', warn: 'var(--ui-warn)', ok: 'var(--ui-ok)', sunken: 'var(--ui-sunken)',
};
/** A theme colour at a given opacity (replaces the old `colour + '88'` hex-alpha trick). */
export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
export const FONT = 'Nunito, "Segoe UI", system-ui, sans-serif';
export const MONO = 'Nunito, "Segoe UI", system-ui, sans-serif';

export const inputCls = 'w-full bg-[var(--ui-field)] rounded-xl px-3 py-2 text-xs text-[var(--ui-strong)] tabular-nums transition-shadow focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ui-strong)_14%,transparent)]';
export const btnGhost = 'px-4 py-2 text-xs font-semibold rounded-full bg-[var(--ui-field)] text-[var(--ui-strong)] hover:bg-[var(--ui-sunken)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const btnPrimary = 'px-5 py-2 text-xs font-semibold rounded-full bg-[var(--ui-accent)] text-[var(--ui-accentInk)] hover:opacity-85 transition disabled:opacity-40 disabled:cursor-not-allowed';
export const btnDanger = 'px-4 py-2 text-xs font-semibold rounded-full bg-[color-mix(in_srgb,var(--ui-danger)_12%,transparent)] text-[var(--ui-danger)] hover:bg-[color-mix(in_srgb,var(--ui-danger)_20%,transparent)] disabled:opacity-40 disabled:cursor-not-allowed';
export const boxCls = 'rounded-2xl p-4 bg-[var(--ui-panel)] shadow-[var(--ui-shadow)]';

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
  spark: 'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  sum: 'M18 5H6l7 7-7 7h12',
  coins: 'M12 4c4 0 7 1.3 7 3s-3 3-7 3-7-1.3-7-3 3-3 7-3zM5 7v5c0 1.7 3 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3 3 7 3s7-1.3 7-3v-5',
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16',
  setup: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4',
  plan: 'M4 4h16v16H4zM4 11h8M12 4v16M12 15h8',
};

export const Icon: React.FC<{ n: keyof typeof ICONS | string; s?: number }> = ({ n, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[n]} /></svg>
);

/** Full-height app page: a large rounded surface floating on a tinted page, logo left, actions right. */
export const Screen: React.FC<{
  crumb?: string; onHome?: () => void; actions?: React.ReactNode; children: React.ReactNode;
}> = ({ crumb, onHome, actions, children }) => (
  <div className="h-screen w-full p-2 sm:p-3" style={{ background: UI.page, color: UI.text, fontFamily: FONT, fontSize: 13 }}>
    <div className="h-full w-full flex flex-col overflow-hidden" style={{ background: UI.bg, borderRadius: 'var(--ui-r2)', boxShadow: 'var(--ui-shadow)' }}>
      <header className="h-16 flex items-center gap-4 px-6 shrink-0">
        {onHome
          ? <button onClick={onHome} className="text-lg font-extrabold tracking-tight" style={{ color: UI.strong }} title="Back to dashboard">ArchPro</button>
          : <span className="text-lg font-extrabold tracking-tight" style={{ color: UI.strong }}>ArchPro</span>}
        {crumb && <span className="text-xs" style={{ color: UI.dim }}>{crumb}</span>}
        <div className="flex-1" />
        {actions}
        <ThemeToggle />
      </header>
      {children}
    </div>
  </div>
);

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="px-4 py-4 space-y-2">
    <div className="text-xs font-bold" style={{ color: UI.strong }}>{title}</div>
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
  <div className="flex gap-1 p-1 rounded-full" style={{ background: UI.field }}>
    {options.map(o => (
      <button key={o.id} onClick={() => onChange(o.id)}
        className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-full transition-colors ${value === o.id ? 'bg-[var(--ui-accent)] text-[var(--ui-accentInk)]' : 'text-[var(--ui-dim)] hover:text-[var(--ui-strong)]'}`}>{o.label}</button>
    ))}
  </div>
);

export const Tag: React.FC<{ tone?: 'ok' | 'warn' | 'dim'; children: React.ReactNode }> = ({ tone = 'dim', children }) => {
  const c = tone === 'ok' ? UI.ok : tone === 'warn' ? UI.warn : UI.dim;
  return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wide" style={{ color: c, background: tint(c, 13) }}>{children}</span>;
};

/** Bottom status bar (same strip the studios use). */
export const StatusBar: React.FC<{ left?: React.ReactNode; right?: React.ReactNode }> = ({ left, right }) => (
  <footer style={{ color: UI.dim }} className="h-8 flex items-center gap-4 px-6 text-[11px] shrink-0">
    {left}<span className="flex-1" />{right}
  </footer>
);

/** Left icon rail: tab / tool buttons in the same style as the studio tool palette. */
export const Rail: React.FC<{ items: { id: string; icon: string; label: string }[]; value: string; onChange: (id: string) => void }> = ({ items, value, onChange }) => (
  <nav style={{ background: UI.panel }} className="w-14 flex flex-col items-center py-3 gap-1.5 shrink-0 ml-3 mb-3 rounded-2xl">
    {items.map(it => (
      <button key={it.id} title={it.label} onClick={() => onChange(it.id)}
        style={{ background: value === it.id ? UI.accent : 'transparent', color: value === it.id ? UI.accentInk : UI.text }}
        className="w-10 h-10 grid place-items-center rounded-full hover:opacity-80 focus-visible:outline outline-2 outline-offset-1">
        <Icon n={it.icon} />
      </button>
    ))}
  </nav>
);

/** Right-hand properties panel. */
export const Panel: React.FC<{ children: React.ReactNode; width?: string }> = ({ children, width = 'w-72' }) => (
  <aside style={{ background: UI.panel }} className={`${width} overflow-y-auto shrink-0 mr-3 mb-3 rounded-2xl`}>{children}</aside>
);

export const Empty: React.FC<{ icon: string; title: string; hint: string }> = ({ icon, title, hint }) => (
  <div className="h-full grid place-items-center">
    <div className="text-center max-w-xs">
      <div style={{ color: UI.dim }} className="flex justify-center"><Icon n={icon} s={28} /></div>
      <div className="mt-3 font-semibold" style={{ color: 'var(--ui-strong)' }}>{title}</div>
      <div className="mt-1 text-xs" style={{ color: UI.dim }}>{hint}</div>
    </div>
  </div>
);

export const Stat: React.FC<{ label: string; value: string; unit?: string; tone?: 'ok' | 'warn' | 'danger' }> = ({ label, value, unit, tone }) => (
  <div style={{ background: UI.panel }} className="rounded-2xl px-4 py-3">
    <div className="text-[11px]" style={{ color: UI.dim }}>{label}</div>
    <div className="mt-0.5 text-xl" style={{ fontFamily: MONO, color: tone === 'ok' ? UI.ok : tone === 'warn' ? UI.warn : tone === 'danger' ? UI.danger : 'var(--ui-strong)' }}>
      {value}{unit && <span className="text-xs" style={{ color: UI.dim }}> {unit}</span>}
    </div>
  </div>
);

export const thCls = 'px-3 py-2 font-medium text-left';
export const tdCls = 'px-3 py-2';
