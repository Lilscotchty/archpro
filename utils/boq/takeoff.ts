// utils/boq/takeoff.ts
// Quantity take-off. Quantities are NET (no waste, bulking or lap allowances), as SMM7 requires.
// Every line carries its workings in `calc` so the figures can be checked and defended.

import { Assumptions, Basis, BoqLine, BoqModel, OpeningRow, WallRow } from './types';
import { blockRateKey } from './rates';

const m = (mm: number) => mm / 1000;
const rnd = (n: number, dp = 2) => { const k = 10 ** dp; return Math.round((n + Number.EPSILON) * k) / k; };
const f = (n: number, dp = 2) => rnd(n, dp).toFixed(dp);
const rad = (deg: number) => (deg * Math.PI) / 180;

export interface Geometry {
  tExtMm: number;
  extLenM: number; intLenM: number;
  aCentreM2: number; aExtM2: number; aNetM2: number; gfaM2: number;
  pExtM: number; pIntM: number;
  trenchLenM: number; trenchDepthM: number;
  longExtM: number; shortExtM: number;   // external-face plan dimensions
  intWallAreaM2: number;
  warnings: string[];
}

export function computeGeometry(model: BoqModel, a: Assumptions): Geometry {
  const warnings: string[] = [];
  const ext = model.walls.filter(w => w.external);
  const int = model.walls.filter(w => !w.external);
  const extLen = ext.reduce((s, w) => s + m(w.lengthMm), 0);
  const tExtMm = extLen > 0 ? ext.reduce((s, w) => s + w.thicknessMm * m(w.lengthMm), 0) / extLen : 225;
  const t = m(tExtMm);
  const aC = model.footprint.areaM2;
  const pC = extLen;
  const intLen = int.reduce((s, w) => s + m(w.lengthMm), 0);
  const intWallArea = int.reduce((s, w) => s + Math.max(0, m(w.lengthMm) - t) * m(w.thicknessMm), 0);
  const aExt = aC + (pC * t) / 2 + t * t;
  const aNet = Math.max(0, aC - (pC * t) / 2 + t * t - intWallArea);
  const trenchW = m(a.trenchWidth);
  const trenchLen = pC + int.reduce((s, w) => s + Math.max(0, m(w.lengthMm) - trenchW), 0);
  const trenchDepth = Math.max(0, m(a.foundationDepth - a.topsoilStrip));
  const L = Math.max(model.footprint.lengthM, model.footprint.widthM) + t;
  const B = Math.min(model.footprint.lengthM, model.footprint.widthM) + t;

  if (ext.length === 0) warnings.push('No external walls: add or import walls, or enter them on the Schedule tab.');
  if (aC <= 0) warnings.push('Footprint area is zero: set the footprint length, width and area on the Setup tab.');
  const rectArea = model.footprint.lengthM * model.footprint.widthM;
  if (aC > 0 && rectArea > 0 && aC > rectArea * 1.02) warnings.push('Footprint area is larger than length x width: check the footprint figures.');
  if (extLen > 0 && aC > 0 && 2 * (model.footprint.lengthM + model.footprint.widthM) > 0
      && Math.abs(extLen - 2 * (model.footprint.lengthM + model.footprint.widthM)) / extLen > 0.35 && aC >= rectArea * 0.98)
    warnings.push('External wall length differs a lot from the footprint perimeter: check which walls are marked external.');

  return {
    tExtMm, extLenM: extLen, intLenM: intLen, aCentreM2: aC, aExtM2: aExt, aNetM2: aNet, gfaM2: aExt * a.floors,
    pExtM: pC + 4 * t, pIntM: Math.max(0, pC - 4 * t), trenchLenM: trenchLen, trenchDepthM: trenchDepth,
    longExtM: L, shortExtM: B, intWallAreaM2: intWallArea, warnings,
  };
}

const unitArea = (o: OpeningRow) => (o.widthMm * o.heightMm) / 1e6;
const deductible = (o: OpeningRow, a: Assumptions) => unitArea(o) > a.openingDeductM2;
const depthBand = (d: number) =>
  d <= 0.25 ? 'maximum depth not exceeding 0.25m'
  : d <= 1 ? 'maximum depth 0.25m to 1.00m'
  : d <= 2 ? 'maximum depth 1.00m to 2.00m'
  : `maximum depth ${Math.floor(d / 2) * 2}.00m to ${Math.floor(d / 2) * 2 + 2}.00m`;
const thickBand = (mm: number) => mm <= 150 ? 'thickness not exceeding 150mm' : mm <= 450 ? 'thickness 150mm to 450mm' : 'thickness exceeding 450mm';

export function buildBoq(model: BoqModel, a: Assumptions): { lines: BoqLine[]; geo: Geometry } {
  const geo = computeGeometry(model, a);
  const lines: BoqLine[] = [];
  const add = (section: string, key: string, description: string, qty: number, unit: string, rateKey: string,
    calc: string, basis: Basis = 'measured', rateMul = 1) => {
    const q = unit === 'nr' ? Math.round(qty) : unit === 't' ? rnd(qty, 3) : rnd(qty, 2);
    if (!(q > 0)) return;
    lines.push({ key, section, description, qty: q, unit, rateKey, rateMul, calc, basis });
  };

  const walls = model.walls;
  const t = m(geo.tExtMm);
  const H = m(a.floorHeight) * a.floors;               // floor to eaves
  const hSub = Math.max(0, m(a.foundationDepth - a.footingThickness + a.plinthHeight));
  const dT = geo.trenchDepthM;
  const wT = m(a.trenchWidth);
  const nCols = model.columns.reduce((s, c) => s + c.qty, 0);
  const pads = a.columnPad ? nCols : 0;
  const pad = m(a.padSize), padT = m(a.padThk);
  const flat = a.roofType === 'flat';
  const allLen = geo.extLenM + geo.intLenM;

  // ---------------------------------------------------------------- D20 earthworks
  const aStrip = geo.aExtM2 + geo.pExtM * m(a.stripMargin) + 4 * m(a.stripMargin) ** 2;
  if (a.topsoilStrip > 0)
    add('D20', 'd20.strip', `Excavating; topsoil for preservation; average depth ${a.topsoilStrip}mm`, aStrip, 'm2', 'd20.strip',
      `(${f(geo.aExtM2)} m2 building + ${f(m(a.stripMargin))} m margin all round) = ${f(aStrip)} m2`);

  const vTrench = geo.trenchLenM * wT * dT;
  add('D20', 'd20.trench', `Excavating trenches; width exceeding 0.30m; ${depthBand(dT)}; starting at reduced level`, vTrench, 'm3', 'd20.excav',
    `${f(geo.trenchLenM)} m trench x ${f(wT)} m x ${f(dT)} m deep`);
  const vPits = pads * pad * pad * dT;
  add('D20', 'd20.pits', `Excavating pits; ${depthBand(dT)}; starting at reduced level`, vPits, 'm3', 'd20.excav',
    `${pads} nr x ${f(pad)} x ${f(pad)} m x ${f(dT)} m deep`);
  const supportOn = dT > a.supportThresholdM && dT > 0.25;
  if (supportOn) {
    add('D20', 'd20.support', 'Earthwork support; distance between opposing faces not exceeding 2.00m; maximum depth stated above',
      geo.trenchLenM * dT * 2, 'm2', 'd20.support', `${f(geo.trenchLenM)} m x ${f(dT)} m deep x 2 faces`);
    add('D20', 'd20.support.pit', 'Earthwork support to pits; distance between opposing faces not exceeding 2.00m',
      pads * 4 * pad * dT, 'm2', 'd20.support', `${pads} nr x 4 faces x ${f(pad)} m x ${f(dT)} m`);
  }
  add('D20', 'd20.compact.tr', 'Compacting bottoms of excavations', geo.trenchLenM * wT + pads * pad * pad, 'm2', 'd20.compact',
    `${f(geo.trenchLenM)} m x ${f(wT)} m + ${pads} pads`);

  // walls inside the trench (footing top to reduced ground)
  const hWallTrench = Math.max(0, dT - m(a.footingThickness));
  const volWallsInTrench = walls.reduce((s, w) => s + m(w.lengthMm) * m(w.thicknessMm) * hWallTrench, 0);
  const volFooting = geo.trenchLenM * wT * m(a.footingThickness);
  const volPads = pads * pad * pad * padT;
  const volBlind = a.footingBlinding > 0 ? geo.trenchLenM * wT * m(a.footingBlinding) : 0;
  const volBackfill = Math.max(0, vTrench + vPits - volFooting - volPads - volBlind - volWallsInTrench);
  add('D20', 'd20.backfill', 'Filling; return, fill and ram selected excavated material around foundations, in layers not exceeding 250mm',
    volBackfill, 'm3', 'd20.backfill',
    `excavation ${f(vTrench + vPits)} - concrete ${f(volFooting + volPads + volBlind)} - walls in trench ${f(volWallsInTrench)}`);
  const volTopsoil = a.topsoilStrip > 0 ? aStrip * m(a.topsoilStrip) : 0;
  add('D20', 'd20.disposal', 'Disposal of surplus excavated material; off site', Math.max(0, vTrench + vPits - volBackfill), 'm3', 'd20.disposal',
    `excavation ${f(vTrench + vPits)} - backfill ${f(volBackfill)} (topsoil ${f(volTopsoil)} m3 kept on site for re-spreading)`);

  const fillH = m(a.topsoilStrip + a.plinthHeight - a.slabThk - a.hardcoreThk - a.sandBlindingThk);
  add('D20', 'd20.fill', 'Filling to make up levels; imported selected fill; compacted in layers not exceeding 250mm',
    geo.aNetM2 * fillH, 'm3', 'd20.fill',
    `${f(geo.aNetM2)} m2 internal floor x ${f(fillH, 3)} m (plinth ${a.plinthHeight} + stripped topsoil ${a.topsoilStrip} - slab, hardcore, blinding)`);
  add('D20', 'd20.hardcore', `Filling; hardcore; ${a.hardcoreThk}mm thick; blinded, compacted`, geo.aNetM2 * m(a.hardcoreThk), 'm3', 'd20.hardcore',
    `${f(geo.aNetM2)} m2 x ${f(m(a.hardcoreThk), 3)} m`);
  add('D20', 'd20.compact.fill', 'Compacting filling; surface of hardcore', geo.aNetM2, 'm2', 'd20.compact', `${f(geo.aNetM2)} m2 internal floor`);
  if (a.sandBlindingThk > 0)
    add('D20', 'd20.sand', `Sand blinding; ${a.sandBlindingThk}mm thick; to receive damp proof membrane`, geo.aNetM2, 'm2', 'd20.sand', `${f(geo.aNetM2)} m2`);
  if (a.antiTermite) {
    const aT = geo.aNetM2 + geo.trenchLenM * (wT + 2 * dT);
    add('D20', 'd20.termite', 'Anti-termite chemical treatment to surfaces of excavations and filling', aT, 'm2', 'd20.termite',
      `${f(geo.aNetM2)} m2 floor + trench ${f(geo.trenchLenM)} m x (${f(wT)} + 2 x ${f(dT)}) m`, 'approx');
  }

  // ---------------------------------------------------------------- E10 / E20 / E30 concrete
  add('E10', 'e10.blind', `Plain in situ concrete; blinding; grade C10; ${a.footingBlinding}mm thick; poured on earth`, volBlind, 'm3', 'e10.blind',
    `${f(geo.trenchLenM)} m x ${f(wT)} m x ${f(m(a.footingBlinding), 3)} m`);
  add('E10', 'e10.footing', `Plain in situ concrete; foundations; grade ${a.footingGrade}; poured on or against earth; ${thickBand(a.footingThickness)}`,
    volFooting, 'm3', 'e10.footing', `${f(geo.trenchLenM)} m x ${f(wT)} m x ${f(m(a.footingThickness), 3)} m`);
  add('E10', 'e10.pads', `Reinforced in situ concrete; isolated foundations (pads); grade ${a.structGrade}; poured on or against earth; ${thickBand(a.padThk)}`,
    volPads, 'm3', 'e10.struct', `${pads} nr x ${f(pad)} x ${f(pad)} x ${f(padT, 3)} m`);

  const colVol = (() => {
    const hCol = Math.max(0, m(a.foundationDepth - (a.columnPad ? a.padThk : a.footingThickness) + a.plinthHeight)) + H;
    const vol = model.columns.reduce((s, c) => s + m(c.bMm) * m(c.dMm) * hCol * c.qty, 0);
    return { vol, hCol };
  })();
  add('E10', 'e10.columns', `Reinforced in situ concrete; columns; grade ${a.structGrade}; cross-sectional area exceeding 0.03m2`,
    colVol.vol, 'm3', 'e10.struct', model.columns.map(c => `${c.qty} nr ${c.bMm}x${c.dMm} x ${f(colVol.hCol)} m`).join(' + '));

  // lintels, grouped as one bill item (thickness of the wall they sit in)
  const tw = (ext: boolean) => {
    const set = walls.filter(w => w.external === ext);
    return set.length ? set.reduce((best, w) => (m(w.lengthMm) > m(best.lengthMm) ? w : best)).thicknessMm : geo.tExtMm;
  };
  let lintelVol = 0, lintelForm = 0, lintelBlockDeductExt = 0, lintelBlockDeductInt = 0, lintelNr = 0; const lintelCalc: string[] = [];
  model.openings.filter(o => o.widthMm >= 600).forEach(o => {
    const Lm = m(o.widthMm + 2 * a.lintelBearing), tM = m(tw(o.external)), d = m(a.lintelDepth);
    lintelVol += o.qty * Lm * tM * d;
    lintelForm += o.qty * Lm * (tM + 2 * d);
    if (o.external) lintelBlockDeductExt += o.qty * Lm * d; else lintelBlockDeductInt += o.qty * Lm * d;
    lintelNr += o.qty;
    lintelCalc.push(`${o.qty} nr ${o.mark} (${f(Lm)} x ${f(tM)} x ${f(d)})`);
  });
  add('E10', 'e10.lintels', `Reinforced in situ concrete; beams (lintels); grade ${a.structGrade}; cross-sectional area not exceeding 0.03m2 to 0.1m2`,
    lintelVol, 'm3', 'e10.struct', lintelCalc.join(' + '));

  const rbDepth = m(a.ringBeamDepth);
  const rbOn = a.ringBeam && !flat;
  const rbVol = rbOn ? walls.reduce((s, w) => s + m(w.lengthMm) * m(w.thicknessMm) * rbDepth, 0) : 0;
  add('E10', 'e10.ringbeam', `Reinforced in situ concrete; beams (ring beam at eaves); grade ${a.structGrade}; ${a.ringBeamDepth}mm deep`,
    rbVol, 'm3', 'e10.struct', `Σ (wall length x thickness) = ${f(allLen)} m x ~${f(m(geo.tExtMm), 3)} m x ${f(rbDepth, 3)} m`);

  const slabUpper = Math.max(0, a.floors - 1) + (flat ? 1 : 0);
  const roofPlanArea = geo.aExtM2 + geo.pExtM * m(a.overhang) + 4 * m(a.overhang) ** 2;
  const slabArea = (Math.max(0, a.floors - 1)) * geo.aExtM2 + (flat ? roofPlanArea : 0);
  add('E10', 'e10.groundslab', `Reinforced in situ concrete; ground slab (bed); grade ${a.slabGrade}; ${thickBand(a.slabThk)}; poured on blinding`,
    geo.aNetM2 * m(a.slabThk), 'm3', 'e10.slab', `${f(geo.aNetM2)} m2 x ${f(m(a.slabThk), 3)} m`);
  add('E10', 'e10.suspslab', `Reinforced in situ concrete; suspended slabs; grade ${a.structGrade}; ${thickBand(a.suspendedSlabThk)}`,
    slabArea * m(a.suspendedSlabThk), 'm3', 'e10.struct',
    `${f(slabArea)} m2 (${a.floors - 1} upper floor${a.floors - 1 === 1 ? '' : 's'}${flat ? ' + flat roof incl. overhang' : ''}) x ${f(m(a.suspendedSlabThk), 3)} m`);

  // formwork
  add('E20', 'e20.lintels', 'Formwork; soffits and sides of beams (lintels); plain finish', lintelForm, 'm2', 'e20.form', lintelCalc.join(' + '));
  if (rbOn) add('E20', 'e20.ringbeam', 'Formwork; sides of beams (ring beam); plain finish', allLen * 2 * rbDepth, 'm2', 'e20.form',
    `${f(allLen)} m x 2 sides x ${f(rbDepth, 3)} m`);
  add('E20', 'e20.columns', 'Formwork; sides of columns; plain finish',
    model.columns.reduce((s, c) => s + 2 * (m(c.bMm) + m(c.dMm)) * colVol.hCol * c.qty, 0), 'm2', 'e20.form', `column perimeters x ${f(colVol.hCol)} m`);
  add('E20', 'e20.soffit', 'Formwork; soffits of suspended slabs; horizontal; height to soffit not exceeding 3.50m', slabArea, 'm2', 'e20.form', `${f(slabArea)} m2`);
  if (slabUpper > 0)
    add('E20', 'e20.slabedge', 'Formwork; edges of suspended slabs; vertical', slabUpper * geo.pExtM * m(a.suspendedSlabThk), 'm2', 'e20.form',
      `${slabUpper} slab(s) x ${f(geo.pExtM)} m x ${f(m(a.suspendedSlabThk), 3)} m`);

  // reinforcement
  const kg = a.rebarKgM3;
  add('E30', 'e30.mesh', 'Fabric reinforcement; BS 4483 ref A142; in ground slab; laps included in rate', geo.aNetM2, 'm2', 'e30.mesh', `${f(geo.aNetM2)} m2`);
  const bar = (key: string, desc: string, vol: number, rate: number) =>
    add('E30', key, `Reinforcement bars; ${desc}; approximate quantity`, (vol * rate) / 1000, 't', 'e30.bar', `${f(vol, 3)} m3 x ${rate} kg/m3`, 'approx');
  bar('e30.pads', 'pads', volPads, kg.pad);
  bar('e30.columns', 'columns', colVol.vol, kg.column);
  bar('e30.lintels', 'lintels', lintelVol, kg.lintel);
  bar('e30.ringbeam', 'ring beam', rbVol, kg.ringBeam);
  bar('e30.slabs', 'suspended slabs', slabArea * m(a.suspendedSlabThk), kg.slab);

  // ---------------------------------------------------------------- F10 / F30 walling
  const mid = (ext: boolean) => walls.filter(w => w.external === ext);
  const openings = model.openings;
  const dedArea = (ext: boolean) => openings.filter(o => o.external === ext && deductible(o, a)).reduce((s, o) => s + o.qty * unitArea(o), 0);
  const B = geo.shortExtM, rise = (B / 2) * Math.tan(rad(a.roofPitch));
  const gableArea = a.roofType === 'gable' ? B * rise : a.roofType === 'shed' ? B * (B * Math.tan(rad(a.roofPitch))) : 0;
  const parapetArea = flat ? m(a.parapet) * geo.extLenM : 0;

  // substructure walling by thickness
  const subByT = new Map<number, number>();
  walls.forEach(w => subByT.set(w.thicknessMm, (subByT.get(w.thicknessMm) ?? 0) + m(w.lengthMm)));
  subByT.forEach((len, th) => add('F10', `f10.sub.${th}`,
    `Walls; ${a.blockSpec}; ${th}mm thick; bedded and jointed in ${a.mortar}; substructure (footing to floor level)`, len * hSub, 'm2', blockRateKey(th),
    `${f(len)} m x ${f(hSub, 3)} m (footing top to floor level)`));

  // superstructure walling by class and thickness
  const groups = new Map<string, { ext: boolean; th: number; len: number }>();
  walls.forEach(w => {
    const k = `${w.external ? 'E' : 'I'}${w.thicknessMm}`;
    const g = groups.get(k) ?? { ext: w.external, th: w.thicknessMm, len: 0 };
    g.len += m(w.lengthMm); groups.set(k, g);
  });
  const maxGroup = (ext: boolean) => [...groups.values()].filter(g => g.ext === ext).sort((x, y) => y.len - x.len)[0];
  const lenOf = (ext: boolean) => mid(ext).reduce((s, w) => s + m(w.lengthMm), 0) || 1;
  groups.forEach((g, k) => {
    const share = g.len / lenOf(g.ext);
    const major = maxGroup(g.ext) === g;
    const gross = g.len * H;
    const open = dedArea(g.ext) * share;
    const lint = (g.ext ? lintelBlockDeductExt : lintelBlockDeductInt) * share;
    const ring = rbOn ? g.len * rbDepth : 0;
    const extras = g.ext && major ? gableArea + parapetArea : 0;
    const net = gross - open - lint - ring + extras;
    const parts = [`${f(g.len)} m x ${f(H)} m = ${f(gross)}`];
    if (open) parts.push(`- openings ${f(open)}`); if (lint) parts.push(`- lintels ${f(lint)}`);
    if (ring) parts.push(`- ring beam ${f(ring)}`); if (extras) parts.push(`+ ${flat ? 'parapet' : 'gable ends'} ${f(extras)}`);
    add('F10', `f10.sup.${k}`,
      `Walls; ${a.blockSpec}; ${g.th}mm thick; bedded and jointed in ${a.mortar}; ${g.ext ? 'external' : 'internal'} superstructure; openings over ${a.openingDeductM2.toFixed(2)}m2 deducted`,
      net, 'm2', blockRateKey(g.th), parts.join(' '));
  });
  add('F30', 'f30.dpc', 'Damp proof course; horizontal; width equal to wall thickness; bedded in cement mortar; laps 150mm', allLen, 'm', 'f30.dpc',
    `${f(allLen)} m wall centre-lines`);

  // ---------------------------------------------------------------- roof
  const cos = Math.cos(rad(a.roofPitch));
  const Lr = geo.longExtM + 2 * m(a.overhang), Br = B + 2 * m(a.overhang);
  const sloped = roofPlanArea / cos;
  const slopeLen = (a.roofType === 'shed' ? Br : Br / 2) / cos;
  const hipLen = Math.sqrt(((Br / 2) * Math.SQRT2) ** 2 + ((Br / 2) * Math.tan(rad(a.roofPitch))) ** 2);
  const ridgeLen = a.roofType === 'gable' ? Lr : a.roofType === 'hip' ? Math.max(0, Lr - Br) : a.roofType === 'shed' ? Lr : 0;
  const capLen = a.roofType === 'hip' ? ridgeLen + 4 * hipLen : ridgeLen;
  const eaves = a.roofType === 'gable' ? 2 * Lr : a.roofType === 'hip' ? 2 * (Lr + Br) : a.roofType === 'shed' ? Lr : 0;
  const fascia = a.roofType === 'gable' ? 2 * Lr + 4 * slopeLen : a.roofType === 'hip' ? 2 * (Lr + Br) : a.roofType === 'shed' ? 2 * Lr + 2 * slopeLen : 0;

  if (!flat) {
    const trusses = Math.ceil(geo.longExtM / m(a.trussSpacing)) + 1;
    add('G20', 'g20.trusses', `Trussed rafters; timber; span ${f(B)}m; pitch ${a.roofPitch} degrees; at ${a.trussSpacing}mm centres; treated`,
      trusses, 'nr', 'g20.truss', `${f(geo.longExtM)} m / ${f(m(a.trussSpacing))} m + 1`, 'approx', B);
    const nPurl = Math.ceil(slopeLen / m(a.purlinSpacing)) + 1;
    const slopes = a.roofType === 'shed' ? 1 : 2;
    add('G20', 'g20.purlins', `Purlins / battens; timber; 50 x 100mm; at ${a.purlinSpacing}mm centres; treated`, slopes * nPurl * Lr, 'm', 'g20.purlin',
      `${slopes} slope(s) x ${nPurl} rows x ${f(Lr)} m`, 'approx');
    add('G20', 'g20.plate', 'Wall plate; timber; 50 x 100mm; bolted to ring beam; treated', geo.extLenM, 'm', 'g20.plate', `${f(geo.extLenM)} m external wall centre-lines`);
    const sec = a.roofCovering === 'aluminium_sheet' ? 'H31' : 'H60';
    add(sec, 'roof.cover', a.roofCovering === 'aluminium_sheet'
      ? `Aluminium long-span profiled roof sheeting; pitch ${a.roofPitch} degrees; fixed to purlins`
      : `Concrete interlocking roof tiles on treated battens and underlay; pitch ${a.roofPitch} degrees`,
      sloped, 'm2', a.roofCovering === 'aluminium_sheet' ? 'h31.sheet' : 'h60.tile',
      `plan ${f(roofPlanArea)} m2 (incl. ${a.overhang}mm overhang) / cos ${a.roofPitch} deg`);
    add(sec, 'roof.ridge', `${a.roofType === 'hip' ? 'Ridge and hip' : 'Ridge'} capping`, capLen, 'm',
      a.roofCovering === 'aluminium_sheet' ? 'h31.ridge' : 'h60.ridge', a.roofType === 'hip' ? `ridge ${f(ridgeLen)} m + 4 hips x ${f(hipLen)} m` : `${f(ridgeLen)} m`);
    add('P20', 'p20.fascia', 'Fascia and barge boards; 25 x 200mm; primed', fascia, 'm', 'p20.fascia', `${f(fascia)} m eaves + verges`);
    add('R10', 'r10.gutter', 'Rainwater gutters; 115mm; fixed to fascia', eaves, 'm', 'r10.gutter', `${f(eaves)} m eaves`);
    const nDown = Math.max(2, Math.ceil(eaves / 12));
    const hDown = m(a.plinthHeight) + H + 0.3;
    add('R10', 'r10.pipe', 'Rainwater downpipes; 75mm; fixed to wall', nDown * hDown, 'm', 'r10.pipe', `${nDown} nr x ${f(hDown)} m`);
    add('R10', 'r10.outlet', 'Rainwater outlets, shoes and offsets', nDown, 'nr', 'r10.outlet', `${nDown} nr`);
  } else {
    add('J40', 'roof.flat', 'Bituminous roof membrane on screed to falls; two layers; turned up at parapet', roofPlanArea, 'm2', 'j40.roof', `${f(roofPlanArea)} m2 roof plan incl. overhang`);
    const nOut = Math.max(2, Math.ceil(roofPlanArea / 60)), hDown = m(a.plinthHeight) + H + 0.3;
    add('R10', 'r10.pipe', 'Rainwater downpipes; 75mm; fixed to wall', nOut * hDown, 'm', 'r10.pipe', `${nOut} nr x ${f(hDown)} m`);
    add('R10', 'r10.outlet', 'Rainwater outlets and shoes', nOut, 'nr', 'r10.outlet', `${nOut} nr (1 per 60 m2)`);
  }

  // ---------------------------------------------------------------- J40 DPM
  add('J40', 'j40.dpm', 'Damp proof membrane; polythene sheet, 1000 gauge; laid on sand blinding; 150mm laps sealed', geo.aNetM2, 'm2', 'j40.dpm', `${f(geo.aNetM2)} m2 (laps not measured)`);

  // ---------------------------------------------------------------- doors, windows, stairs
  [...openings].sort((x, y) => x.mark.localeCompare(y.mark, undefined, { numeric: true })).forEach(o => {
    const win = o.kind === 'window';
    add(win ? 'L10' : 'L20', `${win ? 'l10' : 'l20'}.${o.id}`,
      `${win ? 'Window' : 'Door'} ${o.mark}; ${o.description}; ${o.widthMm} x ${o.heightMm}mm; ${o.external ? 'external' : 'internal'}; fixed in prepared opening`,
      o.qty, 'nr', win ? 'l10.window' : o.external ? 'l20.door.ext' : 'l20.door.int', `${o.qty} nr x ${f(unitArea(o))} m2 each`, 'measured', unitArea(o));
  });
  const stairs = a.stairCount > 0 ? a.stairCount : Math.max(0, a.floors - 1);
  add('L30', 'l30.stair', 'Staircase; reinforced concrete with finishes and balustrade; complete', stairs, 'nr', 'l30.stair', `${stairs} nr (floors - 1 unless set)`, 'approx');

  // ---------------------------------------------------------------- ceilings, finishes
  const nCeil = flat ? 0 : 1;
  if (a.ceiling !== 'none')
    add(a.ceiling === 'pvc' ? 'K13' : 'K10', 'k.ceiling', a.ceiling === 'pvc' ? 'PVC ceiling panels on timber brandering; horizontal' : '9.5mm plasterboard ceiling on timber brandering; skim coat; horizontal',
      nCeil * geo.aNetM2, 'm2', a.ceiling === 'pvc' ? 'k13.pvc' : 'k10.pb', `${f(geo.aNetM2)} m2 top floor`);

  const Hfin = m(a.floorHeight) * a.floors;
  const Hext = Hfin + m(a.plinthHeight) + (flat ? m(a.parapet) : 0);
  const gross = (ext: boolean) => ext ? geo.pExtM * Hext + (a.roofType === 'gable' || a.roofType === 'shed' ? gableArea : 0) : 0;
  const extOpen = dedArea(true), intOpen = dedArea(false);
  const intFaces = geo.pIntM * Hfin + 2 * Math.max(0, geo.intLenM - model.walls.filter(w => !w.external).length * t) * Hfin;
  const intNet = Math.max(0, intFaces - extOpen - 2 * intOpen);
  const extNet = Math.max(0, gross(true) - extOpen);
  const soffits = (Math.max(0, a.floors - 1) + (flat ? 1 : 0)) * geo.aNetM2;
  add('M20', 'm20.int', `Plastered coating; cement:sand; ${a.internalRenderThk}mm thick; to walls; internal`, intNet, 'm2', 'm20.int',
    `external wall inner faces ${f(geo.pIntM)} m + internal wall faces, x ${f(Hfin)} m = ${f(intFaces)} - openings ${f(extOpen + 2 * intOpen)}`);
  add('M20', 'm20.soffit', `Plastered coating; cement:sand; ${a.internalRenderThk}mm thick; to soffits of slabs`, soffits, 'm2', 'm20.int', `${f(geo.aNetM2)} m2 x ${slabUpper} slab(s)`);
  add('M20', 'm20.ext', `Rendered coating; cement:sand; ${a.externalRenderThk}mm thick; to walls; external`, extNet, 'm2', 'm20.ext',
    `girth ${f(geo.pExtM)} m x ${f(Hext)} m high${gableArea ? ` + gable ${f(gableArea)}` : ''} - openings ${f(extOpen)}`);

  const screedArea = a.floorFinish === 'none' ? 0 : geo.aNetM2 * a.floors;
  add('M10', 'm10.screed', 'Cement:sand screed; 40mm thick; steel trowelled, to receive tiles; to floors', screedArea, 'm2', 'm10.screed', `${f(geo.aNetM2)} m2 x ${a.floors} floor(s)`);
  if (a.floorFinish === 'ceramic_tile')
    add('M40', 'm40.floor', 'Ceramic floor tiles; 300 x 300mm; bedded in adhesive; grouted; to floors', screedArea, 'm2', 'm40.floor', `${f(screedArea)} m2`);
  add('M40', 'm40.wall', 'Ceramic wall tiles; bedded in adhesive; grouted; to walls of wet areas (area supplied by user)', a.wetWallTilingM2, 'm2', 'm40.wall', `${f(a.wetWallTilingM2)} m2 entered on Setup`);

  const skirt = Math.max(0, (geo.pIntM + 2 * geo.intLenM - openings.filter(o => o.kind === 'door').reduce((s, o) => s + o.qty * m(o.widthMm), 0)) * a.floors);
  add('P20', 'p20.skirting', `Skirting; ${a.skirtingHeight}mm high; ${a.floorFinish === 'ceramic_tile' ? 'ceramic' : 'cement:sand'}`, skirt, 'm', 'p20.skirting',
    `(${f(geo.pIntM)} + 2 x ${f(geo.intLenM)} - door widths) x ${a.floors} floor(s)`, 'approx');

  const paintInt = Math.max(0, intNet - a.wetWallTilingM2) + soffits + (a.ceiling === 'plasterboard' ? nCeil * geo.aNetM2 : 0);
  add('M60', 'm60.int', 'Emulsion paint; one coat sealer and two coats; to plastered walls, soffits and ceilings; internal', paintInt, 'm2', 'm60.int',
    `walls ${f(Math.max(0, intNet - a.wetWallTilingM2))} + soffits ${f(soffits)}${a.ceiling === 'plasterboard' ? ` + ceiling ${f(geo.aNetM2)}` : ''}`);
  add('M60', 'm60.ext', 'Masonry paint; one coat sealer and two coats; to rendered walls; external', extNet, 'm2', 'm60.ext', `${f(extNet)} m2 as external render`);

  // ---------------------------------------------------------------- provisional sums
  const gfa = geo.gfaM2;
  ([['ps.electrical', 'Provisional sum; electrical installation (conduits, wiring, fittings, DB, earthing)'],
    ['ps.plumbing', 'Provisional sum; plumbing and sanitary installation (water supply, fittings, sanitary ware)'],
    ['ps.drainage', 'Provisional sum; drainage below ground, manholes and septic tank / soakaway'],
    ['ps.external', 'Provisional sum; external works (paving, fencing, landscaping)']] as const)
    .forEach(([k, d]) => add('PS', k, d, 1, 'item', k, `allowance per m2 of GFA (${f(gfa)} m2) from the Rates tab`, 'ps', gfa));

  return { lines, geo };
}

export function scopeNotes(a: Assumptions): string[] {
  return [
    'Quantities are net, taken from the plan data and assumptions on the Setup and Schedule tabs. No allowance is made for waste, bulking, shrinkage or laps.',
    'Items marked "approx" (reinforcement, roof carcass, skirting, anti-termite, staircase) rest on stated assumptions and should be replaced by measured quantities from the structural and detail drawings.',
    `Openings over ${a.openingDeductM2.toFixed(2)} m2 are deducted from walling and finishes; smaller openings are not deducted.`,
    'Doors and windows are rated complete (frame, leaf, glazing, ironmongery and finish). Reveals, sills and builder\'s work in connection with services are not measured separately.',
    'Electrical, plumbing, drainage and external works are provisional sums derived from gross floor area. Replace them with specialist quotations.',
    'Rates are placeholders until you replace them on the Rates tab. Preliminaries, overheads, contingency and taxes are percentages entered on the Summary tab.',
    'Section codes follow SMM7 work sections. Check item descriptions and measurement rules against the SMM7 classification tables before issuing tender documents.',
  ];
}
