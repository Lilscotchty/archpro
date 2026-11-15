// utils/cpmDiagram.ts
// Activity-on-node critical path diagram in the standard layout:
//
//        ┌─────┬─────┬─────┐   ES | Duration | EF
//        │  0  │  2  │  2  │
//        ├─────┴─────┴─────┤
//        │     TRENCH      │   activity name
//        ├─────┬─────┬─────┤
//        │  0  │  0  │  2  │
//        └─────┴─────┴─────┘   LS | Float | LF
//
// Boxes sit in columns (one column per step of the longest path), arrows leave the right-hand side of a box, run along
// their own vertical lane and enter the left-hand side of the next box with an arrowhead. Long links pass through
// reserved empty rows so a line never crosses a box. Everything here is pure (no DOM) so it can be tested and reused
// for SVG, PNG and PDF export.

import { Scheduled } from './methodEngine';

export interface CpmNode {
  key: string; kind: 'start' | 'end' | 'act' | 'dummy'; rank: number; label: string;
  days: number; es: number; ef: number; ls: number; lf: number; float: number; critical: boolean;
  x: number; y: number; w: number; h: number;      // x = left edge, y = vertical centre
}
export interface CpmEdge { from: string; to: string; points: { x: number; y: number }[]; critical: boolean }
export interface CpmLayout {
  nodes: CpmNode[]; edges: CpmEdge[]; width: number; height: number; total: number; criticalPaths: string[][];
}

export const BOX = { w: 132, h: 80, top: 24, bottom: 24 };     // cell heights; the name row is what is left
const V_GAP = 34;            // clear space between boxes in a column
const MARGIN = 24;
const LANE = 13;             // spacing between arrow lanes
const DUMMY_H = 8;

const fmt = (n: number) => String(Number(n.toFixed(2)));

export function layoutCpm(items: Scheduled[], total: number): CpmLayout {
  const empty: CpmLayout = { nodes: [], edges: [], width: 0, height: 0, total, criticalPaths: [] };
  if (!items.length) return empty;

  const mk = (key: string, kind: CpmNode['kind'], rank: number, label: string, v: Partial<CpmNode>): CpmNode => ({
    key, kind, rank, label, days: 0, es: 0, ef: 0, ls: 0, lf: 0, float: 0, critical: false, x: 0, y: 0, w: BOX.w, h: kind === 'dummy' ? DUMMY_H : BOX.h, ...v,
  });

  // ---------------------------------------------------------------- graph with Start and End
  const byId = new Map(items.map(i => [i.id, i]));
  const succs = new Map<number, number[]>(items.map(i => [i.id, []]));
  items.forEach(i => i.preds.forEach(p => succs.get(p)?.push(i.id)));

  const rank = new Map<string, number>();
  const rankOf = (id: number): number => {
    const k = `a${id}`;
    if (rank.has(k)) return rank.get(k)!;
    const a = byId.get(id)!;
    const r = a.preds.length ? 1 + Math.max(...a.preds.map(rankOf)) : 1;
    rank.set(k, r); return r;
  };
  items.forEach(i => rankOf(i.id));
  const endRank = 1 + Math.max(...items.map(i => rank.get(`a${i.id}`)!));

  const nodes: CpmNode[] = [
    mk('start', 'start', 0, 'Start', { critical: true }),
    ...items.map(i => mk(`a${i.id}`, 'act', rank.get(`a${i.id}`)!, i.name || `Activity ${i.id}`, { days: i.days, es: i.es, ef: i.ef, ls: i.ls, lf: i.lf, float: i.float, critical: i.critical })),
    mk('end', 'end', endRank, 'End', { es: total, ef: total, ls: total, lf: total, critical: true }),
  ];
  const nmap = new Map(nodes.map(n => [n.key, n]));

  // links, in input order
  const links: { from: string; to: string }[] = [];
  for (const i of items) {
    if (!i.preds.length) links.push({ from: 'start', to: `a${i.id}` });
    for (const p of i.preds) links.push({ from: `a${p}`, to: `a${i.id}` });
    if (!succs.get(i.id)!.length) links.push({ from: `a${i.id}`, to: 'end' });
  }

  // ---------------------------------------------------------------- dummy nodes for links that skip columns
  interface Hop { from: string; to: string; link: number }
  const hops: Hop[] = [];
  const chains: string[][] = [];
  let dn = 0;
  links.forEach((l, li) => {
    const a = nmap.get(l.from)!, b = nmap.get(l.to)!;
    const chain = [l.from];
    for (let r = a.rank + 1; r < b.rank; r++) { const d = mk(`d${dn++}`, 'dummy', r, '', {}); nodes.push(d); nmap.set(d.key, d); chain.push(d.key); }
    chain.push(l.to);
    chains.push(chain);
    for (let i = 0; i + 1 < chain.length; i++) hops.push({ from: chain[i], to: chain[i + 1], link: li });
  });

  // ---------------------------------------------------------------- order within each column (barycentre sweeps)
  const layers: CpmNode[][] = Array.from({ length: endRank + 1 }, () => []);
  nodes.forEach(n => layers[n.rank].push(n));
  const pos = new Map<string, number>();
  const reindex = () => layers.forEach(L => L.forEach((n, i) => pos.set(n.key, i)));
  reindex();
  const nbrs = (key: string, dir: 'in' | 'out') => hops.filter(h => (dir === 'in' ? h.to === key : h.from === key)).map(h => (dir === 'in' ? h.from : h.to));
  const sweep = (r: number, dir: 'in' | 'out') => {
    const bary = new Map<string, number>();
    layers[r].forEach(n => { const ns = nbrs(n.key, dir); bary.set(n.key, ns.length ? ns.reduce((s, k) => s + pos.get(k)!, 0) / ns.length : pos.get(n.key)!); });
    layers[r] = layers[r].map((n, i) => ({ n, i })).sort((p, q) => bary.get(p.n.key)! - bary.get(q.n.key)! || p.i - q.i).map(p => p.n);
    layers[r].forEach((n, i) => pos.set(n.key, i));
  };
  for (let it = 0; it < 8; it++) {
    for (let r = 1; r <= endRank; r++) sweep(r, 'in');
    for (let r = endRank - 1; r >= 0; r--) sweep(r, 'out');
  }

  // ---------------------------------------------------------------- vertical placement
  const sep = (a: CpmNode, b: CpmNode) => (a.h + b.h) / 2 + V_GAP;
  const place = (L: CpmNode[], desired: Map<string, number>) => {
    L.forEach(n => { n.y = desired.get(n.key) ?? n.y; });
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < L.length; i++) L[i].y = Math.max(L[i].y, L[i - 1].y + sep(L[i - 1], L[i]));
      if (pass === 0) {                                  // re-centre the pushed column on where it wanted to be
        const shift = L.reduce((s, n) => s + (n.y - (desired.get(n.key) ?? n.y)), 0) / L.length;
        L.forEach(n => { n.y -= shift; });
      }
    }
  };
  layers.forEach(L => L.forEach((n, i) => { n.y = i * (BOX.h + V_GAP); }));
  for (let it = 0; it < 10; it++) {
    for (let r = 1; r <= endRank; r++) place(layers[r], new Map(layers[r].map(n => { const ns = nbrs(n.key, 'in'); return [n.key, ns.length ? ns.reduce((s, k) => s + nmap.get(k)!.y, 0) / ns.length : n.y]; })));
    for (let r = endRank - 1; r >= 0; r--) place(layers[r], new Map(layers[r].map(n => { const ns = nbrs(n.key, 'out'); return [n.key, ns.length ? ns.reduce((s, k) => s + nmap.get(k)!.y, 0) / ns.length : n.y]; })));
  }
  // straighten: a box that follows exactly one box (which feeds only it) lines up with it when there is room, so chains read as straight arrows
  for (let it = 0; it < 4; it++) for (let r = 1; r <= endRank; r++) layers[r].forEach((n, i) => {
    const inn = hops.filter(h => h.to === n.key);
    if (inn.length !== 1 || hops.filter(h => h.from === inn[0].from).length !== 1) return;
    const target = nmap.get(inn[0].from)!.y, prev = layers[r][i - 1], next = layers[r][i + 1];
    if ((!prev || target >= prev.y + sep(prev, n)) && (!next || target <= next.y - sep(n, next))) n.y = target;
  });
  const minTop = Math.min(...nodes.map(n => n.y - n.h / 2));
  nodes.forEach(n => { n.y += MARGIN - minTop; });

  // ---------------------------------------------------------------- horizontal placement: gaps sized for their lanes
  const sources = layers.map(L => L.filter(n => hops.some(h => h.from === n.key)));
  let x = MARGIN;
  const colX: number[] = [], gapX: number[] = [], gapW: number[] = [];
  for (let r = 0; r <= endRank; r++) {
    colX[r] = x; layers[r].forEach(n => { n.x = x; });
    const gw = Math.max(46, LANE * (sources[r].length + 1) + 14);
    gapX[r] = x + BOX.w; gapW[r] = gw; x += BOX.w + gw;
  }
  const width = colX[endRank] + BOX.w + MARGIN;
  const height = Math.max(...nodes.map(n => n.y + n.h / 2)) + MARGIN;

  // ---------------------------------------------------------------- arrow lanes: each source gets its own vertical lane
  const laneX = new Map<string, number>();
  for (let r = 0; r < endRank; r++) {
    const S = sources[r];
    const dirOf = (n: CpmNode) => { const ts = hops.filter(h => h.from === n.key).map(h => nmap.get(h.to)!.y); return ts.reduce((s, y) => s + y, 0) / ts.length - n.y; };
    // sources whose arrows go down: lowest source nearest the box; sources whose arrows go up: highest nearest. This avoids crossings.
    const down = S.filter(n => dirOf(n) >= 0).sort((a, b) => b.y - a.y), up = S.filter(n => dirOf(n) < 0).sort((a, b) => a.y - b.y);
    [...down, ...up].forEach((n, i, all) => laneX.set(n.key, gapX[r] + ((i + 1) * gapW[r]) / (all.length + 1)));
  }

  const crit = (a: CpmNode, b: CpmNode) => a.critical && b.critical && (a.kind === 'start' ? b.es === 0 : b.kind === 'end' ? a.ef === total : a.ef === b.es);
  const edges: CpmEdge[] = chains.map((chain, li) => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = nmap.get(chain[i])!, b = nmap.get(chain[i + 1])!, lx = laneX.get(a.key)!;
      pts.push({ x: a.x + a.w, y: a.y });
      if (Math.abs(a.y - b.y) > 0.01) { pts.push({ x: lx, y: a.y }); pts.push({ x: lx, y: b.y }); }
      pts.push({ x: b.x, y: b.y });
    }
    const first = nmap.get(links[li].from)!, last = nmap.get(links[li].to)!;
    return { from: links[li].from, to: links[li].to, points: pts, critical: crit(first, last) };
  });

  // every route from Start to End that follows only critical links (capped, so a pathological network cannot flood the key)
  const critNext = new Map<string, string[]>();
  edges.filter(e => e.critical).forEach(e => critNext.set(e.from, [...(critNext.get(e.from) ?? []), e.to]));
  const criticalPaths: string[][] = [];
  const walk = (k: string, trail: string[]) => {
    if (criticalPaths.length >= 8) return;
    const next = [...trail, nmap.get(k)!.label];
    if (k === 'end') { criticalPaths.push(next); return; }
    (critNext.get(k) ?? []).forEach(n => walk(n, next));
  };
  walk('start', []);
  return { nodes: nodes.filter(n => n.kind !== 'dummy'), edges, width, height, total, criticalPaths };
}

// ------------------------------------------------------------------------------------------------ SVG

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Break a name into at most two lines that fit the name row; very long names end in an ellipsis. */
export function wrapName(name: string, maxChars = 19): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const cut = (s: string) => (s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s);
  if (lines.length <= 2) return lines.map(cut);
  const rest = lines.slice(1).join(' ');
  return [cut(lines[0]), rest.length > maxChars ? rest.slice(0, maxChars - 1) + '…' : rest];
}

export interface SvgOptions { title?: string; key?: boolean; highlight?: boolean }
const INK = '#000', RED = '#c40000';

export function renderCpmSvg(L: CpmLayout, o: SvgOptions = {}): string {
  if (!L.nodes.length) return '';
  const extraTop = o.title ? 44 : 0, extraBottom = o.key ? 96 : 0;
  const W = Math.max(L.width, o.key ? 560 : 0), H = L.height + extraTop + extraBottom;
  const hi = !!o.highlight;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  if (o.title) out.push(`<text x="24" y="26" font-size="16" font-weight="700" fill="${INK}">${esc(o.title)}</text><text x="24" y="42" font-size="11" fill="#444">Total duration ${fmt(L.total)} days</text>`);
  out.push(`<g transform="translate(0 ${extraTop})">`);

  // arrows
  for (const e of L.edges) {
    const c = hi && e.critical, col = c ? RED : INK, sw = c ? 1.8 : 1;
    const p = e.points, d = p.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
    out.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linejoin="miter"/>`);
    const t = p[p.length - 1];
    out.push(`<path d="M${t.x} ${t.y} l-7 -3.6 l0 7.2 z" fill="${col}" stroke="${col}" stroke-width="0.5"/>`);
  }

  // boxes
  for (const n of L.nodes) {
    const x = n.x, y = n.y - n.h / 2, w = n.w, h = n.h, cw = w / 3, c = hi && n.critical && n.kind === 'act';
    const col = c ? RED : INK, sw = c ? 1.8 : 1;
    const cell = (cx: number, cy: number, v: number) => `<text x="${(cx + cw / 2).toFixed(1)}" y="${(cy + BOX.top / 2 + 4).toFixed(1)}" font-size="11.5" text-anchor="middle" fill="${INK}">${fmt(v)}</text>`;
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${col}" stroke-width="${sw}"/>`);
    out.push(`<path d="M${x} ${y + BOX.top} H${x + w} M${x} ${y + h - BOX.bottom} H${x + w} M${x + cw} ${y} V${y + BOX.top} M${x + 2 * cw} ${y} V${y + BOX.top} M${x + cw} ${y + h - BOX.bottom} V${y + h} M${x + 2 * cw} ${y + h - BOX.bottom} V${y + h}" stroke="${col}" stroke-width="${Math.min(sw, 1)}" fill="none"/>`);
    out.push(cell(x, y, n.es), cell(x + cw, y, n.days), cell(x + 2 * cw, y, n.ef));
    out.push(cell(x, y + h - BOX.bottom, n.ls), cell(x + cw, y + h - BOX.bottom, n.float), cell(x + 2 * cw, y + h - BOX.bottom, n.lf));
    const lines = wrapName(n.label), nameH = h - BOX.top - BOX.bottom, mid = y + BOX.top + nameH / 2;
    lines.forEach((ln, i) => out.push(`<text x="${x + w / 2}" y="${(mid + (i - (lines.length - 1) / 2) * 12 + 4).toFixed(1)}" font-size="${lines.length > 1 ? 10.5 : 11.5}" font-weight="700" text-anchor="middle" fill="${INK}">${esc(ln)}</text>`));
  }
  out.push('</g>');

  if (o.key) {
    const y0 = extraTop + L.height + 8, kx = 24, kw = 108, kh = 54;
    out.push(`<g font-size="9.5" fill="#222">`);
    out.push(`<rect x="${kx}" y="${y0}" width="${kw}" height="${kh}" fill="#fff" stroke="${INK}"/>`);
    out.push(`<path d="M${kx} ${y0 + 15} H${kx + kw} M${kx} ${y0 + 39} H${kx + kw} M${kx + 36} ${y0} V${y0 + 15} M${kx + 72} ${y0} V${y0 + 15} M${kx + 36} ${y0 + 39} V${y0 + kh} M${kx + 72} ${y0 + 39} V${y0 + kh}" stroke="${INK}" fill="none"/>`);
    out.push(`<text x="${kx + 18}" y="${y0 + 11}" text-anchor="middle">ES</text><text x="${kx + 54}" y="${y0 + 11}" text-anchor="middle">Dur.</text><text x="${kx + 90}" y="${y0 + 11}" text-anchor="middle">EF</text>`);
    out.push(`<text x="${kx + kw / 2}" y="${y0 + 31}" text-anchor="middle" font-weight="700">Activity</text>`);
    out.push(`<text x="${kx + 18}" y="${y0 + 51}" text-anchor="middle">LS</text><text x="${kx + 54}" y="${y0 + 51}" text-anchor="middle">Float</text><text x="${kx + 90}" y="${y0 + 51}" text-anchor="middle">LF</text>`);
    const per = Math.max(40, Math.floor((W - 170) / 5.4));
    const lines = L.criticalPaths.flatMap((p, i) => wrapText(`${L.criticalPaths.length > 1 ? `Critical path ${i + 1}` : 'Critical path'}: ${p.join(' → ')}`, per)).slice(0, 4);
    lines.push(`Total duration ${fmt(L.total)} days`);
    lines.forEach((ln, i) => out.push(`<text x="${kx + kw + 22}" y="${y0 + 14 + i * 13}" font-size="10.5">${esc(ln)}</text>`));
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('');
}

function wrapText(s: string, max: number): string[] {
  const out: string[] = []; let cur = '';
  for (const w of s.split(' ')) { if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  return out;
}
