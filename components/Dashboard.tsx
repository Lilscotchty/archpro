// components/Dashboard.tsx
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
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-blue-600',
      border: 'hover:border-blue-500'
    },
    {
      id: AppModule.MEASUREMENT,
      title: 'Calculation & Measurement',
      desc: 'SMM7 Bill of Quantities, material take-offs, and cost estimation.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-emerald-600',
      border: 'hover:border-emerald-500'
    },
    {
      id: AppModule.METHOD_STUDY,
      title: 'Method Study',
      desc: 'Site organization, safety plans, and construction methodology.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      color: 'bg-purple-600',
      border: 'hover:border-purple-500'
    },
    {
      id: AppModule.PHYSICS,
      title: 'Building Physics Lab',
      desc: 'Thermal calculations, structural load analysis, and environmental impact.',
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      color: 'bg-amber-600',
      border: 'hover:border-amber-500'
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 font-sans">
      <div className="text-center mb-16 animate-fade-in-down">
        <h1 className="text-5xl font-extrabold text-white mb-4 tracking-tight">
          Construct<span className="text-blue-500">OS</span>
        </h1>
        <p className="text-slate-400 max-w-xl mx-auto text-lg">
          The Unified Engineering Platform.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl w-full">
        {modules.map((mod, idx) => (
          <button
            key={mod.id}
            onClick={() => onSelectModule(mod.id)}
            className={`group relative bg-slate-900 border border-slate-800 rounded-2xl p-8 transition-all hover:shadow-2xl hover:shadow-blue-900/10 hover:-translate-y-1 text-left flex items-start gap-6 ${mod.border}`}
            style={{ animationDelay: `${idx * 100}ms` }}
          >
            <div className={`${mod.color} p-4 rounded-xl text-white shadow-lg group-hover:scale-110 transition-transform`}>
              {mod.icon}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">{mod.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{mod.desc}</p>
            </div>
          </button>
        ))}
      </div>
      
      <div className="mt-16 text-slate-600 text-xs font-mono">
        SYSTEM STATUS: ONLINE &bull; v2.0.0 &bull; NEVODEX AI
      </div>
    </div>
  );
};
