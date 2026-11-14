// utils/physicsEngine.ts
// Small, pure calculation helpers for the Building Physics module.
// Indicative / preliminary only — results must be checked by the responsible engineer.

export interface Layer { name: string; thicknessMm: number; lambda: number }

export type Surface = 'wall' | 'roof' | 'floor';
/** Surface resistances Rsi / Rse in m²K/W (BS EN ISO 6946 typical values). */
export const SURFACE_R: Record<Surface, { rsi: number; rse: number }> = {
  wall: { rsi: 0.13, rse: 0.04 },
  roof: { rsi: 0.10, rse: 0.04 },
  floor: { rsi: 0.17, rse: 0.04 },
};

export interface ThermalResult { rLayers: number; rTotal: number; uValue: number; heatLossW: number; perLayer: number[] }

export function thermal(layers: Layer[], surface: Surface, areaM2: number, deltaT: number): ThermalResult {
  const perLayer = layers.map(l => (l.lambda > 0 && l.thicknessMm > 0 ? l.thicknessMm / 1000 / l.lambda : 0));
  const rLayers = perLayer.reduce((a, b) => a + b, 0);
  const rTotal = rLayers + SURFACE_R[surface].rsi + SURFACE_R[surface].rse;
  const uValue = 1 / rTotal;
  return { rLayers, rTotal, uValue, heatLossW: uValue * Math.max(0, areaM2) * deltaT, perLayer };
}

export const THERMAL_PRESETS: { id: string; label: string; surface: Surface; layers: Layer[] }[] = [
  { id: 'sandcrete', label: '225 mm sandcrete block wall, rendered', surface: 'wall', layers: [
    { name: 'Cement render', thicknessMm: 15, lambda: 1.0 },
    { name: 'Sandcrete block', thicknessMm: 225, lambda: 0.9 },
    { name: 'Cement render', thicknessMm: 15, lambda: 1.0 },
  ] },
  { id: 'insulated', label: 'Block wall with 50 mm EPS insulation', surface: 'wall', layers: [
    { name: 'Cement render', thicknessMm: 15, lambda: 1.0 },
    { name: 'Concrete block', thicknessMm: 150, lambda: 1.1 },
    { name: 'EPS insulation', thicknessMm: 50, lambda: 0.038 },
    { name: 'Plasterboard', thicknessMm: 12.5, lambda: 0.25 },
  ] },
  { id: 'slab', label: '150 mm concrete roof slab with screed', surface: 'roof', layers: [
    { name: 'Sand-cement screed', thicknessMm: 40, lambda: 1.2 },
    { name: 'Reinforced concrete', thicknessMm: 150, lambda: 2.3 },
    { name: 'Plaster', thicknessMm: 12, lambda: 0.57 },
  ] },
];

// ---- structural load take-down (simply supported, one-way slab strip / beam) ----
export type LoadCode = 'EC' | 'BS8110';
export const PARTIAL: Record<LoadCode, { g: number; q: number; label: string }> = {
  EC: { g: 1.35, q: 1.5, label: 'Eurocode (1.35 G + 1.5 Q)' },
  BS8110: { g: 1.4, q: 1.6, label: 'BS 8110 (1.4 G + 1.6 Q)' },
};

export interface LoadInput { spanM: number; widthM: number; slabMm: number; finishesKpa: number; imposedKpa: number; code: LoadCode; unitWeight: number }
export interface LoadResult { selfWeightKpa: number; gk: number; qk: number; uls: number; wKnM: number; momentKnM: number; shearKn: number; serviceKnM: number }

export function loadTakedown(i: LoadInput): LoadResult {
  const selfWeightKpa = (i.slabMm / 1000) * i.unitWeight;
  const gk = selfWeightKpa + i.finishesKpa;
  const qk = i.imposedKpa;
  const f = PARTIAL[i.code];
  const uls = f.g * gk + f.q * qk;
  const wKnM = uls * i.widthM;
  const momentKnM = (wKnM * i.spanM ** 2) / 8;
  const shearKn = (wKnM * i.spanM) / 2;
  const serviceKnM = ((gk + qk) * i.widthM * i.spanM) / 2; // total service reaction per support
  return { selfWeightKpa, gk, qk, uls, wKnM, momentKnM, shearKn, serviceKnM };
}

// ---- embodied carbon (indicative factors, user editable) ----
export interface CarbonRow { name: string; qty: number; unit: string; factor: number }
export const CARBON_DEFAULTS: CarbonRow[] = [
  { name: 'Concrete C25', qty: 10, unit: 'm³', factor: 300 },
  { name: 'Reinforcement steel', qty: 500, unit: 'kg', factor: 1.5 },
  { name: 'Concrete / sandcrete blockwork', qty: 20, unit: 'm³', factor: 180 },
  { name: 'Structural timber', qty: 2, unit: 'm³', factor: 250 },
];
export const carbonTotal = (rows: CarbonRow[]) => rows.reduce((s, r) => s + Math.max(0, r.qty) * r.factor, 0);
