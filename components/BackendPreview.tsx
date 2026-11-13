import React, { useState } from 'react';
import { BACKEND_SPECS } from '../constants';
import { Icon, UI, MONO, btnGhost, btnPrimary } from './ui';

interface BackendPreviewProps {
  onClose: () => void;
}

export const BackendPreview: React.FC<BackendPreviewProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try { await navigator.clipboard.writeText(BACKEND_SPECS[activeTab].code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  return (
    <div className="absolute inset-0 z-50 grid place-items-center p-8" style={{ background: 'rgba(10,11,13,.8)' }}>
      <div style={{ background: UI.panel, borderColor: UI.rule, color: UI.text }} className="w-full max-w-5xl h-[85vh] border rounded-[3px] flex flex-col">
        <header style={{ borderColor: UI.rule }} className="h-11 px-3 flex items-center gap-3 border-b shrink-0">
          <span className="font-semibold">Backend specification</span>
          <span style={{ color: UI.dim }} className="text-xs">Python cloud function &amp; Firestore schema for this project</span>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1 hover:text-white" title="Close"><Icon n="close" s={16} /></button>
        </header>

        <div style={{ borderColor: UI.rule }} className="flex border-b shrink-0">
          {BACKEND_SPECS.map((spec, i) => (
            <button key={i} onClick={() => setActiveTab(i)}
              className={`px-4 py-2 text-xs border-r ${activeTab === i ? 'bg-[#4aa3ff] text-[#06121f] font-medium' : 'hover:bg-white/5'}`}
              style={{ borderColor: UI.rule, fontFamily: MONO }}>{spec.fileName}</button>
          ))}
        </div>

        <div style={{ borderColor: UI.rule, color: UI.dim }} className="px-3 py-2 text-xs border-b shrink-0">{BACKEND_SPECS[activeTab].description}</div>
        <div className="flex-1 overflow-auto p-4" style={{ background: UI.bg }}>
          <pre className="text-xs leading-relaxed whitespace-pre" style={{ fontFamily: MONO }}><code>{BACKEND_SPECS[activeTab].code}</code></pre>
        </div>

        <footer style={{ borderColor: UI.rule }} className="p-3 border-t flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className={btnGhost}>Close</button>
          <button onClick={copy} className={btnPrimary}>{copied ? 'Copied' : 'Copy code'}</button>
        </footer>
      </div>
    </div>
  );
};
