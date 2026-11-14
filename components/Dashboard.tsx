import React from 'react';
import { AppModule } from '../types';
import { Icon, Screen, Tag, UI, MONO } from './ui';

interface DashboardProps {
  onSelectModule: (module: AppModule) => void;
}

const MODULES: { id: AppModule; title: string; desc: string; icon: string; ready: boolean; hotkey: string }[] = [
  { id: AppModule.DRAWINGS, title: 'Drafting studio', icon: 'drawings', ready: true, hotkey: '1',
    desc: 'Trace a floor plan, lay out grids and walls, and generate the foundation plan sheet.' },
  { id: AppModule.ELEVATIONS, title: 'Elevation studio', icon: 'elevations', ready: true, hotkey: '2',
    desc: 'Upload a plan (image or PDF), pick the external walls, windows and doors, and get front, rear and side elevations as black-and-white line drawings.' },
  { id: AppModule.MEASUREMENT, title: 'Measurement', icon: 'measure', ready: true, hotkey: '3',
    desc: 'SMM7 bill of quantities and material take-offs from your foundation layout.' },
  { id: AppModule.METHOD_STUDY, title: 'Method study', icon: 'method', ready: true, hotkey: '4',
    desc: 'Build the construction programme with critical path, and keep the site risk register.' },
  { id: AppModule.PHYSICS, title: 'Building physics', icon: 'physics', ready: true, hotkey: '5',
    desc: 'U-values and heat loss, one-way slab load take-down, and embodied carbon.' },
];

export const Dashboard: React.FC<DashboardProps> = ({ onSelectModule }) => {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      const m = MODULES.find(x => x.hotkey === e.key);
      if (m) onSelectModule(m.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelectModule]);

  return (
    <Screen crumb="Dashboard">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: '#e6e9ed' }}>Workspace</h1>
          <p className="mt-1 text-xs" style={{ color: UI.dim }}>Choose a studio. Press the number shown on a tile to open it.</p>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {MODULES.map(m => (
              <button key={m.id} onClick={() => onSelectModule(m.id)}
                style={{ background: UI.panel, borderColor: UI.rule }}
                className="group text-left border rounded-[3px] p-4 flex flex-col gap-3 hover:border-[#4aa3ff] focus-visible:outline outline-2 outline-offset-2 outline-[#4aa3ff]">
                <div className="flex items-center justify-between">
                  <span style={{ color: m.ready ? UI.accent : UI.dim }}><Icon n={m.icon} s={22} /></span>
                  <span className="flex items-center gap-2">
                    {!m.ready && <Tag>Soon</Tag>}
                    <span className="text-[10px] px-1.5 py-0.5 border rounded-[3px]" style={{ borderColor: UI.rule, color: UI.dim, fontFamily: MONO }}>{m.hotkey}</span>
                  </span>
                </div>
                <div>
                  <div className="font-semibold" style={{ color: '#e6e9ed' }}>{m.title}</div>
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: UI.dim }}>{m.desc}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-10 text-[10px] uppercase tracking-widest" style={{ color: UI.dim, fontFamily: MONO }}>
            ArchPro · SMM7 engine
          </div>
        </div>
      </main>
    </Screen>
  );
};
