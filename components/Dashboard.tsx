// components/Dashboard.tsx — landing page. Soft light surface, light + bold heading, black pill buttons,
// a floating quick-start bar and no borders: shapes are defined only by fill colour.
import React, { useState } from 'react';
import { AppModule } from '../types';
import { Icon, UI, tint } from './ui';
import { ThemeToggle, useTheme } from './theme';

interface DashboardProps { onSelectModule: (module: AppModule) => void }

const MODULES = [
  { id: AppModule.DRAWINGS, nav: 'Drawings', title: 'Drawings & Simulation', icon: 'plan', desc: 'AI-assisted structural layouts, foundation generation and auto-drafting.' },
  { id: AppModule.ELEVATIONS, nav: 'Elevations', title: 'Elevation Studio', icon: 'elevations', desc: 'Upload a plan, pick the walls, windows and doors, and get clean line elevations.' },
  { id: AppModule.MEASUREMENT, nav: 'Estimate', title: 'Calculation & Measurement', icon: 'measure', desc: 'SMM7 bill of quantities, material take-offs and cost estimation.' },
  { id: AppModule.METHOD_STUDY, nav: 'Method', title: 'Method Study', icon: 'method', desc: 'Site organisation, safety plans and construction methodology.' },
  { id: AppModule.PHYSICS, nav: 'Physics', title: 'Building Physics Lab', icon: 'physics', desc: 'Thermal calculations, structural load analysis and environmental impact.' },
];

/** Flat house illustration (white walls, slate roof, terracotta chimney). */
const House: React.FC = () => (
  <svg viewBox="0 0 560 400" className="w-full h-auto" role="img" aria-label="Illustration of a house">
    <ellipse cx="290" cy="360" rx="250" ry="16" fill="#0c0e12" opacity=".08" />
    <rect x="70" y="190" width="300" height="165" fill="#ffffff" />
    <rect x="370" y="210" width="130" height="145" fill="#f1f4f7" />
    <polygon points="40,200 230,70 420,200 395,214 230,102 65,214" fill="#2b3440" />
    <polygon points="230,70 420,200 520,215 330,92" fill="#3a4654" />
    <polygon points="360,215 520,215 500,238 380,238" fill="#2b3440" />
    <rect x="300" y="48" width="34" height="62" fill="#d9683c" />
    <rect x="296" y="42" width="42" height="10" fill="#b9532b" />
    <polygon points="205,118 255,118 230,92" fill="#d9683c" opacity=".9" />
    <rect x="96" y="226" width="64" height="70" fill="#1f2933" /><rect x="102" y="232" width="52" height="58" fill="#f2a679" />
    <rect x="190" y="226" width="64" height="70" fill="#1f2933" /><rect x="196" y="232" width="52" height="58" fill="#f2a679" />
    <rect x="286" y="226" width="64" height="70" fill="#1f2933" /><rect x="292" y="232" width="52" height="58" fill="#f2a679" />
    <rect x="404" y="262" width="76" height="70" fill="#1f2933" /><rect x="410" y="268" width="64" height="58" fill="#f2a679" />
    <rect x="200" y="300" width="48" height="55" fill="#1f2933" />
    <path d="M96 261h58M190 261h58M286 261h58M442 262v70" stroke="#1f2933" strokeWidth="3" />
    <circle cx="515" cy="345" r="20" fill="#5f8d5a" /><circle cx="540" cy="352" r="16" fill="#6f9d68" /><circle cx="498" cy="354" r="14" fill="#4f7d4b" />
  </svg>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex-1 min-w-[150px] px-4 py-2 rounded-2xl hover:bg-[var(--ui-hover)] transition-colors cursor-pointer">
    <span className="block text-[11px] font-semibold" style={{ color: UI.dim }}>{label}</span>
    {children}
  </label>
);
const selCls = 'w-full bg-transparent text-sm font-bold focus:outline-none cursor-pointer pr-6';

export const Dashboard: React.FC<DashboardProps> = ({ onSelectModule }) => {
  const [pick, setPick] = useState<string>(String(AppModule.MEASUREMENT));
  const [theme, setTheme] = useTheme();
  const go = (id: string) => { const m = MODULES.find(x => String(x.id) === id); if (m) onSelectModule(m.id); };

  return (
    <div className="min-h-screen w-full p-2 sm:p-6" style={{ background: UI.page, color: UI.text, fontFamily: 'Nunito, "Segoe UI", system-ui, sans-serif' }}>
      <div className="mx-auto max-w-6xl overflow-hidden" style={{ background: UI.bg, borderRadius: 'var(--ui-r2)', boxShadow: 'var(--ui-shadow)' }}>
        {/* top bar */}
        <header className="flex items-center gap-6 px-6 sm:px-10 py-6">
          <span className="text-xl font-extrabold tracking-tight" style={{ color: UI.strong }}>ArchPro</span>
          <div className="flex-1" />
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold">
            {MODULES.map(m => <button key={m.id} onClick={() => onSelectModule(m.id)} className="hover:opacity-100 opacity-70 transition-opacity" style={{ color: UI.strong }}>{m.nav}</button>)}
          </nav>
          <ThemeToggle />
          <button onClick={() => onSelectModule(AppModule.MEASUREMENT)} className="px-6 py-2.5 rounded-full text-xs font-bold" style={{ background: UI.accent, color: UI.accentInk }}>Start estimate</button>
        </header>

        {/* hero */}
        <section className="relative grid md:grid-cols-2 items-center gap-6 px-6 sm:px-10 pt-6 pb-28">
          <div>
            <h1 className="text-5xl sm:text-6xl leading-[1.08] tracking-tight" style={{ color: UI.strong }}>
              <span className="font-light">Gateway to</span><br /><span className="font-extrabold">Better Estimates</span>
            </h1>
            <p className="mt-6 text-xs max-w-xs leading-relaxed" style={{ color: UI.dim }}>Draw a plan, read a drawing, and build a priced bill of quantities in one place, simplified and organised step by step.</p>
            <div className="mt-8 flex items-center gap-5">
              <button onClick={() => onSelectModule(AppModule.MEASUREMENT)} className="px-7 py-3 rounded-full text-xs font-bold" style={{ background: UI.accent, color: UI.accentInk }}>Discover Now</button>
              <button onClick={() => onSelectModule(AppModule.DRAWINGS)} className="flex items-center gap-3 text-xs font-bold" style={{ color: UI.strong }}>
                <span className="w-11 h-11 rounded-full grid place-items-center" style={{ background: UI.field }}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
                Open Drafting
              </button>
            </div>
          </div>
          <div className="md:-mr-6"><House /></div>

          {/* floating quick-start bar */}
          <div className="absolute left-6 right-6 sm:left-10 sm:right-10 bottom-6 flex flex-wrap items-center gap-2 p-3 rounded-3xl" style={{ background: UI.panel, boxShadow: 'var(--ui-shadow)' }}>
            <Field label="Module">
              <select className={selCls} style={{ color: UI.strong }} value={pick} onChange={e => setPick(e.target.value)}>
                {MODULES.map(m => <option key={m.id} value={String(m.id)}>{m.title}</option>)}
              </select>
            </Field>
            <Field label="Appearance">
              <select className={selCls} style={{ color: UI.strong }} value={theme} onChange={e => setTheme(e.target.value as 'light' | 'dark')}>
                <option value="light">Light</option><option value="dark">Dark</option>
              </select>
            </Field>
            <button onClick={() => go(pick)} aria-label="Open module" className="w-12 h-12 rounded-full grid place-items-center shrink-0 ml-auto" style={{ background: UI.accent, color: UI.accentInk }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </section>

        {/* modules */}
        <section className="px-6 sm:px-10 pb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {MODULES.map(m => (
            <button key={m.id} onClick={() => onSelectModule(m.id)} className="text-left p-5 rounded-3xl transition-transform hover:-translate-y-0.5" style={{ background: UI.panel, boxShadow: 'var(--ui-shadow)' }}>
              <span className="w-10 h-10 rounded-full grid place-items-center" style={{ background: UI.field, color: UI.strong }}><Icon n={m.icon} s={18} /></span>
              <div className="mt-4 text-sm font-extrabold" style={{ color: UI.strong }}>{m.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed" style={{ color: UI.dim }}>{m.desc}</div>
            </button>
          ))}
        </section>
        <div className="pb-6 text-center text-[11px]" style={{ color: tint(UI.dim, 90) }}>v2.6.0 · SMM7 engine</div>
      </div>
    </div>
  );
};
