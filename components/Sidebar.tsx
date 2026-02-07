// components/Sidebar.tsx
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
  // NEW PROP
  onGoHome: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  step, setStep, project, setProject, currentTool, setCurrentTool,
  onGenerate, onAutoDetect, isAnalyzing, onUndo, onRedo, canUndo, canRedo, onGoHome
}) => {
  return (
    <aside className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col h-full shadow-xl z-20">
      {/* NEW HEADER WITH HOME BUTTON */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800">
        <div className="flex items-center gap-2">
           <button onClick={onGoHome} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Back to Dashboard">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
           </button>
           <h1 className="font-bold text-white tracking-wide">Drawings</h1>
        </div>
        <div className="flex gap-1">
          <button onClick={onUndo} disabled={!canUndo} className="p-2 text-slate-400 hover:text-white disabled:opacity-30"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
          <button onClick={onRedo} disabled={!canRedo} className="p-2 text-slate-400 hover:text-white disabled:opacity-30"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {step === AppStep.UPLOAD && (
          <div className="space-y-4">
             <div className="p-4 bg-slate-700/50 rounded-lg border border-slate-600 border-dashed text-center">
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
                  <span className="block text-4xl mb-2">📂</span>
                  <span className="text-sm text-slate-300 font-medium">Upload Floor Plan</span>
                  <span className="block text-xs text-slate-500 mt-1">PNG, JPG support</span>
                </label>
             </div>
             <p className="text-xs text-slate-500 text-center">or start blank (coming soon)</p>
          </div>
        )}

        {/* ... (Keep the rest of the Sidebar logic for tools, grid mapping etc. exactly as it was) ... */}
        {/* I am omitting the middle section for brevity, but you should paste the original Sidebar content here 
            and just ensure the 'onGoHome' prop is added to the interface and header. */}
        
        {step === AppStep.GENERATION && (
           <div className="p-4 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
             <h3 className="text-emerald-400 font-bold mb-2">Success!</h3>
             <p className="text-xs text-slate-300 mb-3">Foundation plan generated.</p>
             <button onClick={() => setStep(AppStep.GRID_MAPPING)} className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white">Create New</button>
           </div>
        )}
      </div>

      {step !== AppStep.UPLOAD && step !== AppStep.GENERATION && (
        <div className="p-4 border-t border-slate-700 bg-slate-800">
           {step === AppStep.GRID_MAPPING && (
             <Button variant="primary" onClick={() => setStep(AppStep.COLUMN_SELECTION)} className="w-full">Next: Columns</Button>
           )}
           {step === AppStep.COLUMN_SELECTION && (
             <Button variant="accent" onClick={onGenerate} className="w-full">Generate Foundation</Button>
           )}
        </div>
      )}
    </aside>
  );
};
