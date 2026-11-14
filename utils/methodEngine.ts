// utils/methodEngine.ts
// Programme scheduling (critical path method) and risk scoring for the Method Study module.

export interface Activity { id: number; name: string; days: number; preds: number[] } // preds = ids of predecessor activities
export interface Scheduled extends Activity { es: number; ef: number; ls: number; lf: number; float: number; critical: boolean }
export interface ScheduleResult { items: Scheduled[]; total: number; error: string | null }

export function schedule(acts: Activity[]): ScheduleResult {
  const byId = new Map(acts.map(a => [a.id, a]));
  const bad = acts.find(a => a.preds.some(p => !byId.has(p) || p === a.id));
  if (bad) return { items: [], total: 0, error: `"${bad.name || 'Activity ' + bad.id}" has an invalid predecessor.` };

  // topological order (Kahn) – also detects loops
  const indeg = new Map(acts.map(a => [a.id, a.preds.length]));
  const succ = new Map<number, number[]>(acts.map(a => [a.id, []]));
  acts.forEach(a => a.preds.forEach(p => succ.get(p)!.push(a.id)));
  const order: number[] = [];
  const q = acts.filter(a => a.preds.length === 0).map(a => a.id);
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    for (const s of succ.get(id)!) { indeg.set(s, indeg.get(s)! - 1); if (indeg.get(s) === 0) q.push(s); }
  }
  if (order.length !== acts.length) return { items: [], total: 0, error: 'The predecessors form a loop – an activity cannot depend on itself through other activities.' };

  const es = new Map<number, number>(), ef = new Map<number, number>();
  for (const id of order) {
    const a = byId.get(id)!;
    const start = a.preds.length ? Math.max(...a.preds.map(p => ef.get(p)!)) : 0;
    es.set(id, start); ef.set(id, start + Math.max(0, a.days));
  }
  const total = acts.length ? Math.max(...acts.map(a => ef.get(a.id)!)) : 0;
  const lf = new Map<number, number>(), ls = new Map<number, number>();
  for (const id of [...order].reverse()) {
    const a = byId.get(id)!;
    const end = succ.get(id)!.length ? Math.min(...succ.get(id)!.map(s => ls.get(s)!)) : total;
    lf.set(id, end); ls.set(id, end - Math.max(0, a.days));
  }
  const items = acts.map(a => {
    const float = ls.get(a.id)! - es.get(a.id)!;
    return { ...a, es: es.get(a.id)!, ef: ef.get(a.id)!, ls: ls.get(a.id)!, lf: lf.get(a.id)!, float, critical: float === 0 };
  });
  return { items, total, error: null };
}

export interface Risk { id: number; hazard: string; likelihood: number; severity: number; control: string }
export type RiskBand = 'Low' | 'Medium' | 'High' | 'Critical';
export const riskScore = (r: Pick<Risk, 'likelihood' | 'severity'>) => r.likelihood * r.severity;
export const riskBand = (score: number): RiskBand => (score >= 17 ? 'Critical' : score >= 10 ? 'High' : score >= 5 ? 'Medium' : 'Low');

export const SAMPLE_ACTIVITIES: Omit<Activity, 'id'>[] = [
  { name: 'Site clearance & setting out', days: 3, preds: [] },
  { name: 'Excavate foundation trenches', days: 5, preds: [1] },
  { name: 'Blinding & foundation concrete', days: 6, preds: [2] },
  { name: 'Blockwork to DPC', days: 7, preds: [3] },
  { name: 'Backfill & compact oversite', days: 4, preds: [4] },
  { name: 'Ground floor slab', days: 5, preds: [5] },
  { name: 'Superstructure walls', days: 14, preds: [6] },
];
export const SAMPLE_RISKS: Omit<Risk, 'id'>[] = [
  { hazard: 'Trench collapse during excavation', likelihood: 3, severity: 5, control: 'Shore or batter sides; no one in trench unsupported; edge protection' },
  { hazard: 'Manual handling of blocks and cement', likelihood: 4, severity: 2, control: 'Mechanical aids, team lifts, rotate tasks' },
  { hazard: 'Falls from height at wall plate level', likelihood: 3, severity: 4, control: 'Scaffold with guard rails and toe boards' },
  { hazard: 'Plant and vehicle movement on site', likelihood: 2, severity: 5, control: 'Banksman, segregated routes, high-visibility clothing' },
];
