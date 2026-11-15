import React from 'react';
import { AppModule } from '../types';

interface DashboardProps {
  onSelectModule: (module: AppModule) => void;
}

const I = (d: string) => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d={d} /></svg>
);

const MODULES = [
  { id: AppModule.DRAWINGS, title: 'Drawings & Simulation', tag: '2D + 3D', hot: '1', grad: ['#5aaeff', '#22d3ee'],
    desc: 'Trace a plan, lay out grids and walls, generate the foundation sheet, and see the building in 3D.',
    icon: I('M4 20L20 4M5 6h6v6H5zM13 14h6v6h-6z') },
  { id: AppModule.ELEVATIONS, title: 'Elevation Studio', tag: 'New', hot: '2', grad: ['#fb7185', '#fb923c'],
    desc: 'Upload a plan image or PDF, pick walls, windows and doors, and get clean front, rear and side elevations.',
    icon: I('M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6') },
  { id: AppModule.MEASUREMENT, title: 'Calculation & Measurement', tag: 'SMM7', hot: '3', grad: ['#34d399', '#2dd4bf'],
    desc: 'Bills of quantities and material take-offs from your drawings, with an AI assistant for descriptions.',
    icon: I('M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2') },
  { id: AppModule.METHOD_STUDY, title: 'Method Study', tag: 'Programme', hot: '4', grad: ['#a78bfa', '#818cf8'],
    desc: 'Build the construction programme with critical path and keep the site risk register.',
    icon: I('M4 20V8l6-4v16M10 20V10l10 4v6M3 20h18') },
  { id: AppModule.PHYSICS, title: 'Building Physics Lab', tag: 'Analysis', hot: '5', grad: ['#fbbf24', '#f59e0b'],
    desc: 'U-values and heat loss, slab load take-down, and embodied carbon estimates.',
    icon: I('M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M8 15h8') },
];

export const Dashboard: React.FC<DashboardProps> = ({ onSelectModule }) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const m = MODULES.find(x => x.hot === e.key);
      if (m) onSelectModule(m.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelectModule]);

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ color: '#d6dbe2', fontFamily: '"IBM Plex Sans","Segoe UI",system-ui,sans-serif' }}>
      {/* aurora */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div style={{ position: 'absolute', top: '-18%', left: '-10%', width: '60vw', height: '60vw', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(90,174,255,.28), transparent)', filter: 'blur(40px)', animation: 'aurora 16s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '10%', right: '-15%', width: '55vw', height: '55vw', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(167,139,250,.24), transparent)', filter: 'blur(48px)', animation: 'aurora 20s ease-in-out infinite reverse' }} />
        <div style={{ position: 'absolute', bottom: '-25%', left: '25%', width: '50vw', height: '40vw', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(52,211,153,.14), transparent)', filter: 'blur(50px)', animation: 'aurora 24s ease-in-out infinite' }} />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '56px 56px', maskImage: 'radial-gradient(ellipse at 50% 30%, #000 25%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, #000 25%, transparent 75%)' }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-10 pt-14 pb-16">
        <div className="flex items-center gap-3" style={{ animation: 'rise .6s ease both' }}>
          <span className="grid place-items-center w-11 h-11 rounded-xl text-xl font-black" style={{ color: '#04101c', background: 'linear-gradient(135deg,#7cc4ff,#7c8cff)', boxShadow: '0 10px 30px -8px rgba(90,174,255,.8)' }}>A</span>
          <span className="text-lg font-semibold tracking-tight">ArchPro</span>
          <span className="ml-1 px-2.5 py-0.5 rounded-full text-xs border" style={{ borderColor: 'rgba(255,255,255,.14)', color: '#8a94a2' }}>Construction studio</span>
        </div>

        <h1 className="mt-10 font-semibold tracking-tight" style={{ fontSize: 'clamp(2.4rem, 5.6vw, 4.2rem)', lineHeight: 1.04, animation: 'rise .7s .05s ease both' }}>
          From a sketch to a{' '}
          <span style={{ background: 'linear-gradient(100deg,#7cc4ff,#a78bfa 55%,#fb7185)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>buildable model</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-lg" style={{ color: '#8a94a2', animation: 'rise .7s .12s ease both' }}>
          Draw the plan, generate elevations, take off quantities and plan the build, all in one place. Pick a studio to begin, or press its number key.
        </p>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {MODULES.map((m, i) => (
            <button key={m.id} onClick={() => onSelectModule(m.id)}
              className="group relative text-left rounded-2xl p-6 border overflow-hidden"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02))', borderColor: 'rgba(255,255,255,.09)', backdropFilter: 'blur(14px)', animation: `rise .6s ${0.18 + i * 0.07}s ease both`, transition: 'transform .25s ease, border-color .25s ease, box-shadow .25s ease' }}
              onMouseEnter={e => { const el = e.currentTarget; el.style.transform = 'translateY(-4px)'; el.style.borderColor = m.grad[0] + '88'; el.style.boxShadow = `0 24px 60px -24px ${m.grad[0]}99`; }}
              onMouseLeave={e => { const el = e.currentTarget; el.style.transform = ''; el.style.borderColor = 'rgba(255,255,255,.09)'; el.style.boxShadow = ''; }}>
              <div aria-hidden className="absolute -top-16 -right-16 w-44 h-44 rounded-full opacity-0 group-hover:opacity-100" style={{ background: `radial-gradient(closest-side, ${m.grad[0]}55, transparent)`, transition: 'opacity .3s ease' }} />
              <div className="relative flex items-start justify-between">
                <span className="grid place-items-center w-14 h-14 rounded-2xl" style={{ color: '#04101c', background: `linear-gradient(135deg, ${m.grad[0]}, ${m.grad[1]})`, boxShadow: `0 12px 28px -10px ${m.grad[0]}` }}>{m.icon}</span>
                <span className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs border" style={{ borderColor: m.grad[0] + '66', color: m.grad[0] }}>{m.tag}</span>
                  <kbd className="px-2 py-0.5 rounded-md text-xs border" style={{ borderColor: 'rgba(255,255,255,.14)', color: '#8a94a2', fontFamily: 'ui-monospace, monospace' }}>{m.hot}</kbd>
                </span>
              </div>
              <h2 className="relative mt-5 text-xl font-semibold tracking-tight" style={{ color: '#f1f4f8' }}>{m.title}</h2>
              <p className="relative mt-2 text-base leading-relaxed" style={{ color: '#8a94a2' }}>{m.desc}</p>
              <div className="relative mt-5 flex items-center gap-1.5 text-sm font-medium" style={{ color: m.grad[0] }}>
                Open studio <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-14 text-sm" style={{ color: '#5d6672', fontFamily: 'ui-monospace, monospace' }}>ArchPro · SMM7 engine</div>
      </div>
    </div>
  );
};
