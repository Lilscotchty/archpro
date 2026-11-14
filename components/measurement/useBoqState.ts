// components/measurement/useBoqState.ts — all editable estimate state, autosaved to this browser.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProjectState } from '../../types';
import { Assumptions, BoqModel, CustomLine, DEFAULT_ASSUMPTIONS, DEFAULT_MARKUPS, LineOverride, Markups, RateLibrary } from '../../utils/boq/types';
import { DEFAULT_RATES } from '../../utils/boq/rates';
import { EMPTY_MODEL, modelFromProject } from '../../utils/boq/model';
import { buildBoq } from '../../utils/boq/takeoff';
import { priceLines, summarize } from '../../utils/boq/pricing';

const KEY = 'archpro.boq.v1';
export interface Saved {
  assumptions: Assumptions; model: BoqModel; rates: RateLibrary; overrides: Record<string, LineOverride>; customs: CustomLine[]; markups: Markups;
}

export const assumptionsFromProject = (p: ProjectState, base: Assumptions): Assumptions => ({
  ...base,
  floors: p.specs.floors, floorHeight: p.specs.floorHeight, plinthHeight: p.specs.plinthHeight,
  foundationDepth: p.settings.foundationDepth, trenchWidth: p.settings.trenchWidth,
  structGrade: p.settings.concreteGrade, slabGrade: p.settings.concreteGrade,
  roofType: p.specs.roof.type, roofPitch: p.specs.roof.pitch || base.roofPitch, overhang: p.specs.roof.overhang ?? base.overhang,
});

const read = (): Saved | null => {
  try { const s = localStorage.getItem(KEY); if (!s) return null; const j = JSON.parse(s) as Saved;
    return { ...j, assumptions: { ...DEFAULT_ASSUMPTIONS, ...j.assumptions, rebarKgM3: { ...DEFAULT_ASSUMPTIONS.rebarKgM3, ...j.assumptions?.rebarKgM3 } },
      rates: { ...DEFAULT_RATES, ...j.rates }, markups: { ...DEFAULT_MARKUPS, ...j.markups }, overrides: j.overrides ?? {}, customs: j.customs ?? [] };
  } catch { return null; }
};

export function useBoqState(project: ProjectState) {
  const initial = useMemo<Saved>(() => {
    const saved = read();
    if (saved) return saved;
    const assumptions = assumptionsFromProject(project, DEFAULT_ASSUMPTIONS);
    const hasPlan = project.elements.some(e => (e.type as string) === 'wall');
    return { assumptions, model: hasPlan ? modelFromProject(project, assumptions) : EMPTY_MODEL, rates: DEFAULT_RATES, overrides: {}, customs: [], markups: DEFAULT_MARKUPS };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [assumptions, setAssumptions] = useState(initial.assumptions);
  const [model, setModel] = useState(initial.model);
  const [rates, setRates] = useState(initial.rates);
  const [overrides, setOverrides] = useState(initial.overrides);
  const [customs, setCustoms] = useState(initial.customs);
  const [markups, setMarkups] = useState(initial.markups);
  const [saveError, setSaveError] = useState(false);

  const timer = useRef<number>();
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify({ assumptions, model, rates, overrides, customs, markups } satisfies Saved)); setSaveError(false); } catch { setSaveError(true); }
    }, 400);
    return () => window.clearTimeout(timer.current);
  }, [assumptions, model, rates, overrides, customs, markups]);

  const built = useMemo(() => buildBoq(model, assumptions), [model, assumptions]);
  const priced = useMemo(() => priceLines(built.lines, rates, overrides, customs), [built, rates, overrides, customs]);
  const summary = useMemo(() => summarize(priced, markups, built.geo.gfaM2), [priced, markups, built]);

  const importFromPlan = useCallback(() => {
    const base = assumptionsFromProject(project, assumptions);
    const fresh = modelFromProject(project, base);
    setAssumptions(base);
    setModel(m => ({ ...fresh, walls: [...fresh.walls, ...m.walls.filter(w => w.source !== 'plan')], openings: [...fresh.openings, ...m.openings.filter(o => o.source !== 'plan')],
      columns: [...fresh.columns, ...m.columns.filter(c => c.source !== 'plan')] }));
  }, [project, assumptions]);

  const snapshot = (): Saved => ({ assumptions, model, rates, overrides, customs, markups });
  const load = (s: Saved) => { setAssumptions({ ...DEFAULT_ASSUMPTIONS, ...s.assumptions }); setModel(s.model); setRates({ ...DEFAULT_RATES, ...s.rates }); setOverrides(s.overrides ?? {}); setCustoms(s.customs ?? []); setMarkups({ ...DEFAULT_MARKUPS, ...s.markups }); };
  const resetAll = () => load({ assumptions: assumptionsFromProject(project, DEFAULT_ASSUMPTIONS), model: EMPTY_MODEL, rates: DEFAULT_RATES, overrides: {}, customs: [], markups: DEFAULT_MARKUPS });

  return { assumptions, setAssumptions, model, setModel, rates, setRates, overrides, setOverrides, customs, setCustoms, markups, setMarkups,
    built, priced, summary, importFromPlan, snapshot, load, resetAll, saveError };
}
export type BoqState = ReturnType<typeof useBoqState>;
