// components/measurement/SetupPanel.tsx — project, levels, footprint and the assumptions behind the take-off.
import React from 'react';
import { BoqState } from './useBoqState';
import { Card, Check, Lbl, NumInput, Select, TextInput } from './fields';
import { UI, tint } from '../ui';
import { Assumptions } from '../../utils/boq/types';

export const SetupPanel: React.FC<{ s: BoqState }> = ({ s }) => {
  const a = s.assumptions, fp = s.model.footprint;
  const set = (p: Partial<Assumptions>) => s.setAssumptions(x => ({ ...x, ...p }));
  const num = (k: keyof Assumptions) => <NumInput value={a[k] as number} onChange={n => set({ [k]: n } as Partial<Assumptions>)} />;
  const kg = (k: keyof Assumptions['rebarKgM3']) => <NumInput value={a.rebarKgM3[k]} onChange={n => set({ rebarKgM3: { ...a.rebarKgM3, [k]: n } })} />;
  const setFp = (p: Partial<typeof fp>) => s.setModel(m => {
    const next = { ...m.footprint, ...p, source: 'manual' as const };
    const wasRect = Math.abs(m.footprint.areaM2 - m.footprint.lengthM * m.footprint.widthM) < 0.01 * Math.max(1, m.footprint.areaM2);
    if (wasRect && ('lengthM' in p || 'widthM' in p) && !('areaM2' in p)) next.areaM2 = next.lengthM * next.widthM;
    return { ...m, footprint: next };
  });
  const g = s.built.geo;

  return (
    <div className="max-w-5xl mx-auto grid gap-3">
      <Card title="Project">
        <Lbl label="Project name"><TextInput value={a.projectName} onChange={v => set({ projectName: v })} /></Lbl>
        <Lbl label="Location"><TextInput value={a.location} onChange={v => set({ location: v })} /></Lbl>
        <Lbl label="Currency code"><TextInput value={a.currency} onChange={v => set({ currency: v })} /></Lbl>
      </Card>
      <Card title="Building and footprint" note="Footprint is the centre-line of the external walls. For a rectangular plan the area is length x width; type a smaller area for L or U shapes.">
        <Lbl label="Storeys">{num('floors')}</Lbl>
        <Lbl label="Floor to floor" unit="mm">{num('floorHeight')}</Lbl>
        <Lbl label="Plinth (ground to floor level)" unit="mm">{num('plinthHeight')}</Lbl>
        <Lbl label="Footprint length" unit="m"><NumInput value={fp.lengthM} onChange={n => setFp({ lengthM: n })} /></Lbl>
        <Lbl label="Footprint width" unit="m"><NumInput value={fp.widthM} onChange={n => setFp({ widthM: n })} /></Lbl>
        <Lbl label="Footprint area" unit="m2" hint={`source: ${fp.source}`}><NumInput value={Math.round(fp.areaM2 * 100) / 100} onChange={n => setFp({ areaM2: n })} /></Lbl>
        <div className="col-span-2 text-[11px] grid grid-cols-4 gap-2" style={{ color: UI.dim }}>
          <span>Gross floor area<br /><b style={{ color: UI.text }}>{g.gfaM2.toFixed(1)} m2</b></span>
          <span>Net floor / storey<br /><b style={{ color: UI.text }}>{g.aNetM2.toFixed(1)} m2</b></span>
          <span>External girth<br /><b style={{ color: UI.text }}>{g.pExtM.toFixed(1)} m</b></span>
          <span>Trench length<br /><b style={{ color: UI.text }}>{g.trenchLenM.toFixed(1)} m</b></span>
        </div>
      </Card>
      <Card title="Substructure" note="Depth is from existing ground level to the underside of the footing. The trench is dug to the footing width.">
        <Lbl label="Foundation depth" unit="mm">{num('foundationDepth')}</Lbl>
        <Lbl label="Trench / strip footing width" unit="mm">{num('trenchWidth')}</Lbl>
        <Lbl label="Footing thickness" unit="mm">{num('footingThickness')}</Lbl>
        <Lbl label="Footing concrete grade"><TextInput value={a.footingGrade} onChange={v => set({ footingGrade: v })} /></Lbl>
        <Lbl label="Blinding under strip (0 = none)" unit="mm">{num('footingBlinding')}</Lbl>
        <Lbl label="Topsoil strip (0 = none)" unit="mm">{num('topsoilStrip')}</Lbl>
        <Lbl label="Strip margin beyond building" unit="mm">{num('stripMargin')}</Lbl>
        <Lbl label="Measure support when deeper than" unit="m" hint="SMM7 allows 0.25 m; common practice is deeper trenches only">{num('supportThresholdM')}</Lbl>
        <Lbl label="Hardcore thickness" unit="mm">{num('hardcoreThk')}</Lbl>
        <Lbl label="Sand blinding (0 = none)" unit="mm">{num('sandBlindingThk')}</Lbl>
        <Lbl label="Ground slab thickness" unit="mm">{num('slabThk')}</Lbl>
        <Lbl label="Slab concrete grade"><TextInput value={a.slabGrade} onChange={v => set({ slabGrade: v })} /></Lbl>
        <div className="col-span-2"><Check checked={a.antiTermite} onChange={v => set({ antiTermite: v })} label="Anti-termite treatment" /></div>
      </Card>
      <Card title="Walling and structure">
        <Lbl label="Block specification"><TextInput value={a.blockSpec} onChange={v => set({ blockSpec: v })} /></Lbl>
        <Lbl label="Mortar"><TextInput value={a.mortar} onChange={v => set({ mortar: v })} /></Lbl>
        <Lbl label="Do not deduct openings up to" unit="m2">{num('openingDeductM2')}</Lbl>
        <Lbl label="Structural concrete grade"><TextInput value={a.structGrade} onChange={v => set({ structGrade: v })} /></Lbl>
        <Lbl label="Lintel depth" unit="mm">{num('lintelDepth')}</Lbl>
        <Lbl label="Lintel bearing each end" unit="mm">{num('lintelBearing')}</Lbl>
        <Check checked={a.ringBeam} onChange={v => set({ ringBeam: v })} label="Ring beam at eaves" />
        <Lbl label="Ring beam depth" unit="mm">{num('ringBeamDepth')}</Lbl>
        <Lbl label="Suspended slab thickness" unit="mm">{num('suspendedSlabThk')}</Lbl>
        <Check checked={a.columnPad} onChange={v => set({ columnPad: v })} label="Pad footing under each column" />
        <Lbl label="Pad size (square)" unit="mm">{num('padSize')}</Lbl>
        <Lbl label="Pad thickness" unit="mm">{num('padThk')}</Lbl>
      </Card>
      <Card title="Reinforcement (approximate)" note="Bar quantities are assumed per m3 of concrete until you take them from the bar schedule. They appear in the bill as approximate.">
        <Lbl label="Pads" unit="kg/m3">{kg('pad')}</Lbl><Lbl label="Columns" unit="kg/m3">{kg('column')}</Lbl>
        <Lbl label="Lintels" unit="kg/m3">{kg('lintel')}</Lbl><Lbl label="Ring beam" unit="kg/m3">{kg('ringBeam')}</Lbl>
        <Lbl label="Suspended slabs" unit="kg/m3">{kg('slab')}</Lbl>
      </Card>
      <Card title="Roof">
        <Lbl label="Roof type"><Select value={a.roofType} onChange={v => set({ roofType: v as Assumptions['roofType'] })} options={[['gable', 'Gable'], ['hip', 'Hip'], ['shed', 'Mono-pitch'], ['flat', 'Flat (concrete)']]} /></Lbl>
        <Lbl label="Covering"><Select value={a.roofCovering} onChange={v => set({ roofCovering: v as Assumptions['roofCovering'] })} options={[['aluminium_sheet', 'Aluminium long-span sheet'], ['concrete_tile', 'Concrete tiles']]} /></Lbl>
        <Lbl label="Pitch" unit="deg">{num('roofPitch')}</Lbl>
        <Lbl label="Overhang" unit="mm">{num('overhang')}</Lbl>
        <Lbl label="Truss spacing" unit="mm">{num('trussSpacing')}</Lbl>
        <Lbl label="Purlin spacing" unit="mm">{num('purlinSpacing')}</Lbl>
        <Lbl label="Parapet height (flat roof)" unit="mm">{num('parapet')}</Lbl>
      </Card>
      <Card title="Finishes">
        <Lbl label="Ceiling"><Select value={a.ceiling} onChange={v => set({ ceiling: v as Assumptions['ceiling'] })} options={[['pvc', 'PVC panels'], ['plasterboard', 'Plasterboard'], ['none', 'None']]} /></Lbl>
        <Lbl label="Floor finish"><Select value={a.floorFinish} onChange={v => set({ floorFinish: v as Assumptions['floorFinish'] })} options={[['ceramic_tile', 'Screed and ceramic tiles'], ['screed_only', 'Screed only'], ['none', 'None (bare slab)']]} /></Lbl>
        <Lbl label="Internal render" unit="mm">{num('internalRenderThk')}</Lbl>
        <Lbl label="External render" unit="mm">{num('externalRenderThk')}</Lbl>
        <Lbl label="Skirting height" unit="mm">{num('skirtingHeight')}</Lbl>
        <Lbl label="Wall tiling to wet areas" unit="m2" hint="Not in the plan data: enter from the room schedule">{num('wetWallTilingM2')}</Lbl>
        <Lbl label="Staircases (0 = storeys - 1)" unit="nr">{num('stairCount')}</Lbl>
      </Card>
    </div>
  );
};
