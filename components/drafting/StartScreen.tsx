// components/drafting/StartScreen.tsx — where a drawing begins: blank sheet, a drawing to trace, a saved plan, or last session.
import React, { useRef, useState } from 'react';
import { UI, MONO } from '../ui';
import { DIcon } from './icons';

interface Props {
  busy: boolean;
  error: string;
  resume: { savedAt: number; walls: number } | null;
  onBlank: () => void;
  onDrawing: (f: File) => void;
  onPlanFile: (f: File) => void;
  onResume: () => void;
}

export const StartScreen: React.FC<Props> = ({ busy, error, resume, onBlank, onDrawing, onPlanFile, onResume }) => {
  const drawRef = useRef<HTMLInputElement>(null);
  const planRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const card = 'border rounded-[3px] p-5 text-left transition-colors';

  const handle = (f?: File | null) => { if (!f) return; if (/\.json$/i.test(f.name)) onPlanFile(f); else onDrawing(f); };

  return (
    <main className="flex-1 grid place-items-center overflow-auto p-6" style={{ background: UI.bg }}>
      <div className="w-full max-w-3xl">
        <h1 className="text-lg font-semibold" style={{ color: '#e6e9ed' }}>Start a plan</h1>
        <p className="mt-1 text-xs" style={{ color: UI.dim }}>Draw on a blank sheet in real millimetres, or trace an existing drawing. Either way, every length you draw is true to scale.</p>

        <div className="mt-5 grid md:grid-cols-2 gap-4">
          <button onClick={onBlank} disabled={busy} style={{ background: UI.panel, borderColor: UI.rule }} className={card + ' hover:border-[#4aa3ff] disabled:opacity-50'}>
            <DIcon n="rect" s={26} /><div className="mt-3 font-semibold">Blank sheet</div>
            <div className="mt-1 text-xs" style={{ color: UI.dim }}>An unlimited model space with a millimetre grid, snaps, and typed dimensions. Nothing to calibrate.</div>
          </button>

          <div
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files?.[0]); }}
            onClick={() => !busy && drawRef.current?.click()} role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') drawRef.current?.click(); }}
            style={{ background: UI.panel, borderColor: over ? UI.accent : UI.rule, borderStyle: 'dashed' }} className={card + ' cursor-pointer hover:border-[#4aa3ff]'}>
            <input ref={drawRef} type="file" accept="image/*,application/pdf,.pdf" className="hidden" onChange={e => { handle(e.target.files?.[0]); e.target.value = ''; }} />
            <DIcon n="upload" s={26} /><div className="mt-3 font-semibold">{busy ? 'Opening drawing…' : 'Trace over a drawing'}</div>
            <div className="mt-1 text-xs" style={{ color: UI.dim }}>Drop or choose a PNG, JPG or PDF. You will set its scale from a known dimension or its printed scale, then draw over it.</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={() => planRef.current?.click()} style={{ borderColor: UI.rule }} className="px-3 py-1.5 text-xs border rounded-[3px] hover:bg-white/5">
            <span className="inline-flex items-center gap-2"><DIcon n="open" s={14} />Open plan file</span>
          </button>
          <input ref={planRef} type="file" accept=".json,application/json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPlanFile(f); e.target.value = ''; }} />
          {resume && (
            <button onClick={onResume} style={{ borderColor: UI.accent, color: UI.accent }} className="px-3 py-1.5 text-xs border rounded-[3px] hover:bg-[#4aa3ff]/10">
              Resume last session ({resume.walls} {resume.walls === 1 ? 'wall' : 'walls'}, {new Date(resume.savedAt).toLocaleString()})
            </button>
          )}
        </div>

        {error && <div className="mt-4 text-xs p-3 border rounded-[3px]" style={{ borderColor: UI.danger + '88', color: UI.danger }}>{error}</div>}
        <div className="mt-8 text-[11px]" style={{ color: UI.dim, fontFamily: MONO }}>Your work autosaves in this browser. Use Save to keep a plan file you can reopen on any machine.</div>
      </div>
    </main>
  );
};
