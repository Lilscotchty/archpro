import { ThemeToggle } from './theme';
import React from 'react';
import { AppModule } from '../types';

interface DashboardProps {
  onSelectModule: (module: AppModule) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectModule }) => {
  const modules = [
    {
      id: AppModule.DRAWINGS,
      title: 'Drawings & Simulation',
      desc: 'AI-assisted structural layouts, foundation generation, and auto-drafting.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      ),
      gradient: 'from-blue-500 to-cyan-400'
    },
    {
      id: AppModule.ELEVATIONS,
      title: 'Elevation Studio',
      desc: 'Upload a plan (image or PDF), pick the external walls, windows and doors, and get front, rear and side elevations as clean black-and-white line drawings.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6M7 13h.01M17 13h.01" /></svg>
      ),
      gradient: 'from-rose-500 to-orange-400'
    },
    {
      id: AppModule.MEASUREMENT,
      title: 'Calculation & Measurement',
      desc: 'SMM7 Bill of Quantities, material take-offs, and cost estimation.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
      ),
      gradient: 'from-emerald-500 to-teal-400'
    },
    {
      id: AppModule.METHOD_STUDY,
      title: 'Method Study',
      desc: 'Site organization, safety plans, and construction methodology.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
      ),
      gradient: 'from-purple-500 to-pink-400'
    },
    {
      id: AppModule.PHYSICS,
      title: 'Building Physics Lab',
      desc: 'Thermal calculations, structural load analysis, and environmental impact.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
      ),
      gradient: 'from-amber-500 to-orange-400'
    }
  ];

  return (
    <div className="legacy-dash flex flex-col items-center justify-center min-h-screen p-8 relative z-10">
      <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>
      {/* Styles scoped to the dashboard only, so other pages keep the unified studio look */}
      <style>{`
        .legacy-dash { background-color: var(--ui-bg); color: var(--ui-text); font-family: 'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif; }
        .legacy-dash .glass-panel { background: var(--ui-panel); border: 1px solid var(--ui-rule); box-shadow: var(--ui-shadow); }
        .legacy-dash .glass-panel:hover { background: var(--ui-hover); }
      `}</style>
      
      {/* HEADER SECTION */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-semibold mb-2 tracking-tight" style={{ color: 'var(--ui-strong)' }}>
          Construct<span style={{ color: 'var(--ui-accent)' }}>OS</span>
        </h1>
        <p className="text-base max-w-xl mx-auto" style={{ color: 'var(--ui-dim)' }}>
          The Spatial Engineering Platform.
        </p>
      </div>

      {/* CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl w-full">
        {modules.map((mod, idx) => (
          <button
            key={mod.id}
            onClick={() => onSelectModule(mod.id)}
            className="glass-panel group rounded-xl p-6 text-left relative flex items-start transition-colors duration-150"
          >
            
            <div className="flex items-start gap-5 relative z-10">
              <div className="p-3 rounded-[var(--ui-r)] shrink-0" style={{ background: 'color-mix(in srgb, var(--ui-accent) 12%, transparent)', color: 'var(--ui-accent)' }}>
                {mod.icon}
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--ui-strong)' }}>
                  {mod.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ui-dim)' }}>
                  {mod.desc}
                </p>
              </div>
            </div>

            {/* ACTION ARROW */}
            <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
               <svg className="w-5 h-5" style={{ color: 'var(--ui-accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </div>
          </button>
        ))}
      </div>
      
      <div className="mt-16 text-xs" style={{ color: 'var(--ui-dim)' }}>
        v2.6.0 Stable / SMM7 Engine
      </div>
    </div>
  );
};
