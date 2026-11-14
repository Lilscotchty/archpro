// components/PhysicsLab.tsx — Building physics: U-value / heat loss, load take-down, embodied carbon.
import React, { useMemo, useState } from 'react';
import {
  CARBON_DEFAULTS, CarbonRow, Layer, LoadCode, PARTIAL, SURFACE_R, Surface, THERMAL_PRESETS, carbonTotal, loadTakedown, thermal,
} from '../utils/physicsEngine';
import { Empty, Field, Icon, Panel, Rail, Screen, Section, Segmented, Stat, StatusBar, UI, MONO, boxCls, btnGhost, inputCls, tdCls, thCls } from './ui';

type Tab = 'thermal' | 'loads' | 'carbon';
const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const f2 = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '–');

export const PhysicsLab: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>('thermal');

  // thermal
  const [surface, setSurface] = useState<Surface>('wall');
  const [layers, setLayers] = useState<Layer[]>(THERMAL_PRESETS[0].layers);
  const [area, setArea] = useState(100);
  const [dT, setDT] = useState(10);
  const th = useMemo(() => thermal(layers, surface, area, dT), [layers, surface, area, dT]);
  const patchLayer = (i: number, p: Partial<Layer>) => setLayers(ls => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));

  // loads
  const [ld, setLd] = useState({ spanM: 4.5, widthM: 1, slabMm: 150, finishesKpa: 1.5, imposedKpa: 1.5, unitWeight: 25 });
  const [code, setCode] = useState<LoadCode>('EC');
  const lr = useMemo(() => loadTakedown({ ...ld, code }), [ld, code]);

  // carbon
  const [rows, setRows] = useState<CarbonRow[]>(CARBON_DEFAULTS);
  const total = carbonTotal(rows);
  const patchRow = (i: number, p: Partial<CarbonRow>) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const titles: Record<Tab, string> = { thermal: 'Thermal', loads: 'Loads', carbon: 'Carbon' };

  return (
    <Screen crumb={`Building physics / ${titles[tab]}`} onHome={onClose}>
      <div className="flex-1 flex min-h-0">
        <Rail value={tab} onChange={id => setTab(id as Tab)} items={[
          { id: 'thermal', icon: 'thermal', label: 'Thermal – U-value & heat loss' },
          { id: 'loads', icon: 'loads', label: 'Loads – one-way slab / beam' },
          { id: 'carbon', icon: 'carbon', label: 'Embodied carbon' },
        ]} />

        {/* ------------------------------------------------ results */}
        <main className="flex-1 min-w-0 overflow-auto p-6" style={{ background: UI.bg }}>
          {tab === 'thermal' && (
            layers.length === 0 ? <Empty icon="thermal" title="No layers" hint="Add the layers of the wall, roof or floor build-up in the panel." /> : (
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="U-value" value={f2(th.uValue)} unit="W/m²K" tone={surface === 'wall' ? (th.uValue <= 0.35 ? 'ok' : 'warn') : undefined} />
                  <Stat label="Total resistance R" value={f2(th.rTotal)} unit="m²K/W" />
                  <Stat label={`Heat loss (${area} m², ΔT ${dT} K)`} value={Math.round(th.heatLossW).toLocaleString()} unit="W" />
                </div>
                <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] overflow-hidden">
                  <table className="w-full text-xs">
                    <thead style={{ borderColor: UI.rule, color: UI.dim }} className="border-b"><tr>
                      <th className={thCls}>Layer</th><th className={`${thCls} w-24 text-right`}>Thickness</th><th className={`${thCls} w-24 text-right`}>λ W/mK</th><th className={`${thCls} w-24 text-right`}>R m²K/W</th>
                    </tr></thead>
                    <tbody>
                      <tr style={{ borderColor: UI.rule, color: UI.dim }} className="border-b"><td className={tdCls}>External surface (Rse)</td><td /><td /><td className={`${tdCls} text-right`} style={{ fontFamily: MONO }}>{f2(SURFACE_R[surface].rse, 3)}</td></tr>
                      {layers.map((l, i) => (
                        <tr key={i} style={{ borderColor: UI.rule }} className="border-b">
                          <td className={tdCls}>{l.name}</td>
                          <td className={`${tdCls} text-right`} style={{ fontFamily: MONO }}>{l.thicknessMm} mm</td>
                          <td className={`${tdCls} text-right`} style={{ fontFamily: MONO }}>{l.lambda}</td>
                          <td className={`${tdCls} text-right`} style={{ fontFamily: MONO }}>{f2(th.perLayer[i], 3)}</td>
                        </tr>
                      ))}
                      <tr style={{ color: UI.dim }}><td className={tdCls}>Internal surface (Rsi)</td><td /><td /><td className={`${tdCls} text-right`} style={{ fontFamily: MONO }}>{f2(SURFACE_R[surface].rsi, 3)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px]" style={{ color: UI.dim }}>Simple layered calculation (U = 1 / ΣR). Ignores thermal bridges, mortar joints and hollow-block cavities – use the conductivity that matches your actual block.</p>
              </div>
            )
          )}

          {tab === 'loads' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Design UDL (ULS)" value={f2(lr.wKnM)} unit="kN/m" />
                <Stat label="Max bending moment" value={f2(lr.momentKnM)} unit="kNm" />
                <Stat label="Max shear / reaction" value={f2(lr.shearKn)} unit="kN" />
              </div>
              <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] overflow-hidden">
                <table className="w-full text-xs"><tbody>
                  {[
                    ['Self-weight', `${f2(lr.selfWeightKpa)} kN/m²`],
                    ['Permanent action Gk (self-weight + finishes)', `${f2(lr.gk)} kN/m²`],
                    ['Variable action Qk', `${f2(lr.qk)} kN/m²`],
                    [`Design load (${PARTIAL[code].label})`, `${f2(lr.uls)} kN/m²`],
                    ['Service reaction per support (Gk + Qk)', `${f2(lr.serviceKnM)} kN`],
                  ].map(([a, b]) => (
                    <tr key={a} style={{ borderColor: UI.rule }} className="border-b last:border-b-0"><td className={tdCls}>{a}</td><td className={`${tdCls} text-right`} style={{ fontFamily: MONO }}>{b}</td></tr>
                  ))}
                </tbody></table>
              </div>
              <p className="text-[11px]" style={{ color: UI.dim }}>M = wL²/8 and V = wL/2 for a simply supported member. Preliminary sizing only – continuity, deflection, reinforcement and local codes must be checked by a structural engineer.</p>
            </div>
          )}

          {tab === 'carbon' && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Embodied carbon (A1–A3, indicative)" value={Math.round(total).toLocaleString()} unit="kgCO₂e" />
                <Stat label="In tonnes" value={f2(total / 1000)} unit="tCO₂e" />
              </div>
              <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] overflow-hidden">
                <table className="w-full text-xs">
                  <thead style={{ borderColor: UI.rule, color: UI.dim }} className="border-b"><tr>
                    <th className={thCls}>Material</th><th className={`${thCls} w-28 text-right`}>Quantity</th><th className={`${thCls} w-24 text-right`}>Factor</th><th className={`${thCls} w-28 text-right`}>kgCO₂e</th><th className="w-8" />
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ borderColor: UI.rule }} className="border-b last:border-b-0">
                        <td className="px-2 py-1"><input className={inputCls} value={r.name} onChange={e => patchRow(i, { name: e.target.value })} /></td>
                        <td className="px-2 py-1"><div className="flex items-center gap-1"><input type="number" className={`${inputCls} text-right`} value={r.qty} onChange={e => patchRow(i, { qty: num(e.target.value) })} /><span style={{ color: UI.dim }}>{r.unit}</span></div></td>
                        <td className="px-2 py-1"><input type="number" className={`${inputCls} text-right`} value={r.factor} onChange={e => patchRow(i, { factor: num(e.target.value) })} /></td>
                        <td className={`${tdCls} text-right`} style={{ fontFamily: MONO, color: '#e6e9ed' }}>{Math.round(Math.max(0, r.qty) * r.factor).toLocaleString()}</td>
                        <td className="px-1"><button onClick={() => setRows(rs => rs.filter((_, k) => k !== i))} title="Remove" style={{ color: UI.dim }} className="p-1 hover:text-white"><Icon n="trash" s={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <button className={btnGhost} onClick={() => setRows(rs => [...rs, { name: 'New material', qty: 1, unit: 'unit', factor: 1 }])}>Add material</button>
                <button className={btnGhost} onClick={() => setRows(CARBON_DEFAULTS)}>Reset</button>
              </div>
              <p className="text-[11px]" style={{ color: UI.dim }}>Factors are editable placeholders (kgCO₂e per unit). Replace them with values from your EPDs or a recognised database before using the result.</p>
            </div>
          )}
        </main>

        {/* ------------------------------------------------ properties */}
        <Panel>
          {tab === 'thermal' && (
            <>
              <Section title="Build-up">
                <Field label="Preset">
                  <select className={inputCls} defaultValue="" onChange={e => { const p = THERMAL_PRESETS.find(x => x.id === e.target.value); if (p) { setLayers(p.layers.map(l => ({ ...l }))); setSurface(p.surface); } e.target.value = ''; }}>
                    <option value="" disabled>Load a preset…</option>
                    {THERMAL_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
                <Segmented value={surface} onChange={id => setSurface(id as Surface)} options={[{ id: 'wall', label: 'Wall' }, { id: 'roof', label: 'Roof' }, { id: 'floor', label: 'Floor' }]} />
              </Section>
              <Section title="Layers (outside → inside)">
                {layers.map((l, i) => (
                  <div key={i} className={`${boxCls} space-y-1.5`}>
                    <div className="flex gap-1">
                      <input className={inputCls} value={l.name} onChange={e => patchLayer(i, { name: e.target.value })} />
                      <button onClick={() => setLayers(ls => ls.filter((_, k) => k !== i))} title="Remove layer" style={{ color: UI.dim }} className="px-1 hover:text-white"><Icon n="trash" s={14} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="text-[10px]" style={{ color: UI.dim }}>Thickness (mm)<input type="number" className={`${inputCls} mt-0.5`} value={l.thicknessMm} onChange={e => patchLayer(i, { thicknessMm: num(e.target.value) })} /></label>
                      <label className="text-[10px]" style={{ color: UI.dim }}>λ (W/mK)<input type="number" step="0.01" className={`${inputCls} mt-0.5`} value={l.lambda} onChange={e => patchLayer(i, { lambda: num(e.target.value) })} /></label>
                    </div>
                  </div>
                ))}
                <button className={btnGhost} onClick={() => setLayers(ls => [...ls, { name: 'New layer', thicknessMm: 100, lambda: 1 }])}>Add layer</button>
              </Section>
              <Section title="Heat loss">
                <Field label="Area (m²)"><input type="number" className={inputCls} value={area} onChange={e => setArea(num(e.target.value))} /></Field>
                <Field label="Temperature difference ΔT (K)"><input type="number" className={inputCls} value={dT} onChange={e => setDT(num(e.target.value))} /></Field>
              </Section>
            </>
          )}
          {tab === 'loads' && (
            <>
              <Section title="Member">
                <Field label="Span (m)"><input type="number" className={inputCls} value={ld.spanM} onChange={e => setLd({ ...ld, spanM: num(e.target.value) })} /></Field>
                <Field label="Tributary width (m)" hint="1 m = per metre strip of slab"><input type="number" className={inputCls} value={ld.widthM} onChange={e => setLd({ ...ld, widthM: num(e.target.value) })} /></Field>
                <Field label="Slab thickness (mm)"><input type="number" className={inputCls} value={ld.slabMm} onChange={e => setLd({ ...ld, slabMm: num(e.target.value) })} /></Field>
              </Section>
              <Section title="Actions">
                <Field label="Finishes (kN/m²)"><input type="number" className={inputCls} value={ld.finishesKpa} onChange={e => setLd({ ...ld, finishesKpa: num(e.target.value) })} /></Field>
                <Field label="Imposed load (kN/m²)"><input type="number" className={inputCls} value={ld.imposedKpa} onChange={e => setLd({ ...ld, imposedKpa: num(e.target.value) })} /></Field>
                <Field label="Concrete unit weight (kN/m³)"><input type="number" className={inputCls} value={ld.unitWeight} onChange={e => setLd({ ...ld, unitWeight: num(e.target.value) })} /></Field>
              </Section>
              <Section title="Partial factors">
                <Segmented value={code} onChange={id => setCode(id as LoadCode)} options={[{ id: 'EC', label: 'Eurocode' }, { id: 'BS8110', label: 'BS 8110' }]} />
              </Section>
            </>
          )}
          {tab === 'carbon' && (
            <Section title="About this tab">
              <p className="text-xs leading-relaxed" style={{ color: UI.dim }}>Enter material quantities from your bill of quantities and a carbon factor for each. The total updates as you type.</p>
            </Section>
          )}
        </Panel>
      </div>
      <StatusBar left={<span style={{ color: UI.text }}>{titles[tab]}</span>} right={<span>{tab === 'thermal' ? `${layers.length} layers` : tab === 'carbon' ? `${rows.length} materials` : PARTIAL[code].label}</span>} />
    </Screen>
  );
};
