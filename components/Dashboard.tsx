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
    <div className="flex flex-col items-center justify-center min-h-screen p-8 relative z-10">
      
      {/* HEADER SECTION */}
      <div className="text-center mb-16 relative">
        <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full -z-10 animate-pulse"></div>
        <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400 mb-4 tracking-tight drop-shadow-lg">
          Construct<span className="text-blue-400">OS</span>
        </h1>
        <p className="text-lg text-slate-300 max-w-xl mx-auto font-light tracking-wide text-shine">
          The Spatial Engineering Platform.
        </p>
      </div>

      {/* CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl w-full">
        {modules.map((mod, idx) => (
          <button
            key={mod.id}
            onClick={() => onSelectModule(mod.id)}
            className="glass-panel group rounded-3xl p-8 text-left relative overflow-hidden"
            style={{ animationDelay: `${idx * 150}ms` }}
          >
            {/* INNER GLOW */}
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${mod.gradient} opacity-20 blur-2xl group-hover:opacity-40 transition-opacity duration-500 rounded-full -mr-10 -mt-10`}></div>
            
            <div className="flex items-start gap-6 relative z-10">
              <div className={`p-4 rounded-2xl bg-gradient-to-br ${mod.gradient} text-white shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500`}>
                {mod.icon}
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-300 transition-colors">
                  {mod.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed font-medium group-hover:text-slate-200 transition-colors">
                  {mod.desc}
                </p>
              </div>
            </div>

            {/* ACTION ARROW */}
            <div className="absolute bottom-8 right-8 opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-300">
               <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </div>
          </button>
        ))}
      </div>
      
      <div className="mt-20 text-slate-500/50 text-xs font-mono tracking-widest uppercase">
        v2.5.0 Liquid / Engine Ready
      </div>
    </div>
  );
};
