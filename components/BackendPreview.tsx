import React, { useState } from 'react';
import { BACKEND_SPECS } from '../constants';

interface BackendPreviewProps {
  onClose: () => void;
}

export const BackendPreview: React.FC<BackendPreviewProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-8">
      <div className="bg-slate-800 w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col border border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
           <div>
             <h2 className="text-2xl font-bold text-white">Backend Specification</h2>
             <p className="text-slate-400 text-sm mt-1">
               Python Cloud Function & Firestore Schema generated for this project.
             </p>
           </div>
           <button onClick={onClose} className="text-slate-400 hover:text-white">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 bg-slate-900/50">
          {BACKEND_SPECS.map((spec, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === index 
                ? 'bg-slate-800 text-blue-400 border-t-2 border-blue-400' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              {spec.fileName}
            </button>
          ))}
        </div>

        {/* Code View */}
        <div className="flex-1 overflow-hidden flex flex-col">
           <div className="p-4 bg-slate-900 border-b border-slate-700 text-xs text-slate-400">
              {BACKEND_SPECS[activeTab].description}
           </div>
           <div className="flex-1 overflow-auto bg-[#0d1117] p-6">
             <pre className="font-mono text-sm text-slate-300 leading-relaxed whitespace-pre">
               <code>{BACKEND_SPECS[activeTab].code}</code>
             </pre>
           </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 bg-slate-800 border-t border-slate-700 flex justify-end">
           <button 
             className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
             onClick={() => {
                navigator.clipboard.writeText(BACKEND_SPECS[activeTab].code);
                alert("Code copied to clipboard!");
             }}
           >
             Copy Code
           </button>
        </div>

      </div>
    </div>
  );
};