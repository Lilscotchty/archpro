// components/measurement/useAutoDrawings.ts
// While the Measurement module is open, the drawings the take-off needs (floor plan, foundation plan, elevations) are
// generated in the background from the Drafting Studio plan and stored under their designated ids. They are listed on the
// Drawings tab, where they can be viewed and downloaded. Switch the toggle off to stop automatic generation.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectState } from '../../types';
import { Assumptions } from '../../utils/boq/types';
import { savePack } from '../../utils/drawings/pack';

const K = 'archpro.autoDrawings';

export function useAutoDrawings(project: ProjectState, a: Assumptions) {
  const [auto, setAutoState] = useState(() => { try { return localStorage.getItem(K) !== 'off'; } catch { return true; } });
  const [running, setRunning] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const run = useCallback(async () => {
    const my = ++seq.current;
    setRunning(true); setError('');
    try { const s = await savePack(project, a); if (my === seq.current) setSkipped(s); }
    catch (e) { if (my === seq.current) setError((e as Error).message); }
    finally { if (my === seq.current) setRunning(false); }
  }, [project, a]);

  // only the fields that change the drawings should trigger regeneration
  const key = JSON.stringify([project.elements, project.settings, a.projectName, a.floors, a.floorHeight, a.plinthHeight, a.roofType, a.roofPitch, a.overhang, a.parapet, a.trenchWidth, a.foundationDepth, a.footingThickness, a.footingGrade, a.columnPad, a.padSize]);
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(run, 1500);
    return () => window.clearTimeout(t);
  }, [auto, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAuto = (v: boolean) => { setAutoState(v); try { localStorage.setItem(K, v ? 'on' : 'off'); } catch { /* blocked */ } };
  return { auto, setAuto, running, skipped, error, regenerate: run };
}
