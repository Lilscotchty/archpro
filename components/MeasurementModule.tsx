// components/MeasurementModule.tsx
import React, { useState } from 'react';
import { ProjectState, BoQItem } from '../types';
import { generateSMM7BoQ } from '../utils/smm7Engine';

interface MeasurementModuleProps {
  project: ProjectState;
  onClose: () => void;
}

export const MeasurementModule: React.FC<MeasurementModuleProps> = ({ project, onClose }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'import'>('manual');
  
  // Local state for manual override
  const [manualLength, setManualLength] = useState(0);
  const [manualDepth, setManualDepth] = useState(project.settings.foundationDepth / 1000); // default from settings
  const [manualWidth, setManualWidth] = useState(project.settings.trenchWidth / 1000);
  
  const [boq, setBoq] = useState<BoQItem[]>([]);

  const handleCalculate = () => {
    // 1. Prepare Settings for Engine
    // We create a temporary settings object because the engine expects mm, 
    // but this UI might manipulate meters.
    const calcSettings = {
      ...project.settings,
      foundationDepth: manualDepth * 1000, 
      trenchWidth: manualWidth * 1000,
      // concreteGrade is taken from global settings
    };

    // 2. Determine Source Data
    const lengthToUse = activeTab === 'manual' ? manualLength : (project.calculatedTrenchLength || 0);

    // 3. Run Engine
    const results = generateSMM7BoQ(lengthToUse, calcSettings);
    setBoq(results);
  };

  const downloadCSV = () => {
    if (boq.length === 0) return;
    const headers = "Code,Description,Quantity,Unit\n";
    const rows = boq.map(item => `${item.code},"${item.description}",${item.quantity},${item.unit}`).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SMM7_TakeOff_${Date.now()}.csv`;
    a.click();
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-200">
      {/* Header */}
      <div className="h-16 border-b border-slate-700 flex items-center justify-between px-6 bg-slate-800 shadow-md z-10">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            <span className="text-sm font-medium">Dashboard</span>
          </button>
          <div className="h-6 w-px bg-slate-600 mx-2"></div>
          <h1 className="text-lg font-bold text-white">Measurement <span className="text-slate-400 font-normal">/ SMM7 Engine</span></h1>
        </div>
        <div className="flex gap-3">
           <button onClick={downloadCSV} disabled={boq.length === 0} className="disabled:opacity-50 disabled:cursor-not-allowed bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded text-sm font-medium transition-colors">
             Export CSV
           </button>
           <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded text-sm font-medium shadow-lg shadow-emerald-900/20">
             Save to Cloud
           </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Inputs */}
        <div className="w-96 border-r border-slate-700 bg-slate-800/50 p-6 flex flex-col gap-6 overflow-y-auto">
          
          <div className="flex p-1 bg-slate-700/50 rounded-lg border border-slate-700">
            <button 
              onClick={() => setActiveTab('manual')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'manual' ? 'bg-slate-600 text-white shadow ring-1 ring-slate-500' : 'text-slate-400 hover:text-white'}`}
            >
              Manual Input
            </button>
            <button 
              onClick={() => setActiveTab('import')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'import' ? 'bg-slate-600 text-white shadow ring-1 ring-slate-500' : 'text-slate-400 hover:text-white'}`}
            >
              Import Layout
            </button>
          </div>

          <div className="space-y-6">
            {activeTab === 'manual' ? (
              <div className="space-y-4 animate-fade-in">
                <div className="group">
                  <label className="text-xs uppercase text-slate-500 font-bold mb-1 block group-focus-within:text-blue-400">Total Trench Length (m)</label>
                  <input type="number" value={manualLength} onChange={e => setManualLength(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded p-2 text-white outline-none transition-colors" placeholder="0.00" />
                </div>
                <div className="group">
                  <label className="text-xs uppercase text-slate-500 font-bold mb-1 block group-focus-within:text-blue-400">Avg. Depth (m)</label>
                  <input type="number" value={manualDepth} onChange={e => setManualDepth(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded p-2 text-white outline-none transition-colors" />
                </div>
                <div className="group">
                  <label className="text-xs uppercase text-slate-500 font-bold mb-1 block group-focus-within:text-blue-400">Trench Width (m)</label>
                  <input type="number" value={manualWidth} onChange={e => setManualWidth(parseFloat(e.target.value))} className="w-full bg-slate-900 border border-slate-700 focus:border-blue-500 rounded p-2 text-white outline-none transition-colors" />
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-fade-in">
                <div className={`p-6 border rounded-xl ${project.calculatedTrenchLength ? 'bg-blue-900/10 border-blue-500/30' : 'bg-red-900/10 border-red-500/30'}`}>
                  <label className="text-xs uppercase text-slate-500 font-bold block mb-2">Project Data Status</label>
                  {project.calculatedTrenchLength ? (
                    <>
                      <div className="text-3xl font-bold text-blue-400 mb-1">{project.calculatedTrenchLength.toFixed(2)} <span className="text-lg text-slate-500">m</span></div>
                      <p className="text-xs text-slate-400">Net length calculated from "Drawings".</p>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-bold text-red-400 mb-1">No Data Found</div>
                      <p className="text-xs text-red-300/70">Go to "Drawings" and generate a foundation plan first.</p>
                    </>
                  )}
                </div>
                
                {project.calculatedTrenchLength && (
                   <div className="p-4 bg-slate-800 rounded border border-slate-700 text-xs text-slate-400 space-y-1">
                      <div className="flex justify-between"><span>Design Depth:</span> <span className="text-slate-200">{project.settings.foundationDepth/1000}m</span></div>
                      <div className="flex justify-between"><span>Design Width:</span> <span className="text-slate-200">{project.settings.trenchWidth/1000}m</span></div>
                      <div className="flex justify-between"><span>Concrete:</span> <span className="text-slate-200">{project.settings.concreteGrade}</span></div>
                   </div>
                )}
              </div>
            )}

            <button 
              onClick={handleCalculate}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-900/20 transition-all transform active:scale-[0.98]"
            >
              Generate Bill of Quantities
            </button>
          </div>
        </div>

        {/* Right Panel: Results */}
        <div className="flex-1 bg-slate-950 p-8 overflow-y-auto">
           {boq.length > 0 ? (
             <div className="max-w-4xl mx-auto animate-slide-up">
               <div className="flex items-center justify-between mb-6">
                 <h2 className="text-2xl font-bold text-white">Bill of Quantities</h2>
                 <span className="text-xs font-mono text-emerald-500 border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 rounded">SMM7 COMPLIANT</span>
               </div>
               
               <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-2xl">
                 <table className="w-full text-left">
                   <thead className="bg-slate-950/50 text-slate-400 uppercase text-xs font-bold border-b border-slate-800">
                     <tr>
                       <th className="px-6 py-4 w-24">Ref</th>
                       <th className="px-6 py-4">Description</th>
                       <th className="px-6 py-4 w-32 text-right">Quantity</th>
                       <th className="px-6 py-4 w-24">Unit</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800">
                     {boq.map((item, idx) => (
                       <tr key={idx} className="hover:bg-slate-800/50 transition-colors group">
                         <td className="px-6 py-4 font-mono text-amber-500 text-sm group-hover:text-amber-400">{item.code}</td>
                         <td className="px-6 py-4 text-slate-300 group-hover:text-slate-200">{item.description}</td>
                         <td className="px-6 py-4 text-right font-bold text-white text-lg">{item.quantity}</td>
                         <td className="px-6 py-4 text-slate-500 text-sm">{item.unit}</td>
                       </tr>
                     ))}
                   </tbody>
                   <tfoot className="bg-slate-950/30 border-t border-slate-800">
                     <tr>
                       <td colSpan={4} className="px-6 py-3 text-right text-xs text-slate-600 italic">
                         Generated automatically by ConstructOS SMM7 Engine
                       </td>
                     </tr>
                   </tfoot>
                 </table>
               </div>
             </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-slate-600">
               <div className="w-24 h-24 mb-6 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
                 <svg className="w-10 h-10 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
               </div>
               <p className="text-lg font-medium text-slate-500">Ready to Calculate</p>
               <p className="text-sm">Enter dimensions or import data to begin.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};
