// components/sim/LiveView.tsx
// A compact 3D viewport that sits beside the 2D plan and rebuilds from the plan as you draw. Selecting a wall, door or
// window in 2D highlights it here, and clicking a part here selects it in 2D. Roof type and pitch can be changed in place.
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { SimView } from './SimView';
import { buildModel } from '../../utils/sim/build';
import { DEFAULT_COLORS, PlanEl, SimSettings } from '../../utils/sim/types';
import { ProjectState } from '../../types';
import { UI, MONO } from '../ui';

interface Props {
  project: ProjectState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (fn: (p: ProjectState) => ProjectState) => void;
}

const sel = 'bg-[var(--ui-bg)] border border-[var(--ui-rule)] rounded-[var(--ui-r)] px-1.5 py-1 text-xs font-mono text-[var(--ui-text)]';

const LiveView: React.FC<Props> = ({ project, selectedId, onSelect, onChange }) => {
  const live = useDeferredValue(project);               // keeps 2D drawing responsive while the 3D model catches up
  const [showRoof, setShowRoof] = useState(true);
  const [frameKey, setFrameKey] = useState(0);
  const roof = live.specs.roof;

  const cfg: Partial<SimSettings> = useMemo(() => ({
    mmPerUnit: live.settings.mmPerUnit ?? 1, wallThicknessMm: live.settings.wallWidth, floors: live.specs.floors,
    floorHeightMm: live.specs.floorHeight, plinthMm: live.specs.plinthHeight,
    roof: { type: roof.type, pitch: roof.pitch, overhangMm: roof.overhang, ridge: 'auto', shedHigh: 'north' },
  }), [live.settings.mmPerUnit, live.settings.wallWidth, live.specs, roof]);
  const model = useMemo(() => buildModel(live.elements as unknown as PlanEl[], cfg), [live.elements, cfg]);

  const patchRoof = (p: Partial<ProjectState['specs']['roof']>) => onChange(pr => ({ ...pr, specs: { ...pr.specs, roof: { ...pr.specs.roof, ...p } } }));
  const warn = model.stats.warnings.filter(w => !/^Draw walls/.test(w));
  const empty = model.stats.walls === 0;
  const seen = useRef(false);
  useEffect(() => { if (!seen.current && !empty) { seen.current = true; setFrameKey(k => k + 1); } }, [empty]);

  return (
    <div className="absolute inset-0">
      <SimView model={model} colors={DEFAULT_COLORS} wireframe={false} shadows grid showRoof={showRoof} hiddenLevels={[]}
        sunAz={140} sunEl={48} ambient={0.42} fly={false} selectedPartId={null} selectedSourceId={selectedId} frameKey={frameKey}
        onPick={part => onSelect(part?.sourceId ?? null)} />
      <div style={{ background: 'rgba(31,34,39,.94)', borderColor: UI.rule, fontFamily: MONO }} className="absolute left-2 top-2 flex flex-wrap items-center gap-2 px-2 py-1.5 border rounded-[var(--ui-r)] text-xs">
        <select className={sel} value={roof.type} onChange={e => patchRoof({ type: e.target.value as typeof roof.type })} title="Roof type">
          <option value="hip">Hip</option><option value="gable">Gable</option><option value="shed">Mono-pitch</option><option value="flat">Flat</option>
        </select>
        {roof.type !== 'flat' && (
          <label className="flex items-center gap-1" style={{ color: UI.dim }}>Pitch
            <input type="number" min={5} max={60} value={roof.pitch} className={sel + ' w-14 text-right'} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) patchRoof({ pitch: Math.max(5, Math.min(60, n)) }); }} />°
          </label>
        )}
        <label className="flex items-center gap-1 cursor-pointer" style={{ color: UI.dim }}><input type="checkbox" checked={showRoof} onChange={e => setShowRoof(e.target.checked)} />Roof</label>
        <button className="px-2 py-1 border rounded-[var(--ui-r)] hover:bg-[var(--ui-hover)]" style={{ borderColor: UI.rule }} onClick={() => setFrameKey(k => k + 1)} title="Re-centre the camera on the model">Fit</button>
      </div>
      {empty && <div className="absolute inset-0 grid place-items-center pointer-events-none text-xs" style={{ color: UI.dim, fontFamily: MONO }}>Draw walls in the plan and the model appears here.</div>}
      {warn.length > 0 && <div style={{ background: 'rgba(31,34,39,.92)', borderColor: UI.warn, color: UI.warn }} className="absolute left-2 bottom-2 right-2 px-2.5 py-1.5 border rounded-[var(--ui-r)] text-[11px] space-y-0.5">{warn.map((w, i) => <div key={i}>{w}</div>)}</div>}
      <div style={{ color: UI.dim, fontFamily: MONO }} className="absolute right-2 top-2 text-[10px] pointer-events-none">Drag orbit · wheel zoom · middle-drag pan</div>
    </div>
  );
};

export default LiveView;
