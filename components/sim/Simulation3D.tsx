// components/sim/Simulation3D.tsx — "mini PlayCanvas" editor for the plan: a live 3D model of the drawing with
// hierarchy, inspector, roof / material / sun controls and glTF export.

import React, { useMemo, useState } from 'react';
import { SimView } from './SimView';
import { buildModel } from '../../utils/sim/build';
import { buildGLB } from '../../utils/sim/gltf';
import { DEFAULT_COLORS, DEFAULT_SIM, MatKey, PlanEl, SimPart, SimSettings } from '../../utils/sim/types';
import { ArchElement, ProjectState } from '../../types';

const C = { bg: 'var(--ui-bg)', panel: 'var(--ui-panel)', rule: 'var(--ui-rule)', text: 'var(--ui-text)', dim: 'var(--ui-dim)', accent: 'var(--ui-accent)', raised: 'var(--ui-raised)', warn: 'var(--ui-warn)', danger: 'var(--ui-danger)' };
const MONO = 'Nunito, "Segoe UI", system-ui, sans-serif';

const ICON: Record<string, string> = {
  select: 'M5 3l14 8-6 2-2 6z',
  fly: 'M3 12l18-8-8 18-2-8z',
  wire: 'M12 3l9 5v8l-9 5-9-5V8zM12 3v18M3 8l9 5 9-5',
  shadow: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18',
  grid: 'M4 8h16M4 16h16M8 4v16M16 4v16',
  roof: 'M3 12l9-8 9 8M6 11v8h12v-8',
  home: 'M4 11l8-7 8 7M6 10v10h12V10',
  export: 'M12 4v12m0 0l-4-4m4 4l4-4M4 20h16',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
};
const Ico = ({ n, s = 18 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[n]} /></svg>
);
const RailBtn: React.FC<{ on?: boolean; title: string; onClick: () => void; children: React.ReactNode }> = ({ on, title, onClick, children }) => (
  <button title={title} onClick={onClick} style={{ background: on ? C.accent : 'transparent', color: on ? 'var(--ui-accentInk)' : C.text }}
    className="w-9 h-9 grid place-items-center rounded-[var(--ui-r)] hover:brightness-125 focus-visible:outline outline-2 outline-offset-1">{children}</button>
);
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="px-3 py-2.5"><div className="text-xs font-semibold mb-1.5">{title}</div>{children}</div>
);
const Num: React.FC<{ label: string; value: number; onChange: (n: number) => void; step?: number; min?: number }> = ({ label, value, onChange, step = 1, min }) => (
  <label className="flex items-center justify-between gap-2 py-1 text-xs" style={{ color: C.dim }}>
    {label}
    <input type="number" value={Number.isFinite(value) ? value : 0} step={step} min={min} onChange={e => onChange(Number(e.target.value))}
      style={{ background: C.bg, color: C.text, fontFamily: MONO }} className="w-20 px-1.5 py-1 rounded-[var(--ui-r)] text-right" />
  </label>
);
const Check: React.FC<{ label: string; on: boolean; onChange: (v: boolean) => void }> = ({ label, on, onChange }) => (
  <label className="flex items-center gap-2 py-1 text-xs cursor-pointer"><input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />{label}</label>
);
const Slider: React.FC<{ label: string; value: number; min: number; max: number; onChange: (n: number) => void; unit?: string }> = ({ label, value, min, max, onChange, unit = '' }) => (
  <label className="block py-1 text-xs" style={{ color: C.dim }}>
    <span className="flex justify-between"><span>{label}</span><span style={{ fontFamily: MONO, color: C.text }}>{Math.round(value)}{unit}</span></span>
    <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full" />
  </label>
);
const btn = 'px-3 py-1.5 text-xs  rounded-[var(--ui-r)] hover:bg-[var(--ui-hover)]';

const MAT_LABEL: Record<MatKey, string> = { wall: 'Walls', slab: 'Floor slabs', roof: 'Roof', door: 'Doors', frame: 'Frames', glass: 'Glass', plinth: 'Plinth', column: 'Columns', ground: 'Ground' };
const KIND_LABEL: Record<string, string> = { wall: 'Walls', door: 'Doors', window: 'Windows', slab: 'Slabs', roof: 'Roof', column: 'Columns' };

export interface Simulation3DProps {
  project: ProjectState;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** change the project (recorded in the studio's undo history) */
  onChange: (fn: (p: ProjectState) => ProjectState) => void;
}

const Simulation3D: React.FC<Simulation3DProps> = ({ project, selectedId, onSelect, onChange }) => {
  const [colors, setColors] = useState<Record<MatKey, string>>(DEFAULT_COLORS);
  const [wireframe, setWireframe] = useState(false);
  const [shadows, setShadows] = useState(true);
  const [grid, setGrid] = useState(true);
  const [showRoof, setShowRoof] = useState(true);
  const [fly, setFly] = useState(false);
  const [hiddenLevels, setHiddenLevels] = useState<number[]>([]);
  const [sunAz, setSunAz] = useState(140);
  const [sunEl, setSunEl] = useState(48);
  const [ambient, setAmbient] = useState(0.42);
  const [frameKey, setFrameKey] = useState(0);
  const [partId, setPartId] = useState<string | null>(null);
  const [extra, setExtra] = useState({ slabMm: DEFAULT_SIM.slabMm, doorHeightMm: DEFAULT_SIM.doorHeightMm, windowSillMm: DEFAULT_SIM.windowSillMm, windowHeightMm: DEFAULT_SIM.windowHeightMm, ridge: 'auto' as SimSettings['roof']['ridge'], shedHigh: 'north' as SimSettings['roof']['shedHigh'] });
  const [targetM, setTargetM] = useState('');

  const mmPerUnit = project.settings.mmPerUnit ?? 1;
  const roofSpec = project.specs.roof;
  const els = project.elements as unknown as PlanEl[];

  const cfg: Partial<SimSettings> = useMemo(() => ({
    mmPerUnit, wallThicknessMm: project.settings.wallWidth, floors: project.specs.floors, floorHeightMm: project.specs.floorHeight,
    plinthMm: project.specs.plinthHeight, slabMm: extra.slabMm, doorHeightMm: extra.doorHeightMm, windowSillMm: extra.windowSillMm, windowHeightMm: extra.windowHeightMm,
    roof: { type: roofSpec.type, pitch: roofSpec.pitch, overhangMm: roofSpec.overhang, ridge: extra.ridge, shedHigh: extra.shedHigh },
  }), [mmPerUnit, project.settings.wallWidth, project.specs, roofSpec, extra]);
  const model = useMemo(() => buildModel(els, cfg), [els, cfg]);

  const selPart: SimPart | null = model.parts.find(p => p.id === partId) ?? null;
  const selSource = selectedId;
  const selEl = project.elements.find(e => e.id === selSource) as ArchElement | undefined;

  const patchSpecs = (p: Partial<ProjectState['specs']>) => onChange(pr => ({ ...pr, specs: { ...pr.specs, ...p } }));
  const patchRoof = (p: Partial<ProjectState['specs']['roof']>) => onChange(pr => ({ ...pr, specs: { ...pr.specs, roof: { ...pr.specs.roof, ...p } } }));
  const patchEl = (id: string, p: Partial<ArchElement>) => onChange(pr => ({ ...pr, elements: pr.elements.map(e => (e.id === id ? { ...e, ...p } : e)) }));

  const pick = (part: SimPart | null) => { setPartId(part ? part.id : null); onSelect(part?.sourceId ?? null); };

  // plan extent (drawing units) for the one-field scale helper
  const planExtent = useMemo(() => {
    const pts = els.filter(e => e.type === 'wall' || e.type === 'rect').flatMap(e => [e.x1, e.x2]);
    const ys = els.filter(e => e.type === 'wall' || e.type === 'rect').flatMap(e => [e.y1, e.y2]);
    if (!pts.length) return 0;
    return Math.max(Math.max(...pts) - Math.min(...pts), Math.max(...ys) - Math.min(...ys));
  }, [els]);
  const applyScale = () => {
    const m = parseFloat(targetM);
    if (!(m > 0) || !(planExtent > 0)) return;
    const v = (m * 1000) / planExtent;
    onChange(pr => ({ ...pr, settings: { ...pr.settings, mmPerUnit: v } }));
    setTargetM(''); setFrameKey(k => k + 1);
  };

  const exportGLB = () => {
    const buf = buildGLB(model, colors, 'ArchPro model');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
    a.download = `archpro-model-${new Date().toISOString().slice(0, 10)}.glb`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const groups = useMemo(() => {
    const g = new Map<string, SimPart[]>();
    model.parts.filter(p => p.kind !== 'ground').forEach(p => { const a = g.get(p.kind) ?? []; a.push(p); g.set(p.kind, a); });
    return Array.from(g.entries());
  }, [model]);

  // inspector helpers for the selected opening
  const isOpening = selEl && (selEl.type === 'door' || selEl.type === 'window');
  const openingW = selEl ? Math.round(Math.hypot(selEl.x2 - selEl.x1, selEl.y2 - selEl.y1) * mmPerUnit) : 0;
  const setOpeningW = (mm: number) => {
    if (!selEl || !(mm > 100)) return;
    const mx = (selEl.x1 + selEl.x2) / 2, my = (selEl.y1 + selEl.y2) / 2;
    const L = Math.hypot(selEl.x2 - selEl.x1, selEl.y2 - selEl.y1) || 1;
    const ux = (selEl.x2 - selEl.x1) / L, uy = (selEl.y2 - selEl.y1) / L, half = mm / mmPerUnit / 2;
    patchEl(selEl.id, { x1: mx - ux * half, y1: my - uy * half, x2: mx + ux * half, y2: my + uy * half });
  };
  const defH = selEl?.type === 'door' ? extra.doorHeightMm : extra.windowHeightMm;

  return (
    <div className="flex-1 flex min-h-0">
      {/* ---------------------------------------------- tool rail */}
      <nav style={{ background: C.panel, }} className="w-12 flex flex-col items-center py-2 gap-1 shrink-0">
        <RailBtn title="Orbit (left-drag) · look (right-drag) · pan (middle-drag)" on={!fly} onClick={() => setFly(false)}><Ico n="select" /></RailBtn>
        <RailBtn title="Fly mode: WASD + Q/E to move, right-drag to look" on={fly} onClick={() => setFly(f => !f)}><Ico n="fly" /></RailBtn>
        <div style={{ background: C.rule }} className="w-6 h-px my-1" />
        <RailBtn title="Wireframe" on={wireframe} onClick={() => setWireframe(w => !w)}><Ico n="wire" /></RailBtn>
        <RailBtn title="Shadows" on={shadows} onClick={() => setShadows(s => !s)}><Ico n="shadow" /></RailBtn>
        <RailBtn title="Ground grid" on={grid} onClick={() => setGrid(g => !g)}><Ico n="grid" /></RailBtn>
        <RailBtn title="Show roof" on={showRoof} onClick={() => setShowRoof(r => !r)}><Ico n="roof" /></RailBtn>
        <div style={{ background: C.rule }} className="w-6 h-px my-1" />
        <RailBtn title="Frame the model" onClick={() => setFrameKey(k => k + 1)}><Ico n="home" /></RailBtn>
        <RailBtn title="Export glTF (.glb)" onClick={exportGLB}><Ico n="export" /></RailBtn>
      </nav>

      {/* ---------------------------------------------- viewport */}
      <div className="flex-1 relative min-w-0">
        <SimView model={model} colors={colors} wireframe={wireframe} shadows={shadows} grid={grid} showRoof={showRoof} hiddenLevels={hiddenLevels}
          sunAz={sunAz} sunEl={sunEl} ambient={ambient} fly={fly} selectedPartId={partId} selectedSourceId={selSource} frameKey={frameKey} onPick={pick} />
        <div style={{ background: 'rgba(31,34,39,.9)', fontFamily: MONO }} className="absolute left-3 top-3 px-2.5 py-1.5 rounded-[var(--ui-r)] text-xs pointer-events-none">
          {fly ? 'Fly: WASD move · Q/E down/up · right-drag look · Shift = faster' : 'Left-drag orbit · right-drag look · middle-drag pan · wheel zoom · click to select'}
        </div>
        {model.stats.warnings.length > 0 && (
          <div style={{ background: 'rgba(31,34,39,.92)', color: C.warn }} className="absolute left-3 bottom-3 max-w-md px-2.5 py-1.5 rounded-[var(--ui-r)] text-xs space-y-0.5">
            {model.stats.warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}
        <div style={{ background: 'rgba(31,34,39,.9)', fontFamily: MONO, color: C.dim }} className="absolute right-3 top-3 px-2.5 py-1.5 rounded-[var(--ui-r)] text-xs pointer-events-none">
          {model.stats.tris.toLocaleString()} tris · {model.stats.walls} walls · {model.stats.doors} doors · {model.stats.windows} windows
        </div>
      </div>

      {/* ---------------------------------------------- hierarchy + properties */}
      <aside style={{ background: C.panel, }} className="w-72 overflow-y-auto shrink-0 text-xs">
        <Section title="Scene">
          <div className="max-h-44 overflow-y-auto -mx-1">
            {groups.length === 0 && <div style={{ color: C.dim }} className="px-1">Nothing to show yet. Draw walls or a rectangle in the 2D plan.</div>}
            {groups.map(([kind, list]) => (
              <details key={kind} open={kind === 'door' || kind === 'window'}>
                <summary className="cursor-pointer px-1 py-0.5 hover:bg-[var(--ui-hover)]" style={{ color: C.text }}>{KIND_LABEL[kind] ?? kind} <span style={{ color: C.dim }}>({list.length})</span></summary>
                {list.map(p => (
                  <button key={p.id} onClick={() => pick(p)} className="block w-full text-left pl-5 pr-1 py-0.5 truncate hover:bg-[var(--ui-hover)]"
                    style={{ color: p.id === partId ? C.accent : C.dim, fontFamily: MONO }}>{p.name}</button>
                ))}
              </details>
            ))}
          </div>
        </Section>

        <Section title={selPart ? `Inspector · ${selPart.name}` : 'Inspector'}>
          {!selPart && <div style={{ color: C.dim }}>Click a wall, door, window or roof in the viewport.</div>}
          {selPart && (
            <div style={{ fontFamily: MONO }} className="leading-6">
              <div>Type <span style={{ color: C.dim }}>{selPart.kind}</span></div>
              <div>Level <span style={{ color: C.dim }}>{selPart.level < 0 ? '–' : selPart.level}</span></div>
              <div>Material <span style={{ color: C.dim }}>{selPart.material}</span></div>
            </div>
          )}
          {selEl && selEl.type === 'wall' && <div className="mt-1" style={{ color: C.dim }}>Edit its position in the 2D plan.</div>}
          {isOpening && selEl && (
            <div className="mt-1">
              <Num label="Width (mm)" value={openingW} step={50} onChange={setOpeningW} />
              <Num label="Height (mm)" value={selEl.height ?? defH} step={50} onChange={n => patchEl(selEl.id, { height: Math.max(300, n) })} />
              {selEl.type === 'window' && <Num label="Sill (mm)" value={selEl.sill ?? extra.windowSillMm} step={50} onChange={n => patchEl(selEl.id, { sill: Math.max(0, n) })} />}
              <div className="mt-1.5 flex gap-2">
                <button className={btn} onClick={() => patchEl(selEl.id, { height: undefined, sill: undefined })}>Reset size</button>
                <button className={btn} style={{ color: C.danger }} onClick={() => { onChange(pr => ({ ...pr, elements: pr.elements.filter(e => e.id !== selEl.id) })); onSelect(null); setPartId(null); }}><Ico n="trash" s={13} /></button>
              </div>
            </div>
          )}
        </Section>

        <Section title="Building">
          <Num label="Floors" value={project.specs.floors} min={1} onChange={n => patchSpecs({ floors: Math.max(1, Math.min(8, Math.round(n))) })} />
          <Num label="Floor height (mm)" value={project.specs.floorHeight} step={50} onChange={n => patchSpecs({ floorHeight: Math.max(2200, n) })} />
          <Num label="Plinth (mm)" value={project.specs.plinthHeight} step={50} onChange={n => patchSpecs({ plinthHeight: Math.max(0, n) })} />
          <Num label="Wall thickness (mm)" value={project.settings.wallWidth} step={25} onChange={n => onChange(pr => ({ ...pr, settings: { ...pr.settings, wallWidth: Math.max(75, n) } }))} />
          <Num label="Slab thickness (mm)" value={extra.slabMm} step={25} onChange={n => setExtra(x => ({ ...x, slabMm: Math.max(50, n) }))} />
          {project.specs.floors > 0 && (
            <div className="mt-1">
              {Array.from({ length: project.specs.floors }, (_, i) => (
                <Check key={i} label={`Show level ${i}`} on={!hiddenLevels.includes(i)} onChange={v => setHiddenLevels(h => (v ? h.filter(x => x !== i) : [...h, i]))} />
              ))}
            </div>
          )}
        </Section>

        <Section title="Roof">
          <label className="flex items-center justify-between gap-2 py-1" style={{ color: C.dim }}>Type
            <select value={roofSpec.type} onChange={e => patchRoof({ type: e.target.value as typeof roofSpec.type })} style={{ background: C.bg, color: C.text }} className="w-28 px-1.5 py-1 rounded-[var(--ui-r)]">
              <option value="gable">Gable</option><option value="hip">Hip</option><option value="shed">Mono-pitch</option><option value="flat">Flat</option>
            </select>
          </label>
          {roofSpec.type !== 'flat' && <Num label="Pitch (°)" value={roofSpec.pitch} min={5} onChange={n => patchRoof({ pitch: Math.max(5, Math.min(60, n)) })} />}
          <Num label="Overhang (mm)" value={roofSpec.overhang} step={50} onChange={n => patchRoof({ overhang: Math.max(0, n) })} />
          {(roofSpec.type === 'gable' || roofSpec.type === 'hip') && (
            <label className="flex items-center justify-between gap-2 py-1" style={{ color: C.dim }}>Ridge
              <select value={extra.ridge} onChange={e => setExtra(x => ({ ...x, ridge: e.target.value as typeof x.ridge }))} style={{ background: C.bg, color: C.text }} className="w-28 px-1.5 py-1 rounded-[var(--ui-r)]">
                <option value="auto">Longest side</option><option value="x">Left–right</option><option value="z">Up–down</option>
              </select>
            </label>
          )}
          {roofSpec.type === 'shed' && (
            <label className="flex items-center justify-between gap-2 py-1" style={{ color: C.dim }}>High side
              <select value={extra.shedHigh} onChange={e => setExtra(x => ({ ...x, shedHigh: e.target.value as typeof x.shedHigh }))} style={{ background: C.bg, color: C.text }} className="w-28 px-1.5 py-1 rounded-[var(--ui-r)]">
                <option value="north">Top of plan</option><option value="south">Bottom of plan</option><option value="west">Left of plan</option><option value="east">Right of plan</option>
              </select>
            </label>
          )}
          <div style={{ color: C.dim }} className="mt-1">Pitched roofs are built over the plan’s bounding box.</div>
        </Section>

        <Section title="Doors and windows (defaults, mm)">
          <Num label="Door height" value={extra.doorHeightMm} step={50} onChange={n => setExtra(x => ({ ...x, doorHeightMm: Math.max(1800, n) }))} />
          <Num label="Window sill" value={extra.windowSillMm} step={50} onChange={n => setExtra(x => ({ ...x, windowSillMm: Math.max(0, n) }))} />
          <Num label="Window height" value={extra.windowHeightMm} step={50} onChange={n => setExtra(x => ({ ...x, windowHeightMm: Math.max(300, n) }))} />
        </Section>

        <Section title="Scale">
          <div style={{ color: C.dim }} className="mb-1">1 drawing unit = <span style={{ fontFamily: MONO, color: C.text }}>{mmPerUnit.toFixed(3)}</span> mm{planExtent > 0 && <> · plan {(planExtent * mmPerUnit / 1000).toFixed(1)} m across</>}</div>
          <div className="flex gap-2">
            <input value={targetM} onChange={e => setTargetM(e.target.value)} placeholder="longest side, m" style={{ background: C.bg, color: C.text, fontFamily: MONO }} className="flex-1 min-w-0 px-1.5 py-1 rounded-[var(--ui-r)]" />
            <button className={btn} onClick={applyScale}>Set</button>
          </div>
          <div style={{ color: C.dim }} className="mt-1">Tracing over an uploaded image? Enter the real length of the building’s longest side.</div>
        </Section>

        <Section title="Sun and lighting">
          <Slider label="Sun direction" value={sunAz} min={0} max={360} unit="°" onChange={setSunAz} />
          <Slider label="Sun height" value={sunEl} min={5} max={85} unit="°" onChange={setSunEl} />
          <Slider label="Ambient light" value={ambient * 100} min={5} max={90} onChange={v => setAmbient(v / 100)} />
        </Section>

        <Section title="Materials">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {(Object.keys(MAT_LABEL) as MatKey[]).map(k => (
              <label key={k} className="flex items-center justify-between gap-2" style={{ color: C.dim }}>{MAT_LABEL[k]}
                <input type="color" value={colors[k]} onChange={e => setColors(c => ({ ...c, [k]: e.target.value }))} className="w-7 h-5 p-0 bg-transparent cursor-pointer" />
              </label>
            ))}
          </div>
          <button className={`${btn} mt-2`} onClick={() => setColors(DEFAULT_COLORS)}>Reset colours</button>
        </Section>

        <Section title="Export">
          <button className={`${btn} w-full`} onClick={exportGLB}>Download .glb model</button>
          <div style={{ color: C.dim }} className="mt-1">Opens in PlayCanvas, Blender, three.js and most 3D viewers. Units are metres.</div>
        </Section>
      </aside>
    </div>
  );
};

export default Simulation3D;
