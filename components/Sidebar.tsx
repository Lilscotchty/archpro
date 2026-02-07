import React from 'react';
import { AppStep, ProjectState } from '../types';
import { Button } from './Button';

interface SidebarProps {
  step: AppStep;
  setStep: (s: AppStep) => void;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  currentTool: any;
  setCurrentTool: (t: any) => void;
  onGenerate: () => void;
  onAutoDetect: () => void;
  isAnalyzing: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onGoHome: () => void;
  // NEW PROP
  onStartBlank: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  step, setStep, project, setProject, currentTool, setCurrentTool,
  onGenerate, onAutoDetect, isAnalyzing, onUndo, onRedo, canUndo, canRedo, onGoHome, onStartBlank
}) => {
  return (
    <aside className="w-80 p-4 z-20 bg-slate-900 border-r border-slate-700 flex flex-col">
      
      {/* HEADER */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
           <button onClick={onGoHome} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors" title="Back to Dashboard">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
           </button>
           <h1 className="font-bold text-xl text-white">Architect Studio</h1>
        </div>
        
        {step !== AppStep.UPLOAD && (
          <div className="flex gap-1">
            <button onClick={onUndo} disabled={!canUndo} className="p-2 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
            <button onClick={onRedo} disabled={!canRedo} className="p-2 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg></button>
          </div>
        )}
      </div>

      {/* --- START SCREEN (The Choice) --- */}
      {step === AppStep.UPLOAD && (
        <div className="space-y-6 animate-fade-in">
           <div className="text-center mb-4">
             <h2 className="text-white font-bold text-lg">New Project</h2>
             <p className="text-xs text-slate-400">Choose how to begin</p>
           </div>

           {/* OPTION 1: UPLOAD */}
           <div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700 border-dashed text-center hover:bg-slate-800 transition-colors cursor-pointer group relative overflow-hidden">
              <input type="file" id="planUpload" className="hidden" accept="image/*" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                     const img = new Image();
                     img.onload = () => {
                       setProject(p => ({ ...p, imageSrc: ev.target?.result as string, imageWidth: img.width, imageHeight: img.height }));
                       setStep(AppStep.GRID_MAPPING);
                     };
                     img.src = ev.target?.result as string;
                  };
                  reader.readAsDataURL(file);
                }
              }} />
              <label htmlFor="planUpload" className="cursor-pointer block relative z-10">
                <div className="w-14 h-14 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform text-2xl text-blue-400">📂</div>
                <span className="text-sm text-white font-bold block mb-1">Upload Plan</span>
                <span className="text-xs text-slate-400">Trace over an existing image</span>
              </label>
           </div>

           <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-700"></div>
              <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase">OR</span>
              <div className="flex-grow border-t border-slate-700"></div>
           </div>

           {/* OPTION 2: DRAW FROM SCRATCH */}
           <button 
             onClick={onStartBlank}
             className="w-full p-6 bg-slate-800/50 rounded-xl border border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800 transition-all cursor-pointer group text-center"
           >
              <div className="w-14 h-14 bg-emerald-600/20 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform text-2xl text-emerald-400">✏️</div>
              <span className="text-sm text-white font-bold block mb-1">Draw from Scratch</span>
              <span className="text-xs text-slate-400">Start with a blank canvas</span>
           </button>
        </div>
      )}

      {/* --- DESIGN TOOLS --- */}
      {step === AppStep.GRID_MAPPING && (
        <div className="space-y-4 animate-slide-right">
          <div className="bg-slate-800 p-3 rounded-lg mb-4">
             <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Step 1: Grid System</h3>
             <p className="text-xs text-slate-500">Lay out your grid lines first. These will act as the skeleton for your walls and columns.</p>
          </div>

          <div className="space-y-2">
             <button onClick={() => setCurrentTool('v-line')} className={`w-full text-left p-3 rounded-lg border border-transparent flex items-center gap-3 ${currentTool === 'v-line' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}>
               <span className="font-mono opacity-50">|</span> Vertical Grid
             </button>
             <button onClick={() => setCurrentTool('h-line')} className={`w-full text-left p-3 rounded-lg border border-transparent flex items-center gap-3 ${currentTool === 'h-line' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-300'}`}>
               <span className="font-mono opacity-50">—</span> Horizontal Grid
             </button>
          </div>

          <div className="pt-4 border-t border-slate-800 mt-4">
            <button onClick={() => setStep(AppStep.PLAN_DESIGN)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold text-white shadow-lg">
              Next: Design Plan →
            </button>
          </div>
        </div>
      )}

      {step === AppStep.PLAN_DESIGN && (
         <div className="flex flex-col h-full animate-slide-right">
           {/* BUILDING SPECS */}
           <div className="bg-slate-800 p-4 rounded-xl mb-6 space-y-3">
             <h3 className="text-xs font-bold text-blue-400 uppercase">Building Specs</h3>
             <div className="flex justify-between items-center">
               <span className="text-sm">Floors</span>
               <div className="flex items-center gap-2">
                 <button onClick={() => setProject(p => ({...p, specs: {...p.specs, floors: Math.max(1, p.specs.floors - 1)}}))} className="bg-slate-700 w-6 h-6 rounded hover:bg-slate-600">-</button>
                 <span className="text-white font-bold">{project.specs.floors}</span>
                 <button onClick={() => setProject(p => ({...p, specs: {...p.specs, floors: p.specs.floors + 1}}))} className="bg-slate-700 w-6 h-6 rounded hover:bg-slate-600">+</button>
               </div>
             </div>
             <div>
               <span className="text-sm block mb-1">Roof Type</span>
               <select 
                 className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white focus:border-blue-500 outline-none"
                 value={project.specs.roof.type}
                 onChange={(e) => setProject(p => ({...p, specs: {...p.specs, roof: {...p.specs.roof, type: e.target.value as any}}}))}
               >
                 <option value="gable">Gable Roof</option>
                 <option value="hip">Hip Roof</option>
                 <option value="flat">Flat Roof</option>
                 <option value="shed">Shed Roof</option>
               </select>
             </div>
           </div>

           {/* TOOLBOX */}
           <div className="space-y-2 mb-auto">
             <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Architectural Tools</h3>
             <button onClick={() => setCurrentTool('wall')} className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all ${currentTool === 'wall' ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-300'}`}>
               <span className="w-4 h-4 bg-white border border-black"></span> Wall (225mm)
             </button>
             <button onClick={() => setCurrentTool('door')} className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all ${currentTool === 'door' ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-300'}`}>
               <span className="w-4 h-4 rounded-t-full border border-white"></span> Door
             </button>
             <button onClick={() => setCurrentTool('window')} className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all ${currentTool === 'window' ? 'bg-blue-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-300'}`}>
               <span className="w-4 h-2 border border-white"></span> Window
             </button>
           </div>

           {/* ACTION */}
           <button onClick={onGenerate} className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold text-white shadow-lg shadow-emerald-900/20 mt-4">
             Auto-Generate Set
           </button>
        </div>
      )}

    </aside>
  );
};
