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
}

export const Sidebar: React.FC<SidebarProps> = ({
  step, setStep, project, setProject, currentTool, setCurrentTool,
  onGenerate, onAutoDetect, isAnalyzing, onUndo, onRedo, canUndo, canRedo, onGoHome
}) => {
  return (
    <aside className="w-80 h-full p-4 flex flex-col z-20 relative">
      {/* Static Glass Panel: 
         Uses the .glass-panel class from App.tsx which now has NO hover effects or rainbow borders.
      */}
      <div className="glass-panel w-full h-full rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        
        {/* HEADER */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
             <button onClick={onGoHome} className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-all hover:scale-105" title="Back to Dashboard">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
             </button>
             <h1 className="font-bold text-white tracking-wide text-lg drop-shadow-md">Drawings</h1>
          </div>
          <div className="flex gap-1">
            <button onClick={onUndo} disabled={!canUndo} className="p-2 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded-lg transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
            <button onClick={onRedo} disabled={!canRedo} className="p-2 text-slate-400 hover:text-white disabled:opacity-20 hover:bg-white/10 rounded-lg transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg></button>
          </div>
        </div>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {step === AppStep.UPLOAD && (
            <div className="space-y-4">
               <div className="p-8 bg-white/5 rounded-2xl border border-white/10 border-dashed text-center hover:bg-white/10 transition-colors cursor-pointer group">
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
                  <label htmlFor="planUpload" className="cursor-pointer block">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform text-2xl">📂</div>
                    <span className="text-sm text-white font-bold block mb-1">Upload Floor Plan</span>
                    <span className="text-xs text-slate-400">PNG, JPG supported</span>
                  </label>
               </div>
            </div>
          )}

          {step === AppStep.GRID_MAPPING && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-xs uppercase text-slate-500 font-bold tracking-wider">Grid Tools</h3>
              <div className="space-y-2">
                <Button variant={currentTool === 'v-line' ? 'primary' : 'secondary'} onClick={() => setCurrentTool('v-line')} className="w-full justify-start pl-4 py-3">
                  <span className="mr-3 opacity-50">│</span> Vertical Line
                </Button>
                <Button variant={currentTool === 'h-line' ? 'primary' : 'secondary'} onClick={() => setCurrentTool('h-line')} className="w-full justify-start pl-4 py-3">
                  <span className="mr-3 opacity-50">─</span> Horizontal Line
                </Button>
              </div>
              <div className="pt-4 border-t border-white/10">
                 <Button variant="accent" onClick={onAutoDetect} className="w-full shadow-lg shadow-purple-500/20 border border-purple-500/30 bg-purple-600/80 hover:bg-purple-500">
                   ✨ AI Auto-Detect
                 </Button>
                 {isAnalyzing && <div className="mt-3 h-1 w-full bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-1/2 animate-shimmer"></div></div>}
              </div>
            </div>
          )}

          {step === AppStep.COLUMN_SELECTION && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-xs uppercase text-slate-500 font-bold tracking-wider">Structure</h3>
              <Button variant={currentTool === 'select' ? 'primary' : 'secondary'} onClick={() => setCurrentTool('select')} className="w-full justify-start py-3">
                <span className="mr-3">🖱️</span> Select Columns
              </Button>
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-200 leading-relaxed">
                 Click grid intersections to toggle structural columns.
              </div>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        {step !== AppStep.UPLOAD && step !== AppStep.GENERATION && (
          <div className="p-5 border-t border-white/10 bg-black/20 backdrop-blur-md">
             {step === AppStep.GRID_MAPPING && (
               <Button variant="primary" onClick={() => setStep(AppStep.COLUMN_SELECTION)} className="w-full py-4 text-lg font-bold shadow-xl shadow-blue-500/20">Next: Columns →</Button>
             )}
             {step === AppStep.COLUMN_SELECTION && (
               <Button variant="accent" onClick={onGenerate} className="w-full py-4 text-lg font-bold shadow-xl shadow-emerald-500/20 bg-emerald-600 hover:bg-emerald-500">Generate Foundation</Button>
             )}
          </div>
        )}
      </div>
    </aside>
  );
};
