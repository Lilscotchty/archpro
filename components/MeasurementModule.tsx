// components/MeasurementModule.tsx
// SMM7 workbook: generate from drafting -> dimension-sheet take-off -> priced BoQ,
// with optional AI help (draft from a description, review, indicative rates, tidy wording).
import React, { useEffect, useMemo, useState } from 'react';
import { ProjectState, BoQItem } from '../types';
import { generateSMM7BoQ, generateSubstructureBoQ } from '../utils/smm7Engine';
import {
  DEFAULT_FIN, DimRow, Fin, SMM7_SECTIONS, TakeoffGroup, UNITS,
  fmt, groupTotal, lineAmount, newGroup, newRow, rowQty, sectionOf, summarise, toCSV, uid,
} from '../utils/smm7Calc';
import {
  AiConfig, AiItem, DEFAULT_MODEL, RateSuggestion, ReviewResult, TidySuggestion,
  aiDraftItems, aiRates, aiReview, aiTidy, hasEnvKey,
} from '../utils/smm7Ai';
import { Empty, Field, Icon, Panel, Rail, Screen, Section, Segmented, StatusBar, Tag, UI, MONO, boxCls, btnDanger, btnGhost, btnPrimary, inputCls } from './ui';

interface Workbook { boq: BoQItem[]; groups: TakeoffGroup[]; fin: Fin; region: string; model: string }
const STORE = 'archpro.smm7.workbook.v1';
const EMPTY: Workbook = { boq: [], groups: [], fin: DEFAULT_FIN, region: '', model: DEFAULT_MODEL };

const load = (): Workbook => {
  try {
    const s = localStorage.getItem(STORE);
    if (!s) return EMPTY;
    const p = JSON.parse(s);
    return { ...EMPTY, ...p, fin: { ...DEFAULT_FIN, ...(p.fin || {}) } };
  } catch { return EMPTY; }
};

const NumInput: React.FC<{ value: number; onChange: (n: number) => void; className?: string }> = ({ value, onChange, className }) => {
  const [txt, setTxt] = useState(String(value));
  useEffect(() => { if (parseFloat(txt) !== value && !(txt === '' && value === 0)) setTxt(String(value)); }, [value]);
  return (
    <input type="text" inputMode="decimal" className={className} value={txt}
      onChange={e => { setTxt(e.target.value); const n = parseFloat(e.target.value); onChange(Number.isFinite(n) ? n : 0); }} />
  );
};

const cellInput = 'w-full bg-transparent border border-transparent hover:border-[#2e333a] focus:border-[#4aa3ff] rounded-[3px] px-1.5 py-1 text-xs focus:outline-none';
const sev = (s: string) => (s === 'error' ? UI.danger : s === 'warn' ? UI.warn : UI.dim);

type Tab = 'generate' | 'takeoff' | 'boq' | 'ai';
interface MeasurementModuleProps { project: ProjectState; onClose: () => void }

export const MeasurementModule: React.FC<MeasurementModuleProps> = ({ project, onClose }) => {
  const [wb, setWb] = useState<Workbook>(load);
  const [tab, setTab] = useState<Tab>('generate');
  const { boq, groups, fin } = wb;

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(wb)); } catch { /* storage unavailable */ } }, [wb]);

  const setBoq = (f: (b: BoQItem[]) => BoQItem[]) => setWb(w => ({ ...w, boq: f(w.boq) }));
  const setGroups = (f: (g: TakeoffGroup[]) => TakeoffGroup[]) => setWb(w => ({ ...w, groups: f(w.groups) }));
  const setFin = (patch: Partial<Fin>) => setWb(w => ({ ...w, fin: { ...w.fin, ...patch } }));
  const updItem = (id: string | undefined, patch: Partial<BoQItem>) => setBoq(b => b.map(i => (i.id === id ? { ...i, ...patch } : i)));
  const summary = useMemo(() => summarise(boq, fin), [boq, fin]);

  // ------------------------------------------------------------ generate from drafting
  const [src, setSrc] = useState<'manual' | 'import'>('manual');
  const [gen, setGen] = useState({
    length: 0, depth: project.settings.foundationDepth / 1000, width: project.settings.trenchWidth / 1000, wallHeight: 0.6, sub: true,
  });
  const [genMsg, setGenMsg] = useState('');
  const hasLayout = !!project.calculatedTrenchLength;

  const runGenerate = () => {
    const length = src === 'manual' ? gen.length : (project.calculatedTrenchLength || 0);
    if (length <= 0) { setGenMsg(src === 'manual' ? 'Enter a trench length above zero.' : 'No drafting data yet. Generate a foundation plan in the Drafting studio first.'); return; }
    const settings = { ...project.settings, foundationDepth: gen.depth * 1000, trenchWidth: gen.width * 1000 };
    let items = generateSMM7BoQ(length, settings);
    if (gen.sub) items = items.concat(generateSubstructureBoQ(length, settings, gen.wallHeight));
    const fresh = items.map(i => ({ ...i, id: uid(), source: 'engine' as const }));
    setBoq(b => [...b.filter(i => i.source !== 'engine'), ...fresh]);
    setGenMsg('');
    setTab('boq');
  };

  // ------------------------------------------------------------ take-off sheets
  const updGroup = (id: string, patch: Partial<TakeoffGroup>) => setGroups(g => g.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const updRow = (gid: string, rid: string, patch: Partial<DimRow>) =>
    setGroups(g => g.map(x => (x.id === gid ? { ...x, rows: x.rows.map(r => (r.id === rid ? { ...r, ...patch } : r)) } : x)));

  const pushGroups = (list: TakeoffGroup[]) => {
    setBoq(b => {
      let next = [...b];
      for (const g of list) {
        const id = 'to-' + g.id;
        const item: BoQItem = { id, code: g.code, description: g.description || '(no description)', quantity: groupTotal(g), unit: g.unit, source: 'takeoff' };
        const at = next.findIndex(i => i.id === id);
        if (at >= 0) next[at] = { ...next[at], ...item }; else next.push(item);
      }
      return next;
    });
  };

  // ------------------------------------------------------------ AI
  const [apiKey, setApiKey] = useState(''); // kept in memory only, never persisted
  const cfg: AiConfig = { apiKey, model: wb.model, currency: fin.currency, region: wb.region };
  const keyOk = !!apiKey || hasEnvKey();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [brief, setBrief] = useState('');
  const [draft, setDraft] = useState<{ items: AiItem[]; assumptions: string[]; pick: boolean[] } | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [rates, setRates] = useState<RateSuggestion[] | null>(null);
  const [tidy, setTidy] = useState<TidySuggestion[] | null>(null);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setErr('');
    try { await fn(); } catch (e: any) { setErr(e?.message || 'The AI request failed.'); } finally { setBusy(''); }
  };
  const toBoq = (a: AiItem): BoQItem => ({ id: uid(), code: a.code, description: a.description, quantity: a.quantity, unit: a.unit, source: 'ai' });

  const doDraft = () => run('draft', async () => {
    const r = await aiDraftItems(cfg, brief, boq);
    setDraft({ items: r.items, assumptions: r.assumptions, pick: r.items.map(i => !i.needsInput) });
  });
  const doReview = () => run('review', async () => setReview(await aiReview(cfg, boq)));
  const doRates = () => run('rates', async () => setRates(await aiRates(cfg, boq)));
  const doTidy = () => run('tidy', async () => setTidy(await aiTidy(cfg, boq)));

  const aiBtn = (label: string, name: string, fn: () => void, needsItems = true) => (
    <button className={btnPrimary} onClick={fn} disabled={!!busy || !keyOk || (needsItems && boq.length === 0) || (name === 'draft' && brief.trim().length < 10)}>
      {busy === name ? 'Working…' : label}
    </button>
  );

  const reset = () => {
    if (window.confirm('Clear the whole SMM7 workbook (BoQ, take-off sheets, pricing)? This cannot be undone.')) setWb({ ...EMPTY, model: wb.model });
  };
  const download = () => {
    if (!boq.length) return;
    const url = URL.createObjectURL(new Blob([toCSV(boq, fin)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `SMM7_BoQ_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ============================================================ views
  const Generate = (
    <div className="max-w-xl mx-auto">
      <h2 className="text-sm font-semibold" style={{ color: '#e6e9ed' }}>Foundation take-off</h2>
      <p className="mt-2 text-xs" style={{ color: UI.dim }}>
        Generates excavation, earthwork support, compaction and concrete from a trench length, plus (optionally) blockwork to DPC, DPC, filling and disposal.
        Items land in the BoQ tab, where you can edit and price them. Running this again replaces the previously generated items only; anything you added by hand is kept.
        References follow this tool's convention, so confirm them against your SMM7 copy before issuing.
      </p>
      <div className={`${boxCls} mt-4 text-xs space-y-1`} style={{ fontFamily: MONO }}>
        <div className="flex justify-between"><span style={{ color: UI.dim }}>Concrete grade</span><span>{project.settings.concreteGrade}</span></div>
        <div className="flex justify-between"><span style={{ color: UI.dim }}>Footing width</span><span>{project.settings.footingWidth / 1000} m</span></div>
        <div className="flex justify-between"><span style={{ color: UI.dim }}>Wall thickness</span><span>{project.settings.wallWidth} mm</span></div>
      </div>
      {genMsg && <div className="mt-3 text-xs" style={{ color: UI.danger }}>{genMsg}</div>}
    </div>
  );

  const Takeoff = (
    <div className="max-w-5xl mx-auto space-y-4">
      {groups.length === 0 && <Empty icon="table" title="No dimension sheets" hint="Add an item, enter times × length × breadth × height, and push the total to the BoQ." />}
      {groups.map(g => (
        <div key={g.id} style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px]">
          <div className="flex items-center gap-2 p-2 border-b" style={{ borderColor: UI.rule }}>
            <input className={`${cellInput} w-24`} style={{ fontFamily: MONO, color: UI.warn }} value={g.code} placeholder="Ref" onChange={e => updGroup(g.id, { code: e.target.value })} />
            <input className={`${cellInput} flex-1`} value={g.description} placeholder="Item description (SMM7 wording)" onChange={e => updGroup(g.id, { description: e.target.value })} />
            <select className={inputCls + ' !w-16'} value={g.unit} onChange={e => updGroup(g.id, { unit: e.target.value })}>{UNITS.map(u => <option key={u}>{u}</option>)}</select>
            <div className="w-28 text-right" style={{ fontFamily: MONO, color: '#e6e9ed' }}>{fmt(groupTotal(g))} {g.unit}</div>
            <button className={btnGhost} onClick={() => { pushGroups([g]); }}>To BoQ</button>
            <button className={btnDanger} title="Delete item" onClick={() => setGroups(l => l.filter(x => x.id !== g.id))}><Icon n="trash" s={13} /></button>
          </div>
          <table className="w-full text-xs">
            <thead style={{ color: UI.dim }}><tr>
              <th className="px-2 py-1.5 text-left font-medium">Note</th>
              <th className="px-2 py-1.5 w-16 text-right font-medium">Nr</th>
              <th className="px-2 py-1.5 w-20 text-right font-medium">Length</th>
              <th className="px-2 py-1.5 w-20 text-right font-medium">Breadth</th>
              <th className="px-2 py-1.5 w-20 text-right font-medium">Height</th>
              <th className="px-2 py-1.5 w-12 text-center font-medium">Deduct</th>
              <th className="px-2 py-1.5 w-24 text-right font-medium">Qty</th><th className="w-8" />
            </tr></thead>
            <tbody>
              {g.rows.map(r => (
                <tr key={r.id} className="border-t" style={{ borderColor: UI.rule }}>
                  <td><input className={cellInput} value={r.note} placeholder="e.g. External walls, grid A–D" onChange={e => updRow(g.id, r.id, { note: e.target.value })} /></td>
                  <td><NumInput className={cellInput + ' text-right font-mono'} value={r.nr} onChange={n => updRow(g.id, r.id, { nr: n })} /></td>
                  <td><NumInput className={cellInput + ' text-right font-mono'} value={r.l} onChange={n => updRow(g.id, r.id, { l: n })} /></td>
                  <td><NumInput className={cellInput + ' text-right font-mono'} value={r.b} onChange={n => updRow(g.id, r.id, { b: n })} /></td>
                  <td><NumInput className={cellInput + ' text-right font-mono'} value={r.h} onChange={n => updRow(g.id, r.id, { h: n })} /></td>
                  <td className="text-center"><input type="checkbox" checked={r.deduct} onChange={e => updRow(g.id, r.id, { deduct: e.target.checked })} /></td>
                  <td className="px-2 text-right" style={{ fontFamily: MONO, color: r.deduct ? UI.danger : UI.text }}>{fmt(rowQty(r))}</td>
                  <td><button title="Remove row" style={{ color: UI.dim }} onClick={() => updGroup(g.id, { rows: g.rows.length > 1 ? g.rows.filter(x => x.id !== r.id) : g.rows })}><Icon n="close" s={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-2 border-t" style={{ borderColor: UI.rule }}>
            <button className={btnGhost} onClick={() => updGroup(g.id, { rows: [...g.rows, newRow()] })}>Add row</button>
          </div>
        </div>
      ))}
    </div>
  );

  const sectionsPresent = SMM7_SECTIONS.filter(s => boq.some(i => sectionOf(i) === s.id));
  const Boq = boq.length === 0 ? (
    <Empty icon="measure" title="The bill of quantities is empty" hint="Generate foundation items, push take-off sheets, add a line by hand, or ask the AI assistant to draft items." />
  ) : (
    <div className="max-w-6xl mx-auto">
      <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] overflow-x-auto">
        <table className="w-full text-xs">
          <thead style={{ color: UI.dim }} className="border-b"><tr style={{ borderColor: UI.rule }}>
            <th className="px-2 py-2 w-24 text-left font-medium">Ref</th><th className="px-2 py-2 text-left font-medium">Description</th>
            <th className="px-2 py-2 w-24 text-right font-medium">Quantity</th><th className="px-2 py-2 w-16 font-medium text-left">Unit</th>
            <th className="px-2 py-2 w-24 text-right font-medium">Rate</th><th className="px-2 py-2 w-28 text-right font-medium">Amount</th><th className="w-16" /><th className="w-8" />
          </tr></thead>
          <tbody>
            {sectionsPresent.map(s => (
              <React.Fragment key={s.id}>
                <tr style={{ background: UI.raised }}><td colSpan={8} className="px-2 py-1.5 font-semibold" style={{ color: UI.accent }}>{s.id} · {s.name}</td></tr>
                {boq.filter(i => sectionOf(i) === s.id).map(i => (
                  <tr key={i.id} className="border-t align-top" style={{ borderColor: UI.rule }}>
                    <td><input className={cellInput} style={{ fontFamily: MONO, color: UI.warn }} value={i.code} onChange={e => updItem(i.id, { code: e.target.value })} /></td>
                    <td><textarea rows={2} className={cellInput + ' resize-y'} value={i.description} onChange={e => updItem(i.id, { description: e.target.value })} /></td>
                    <td><NumInput className={cellInput + ' text-right font-mono'} value={i.quantity} onChange={n => updItem(i.id, { quantity: n })} /></td>
                    <td><select className={cellInput} value={i.unit} onChange={e => updItem(i.id, { unit: e.target.value })}>{(UNITS.includes(i.unit) ? UNITS : [...UNITS, i.unit]).map(u => <option key={u}>{u}</option>)}</select></td>
                    <td><NumInput className={cellInput + ' text-right font-mono'} value={i.rate ?? 0} onChange={n => updItem(i.id, { rate: n })} /></td>
                    <td className="px-2 py-2 text-right" style={{ fontFamily: MONO, color: '#e6e9ed' }}>{i.rate ? fmt(lineAmount(i)) : '–'}</td>
                    <td className="py-2">{i.source && i.source !== 'manual' && <Tag tone={i.source === 'ai' ? 'warn' : 'dim'}>{i.source}</Tag>}</td>
                    <td className="py-2"><button title="Delete line" style={{ color: UI.dim }} onClick={() => setBoq(b => b.filter(x => x.id !== i.id))}><Icon n="trash" s={13} /></button></td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px]" style={{ color: UI.dim }}>{boq.length} items · saved in this browser · Items tagged “ai” are drafts; check them before issuing.</div>
    </div>
  );

  const Ai = (
    <div className="max-w-3xl mx-auto space-y-5">
      {!keyOk && <div className={boxCls + ' text-xs'} style={{ color: UI.warn }}>No Gemini API key found. Paste one in the panel on the right (kept in memory only), or set GEMINI_API_KEY in .env.local and restart.</div>}
      {err && <div className={boxCls + ' text-xs'} style={{ color: UI.danger }}>{err}</div>}

      <div className={boxCls}>
        <div className="text-xs font-semibold mb-1" style={{ color: '#e6e9ed' }}>1 · Draft items from a description</div>
        <p className="text-[11px] mb-2" style={{ color: UI.dim }}>Include the dimensions. Quantities the AI cannot work out from them are returned as 0 and flagged for you to fill in.</p>
        <textarea rows={4} className={inputCls + ' !font-sans'} value={brief} onChange={e => setBrief(e.target.value)}
          placeholder="e.g. Single-storey 8m × 6m house, 225mm blockwork walls 2.7m high, 150mm concrete ground slab on 150mm hardcore, 1 external door 0.9×2.1m and 4 windows 1.2×1.2m." />
        <div className="mt-2">{aiBtn('Draft items', 'draft', doDraft, false)}</div>
        {draft && (
          <div className="mt-3 space-y-2">
            {draft.assumptions.length > 0 && <div className="text-[11px]" style={{ color: UI.dim }}>Assumptions: {draft.assumptions.join(' · ')}</div>}
            {draft.items.length === 0 && <div className="text-xs" style={{ color: UI.dim }}>Nothing was proposed.</div>}
            {draft.items.map((a, k) => (
              <label key={k} className="flex gap-2 text-xs items-start border-t pt-2" style={{ borderColor: UI.rule }}>
                <input type="checkbox" className="mt-0.5" checked={draft.pick[k]} onChange={e => setDraft({ ...draft, pick: draft.pick.map((p, j) => (j === k ? e.target.checked : p)) })} />
                <span className="flex-1">
                  <span style={{ fontFamily: MONO, color: UI.warn }}>{a.code}</span> {a.description}
                  <span className="block" style={{ color: UI.dim }}>{a.needsInput ? 'Needs input · ' : ''}{a.rationale}</span>
                </span>
                <span style={{ fontFamily: MONO }}>{a.quantity} {a.unit}</span>
              </label>
            ))}
            {draft.items.length > 0 && (
              <button className={btnPrimary} onClick={() => { setBoq(b => [...b, ...draft.items.filter((_, k) => draft.pick[k]).map(toBoq)]); setDraft(null); setTab('boq'); }}>
                Add {draft.pick.filter(Boolean).length} selected to BoQ
              </button>
            )}
          </div>
        )}
      </div>

      <div className={boxCls}>
        <div className="text-xs font-semibold mb-1" style={{ color: '#e6e9ed' }}>2 · Review the BoQ</div>
        <p className="text-[11px] mb-2" style={{ color: UI.dim }}>Flags wrong units, missing qualifiers, misfiled sections, duplicates and likely omissions.</p>
        {aiBtn('Review bill of quantities', 'review', doReview)}
        {review && (
          <div className="mt-3 space-y-2">
            {review.issues.length === 0 && review.missing.length === 0 && <div className="text-xs" style={{ color: UI.ok }}>No issues raised.</div>}
            {review.issues.map((x, k) => (
              <div key={k} className="text-xs border-t pt-2" style={{ borderColor: UI.rule }}>
                <span className="mr-2"><Tag tone={x.severity === 'info' ? 'dim' : 'warn'}>{x.severity}</Tag></span>
                <span style={{ fontFamily: MONO, color: sev(x.severity) }}>{x.ref}</span> {x.message}
                {x.suggestion && <div style={{ color: UI.dim }}>Suggestion: {x.suggestion}</div>}
              </div>
            ))}
            {review.missing.length > 0 && <div className="text-xs font-semibold pt-1">Possibly omitted</div>}
            {review.missing.map((a, k) => (
              <div key={k} className="flex gap-2 text-xs items-start border-t pt-2" style={{ borderColor: UI.rule }}>
                <span className="flex-1"><span style={{ fontFamily: MONO, color: UI.warn }}>{a.code}</span> {a.description}<span className="block" style={{ color: UI.dim }}>{a.rationale}</span></span>
                <span style={{ fontFamily: MONO }}>{a.quantity} {a.unit}</span>
                <button className={btnGhost} onClick={() => { setBoq(b => [...b, toBoq(a)]); setReview(r => r && { ...r, missing: r.missing.filter(m => m !== a) }); }}>Add</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={boxCls}>
        <div className="text-xs font-semibold mb-1" style={{ color: '#e6e9ed' }}>3 · Indicative rates</div>
        <p className="text-[11px] mb-2" style={{ color: UI.dim }}>Rough budget figures for items without a rate, in {fin.currency}{wb.region ? `, ${wb.region}` : ''}. These are model estimates, not market-tested prices.</p>
        {aiBtn('Suggest rates', 'rates', doRates)}
        {rates && (
          <div className="mt-3 space-y-1">
            {rates.length === 0 && <div className="text-xs" style={{ color: UI.dim }}>No rates proposed (every item may already be priced).</div>}
            {rates.map(r => { const it = boq.find(i => i.id === r.id); return (
              <div key={r.id} className="flex gap-2 text-xs border-t pt-1" style={{ borderColor: UI.rule }}>
                <span style={{ fontFamily: MONO, color: UI.warn }}>{it?.code}</span><span className="flex-1">{it?.description.slice(0, 70)}<span className="block" style={{ color: UI.dim }}>{r.note}</span></span>
                <span style={{ fontFamily: MONO }}>{fmt(r.rate)}/{it?.unit}</span>
              </div>); })}
            {rates.length > 0 && <button className={btnPrimary + ' mt-2'} onClick={() => { setBoq(b => b.map(i => { const r = rates.find(x => x.id === i.id); return r && !i.rate ? { ...i, rate: r.rate } : i; })); setRates(null); }}>Apply rates</button>}
          </div>
        )}
      </div>

      <div className={boxCls}>
        <div className="text-xs font-semibold mb-1" style={{ color: '#e6e9ed' }}>4 · Tidy descriptions</div>
        <p className="text-[11px] mb-2" style={{ color: UI.dim }}>Rewrites wording into consistent SMM7 style. Dimensions and grades are preserved; you approve before anything changes.</p>
        {aiBtn('Tidy descriptions', 'tidy', doTidy)}
        {tidy && (
          <div className="mt-3 space-y-2">
            {tidy.length === 0 && <div className="text-xs" style={{ color: UI.dim }}>Nothing to change.</div>}
            {tidy.map(t => (
              <div key={t.id} className="text-xs border-t pt-2" style={{ borderColor: UI.rule }}>
                <div style={{ color: UI.dim, textDecoration: 'line-through' }}>{t.before}</div><div>{t.after}</div>
              </div>
            ))}
            {tidy.length > 0 && <button className={btnPrimary} onClick={() => { setBoq(b => b.map(i => { const t = tidy.find(x => x.id === i.id); return t ? { ...i, description: t.after } : i; })); setTidy(null); }}>Apply {tidy.length} changes</button>}
          </div>
        )}
      </div>
    </div>
  );

  const Summary = (
    <Section title="Summary">
      <div className="text-xs space-y-1" style={{ fontFamily: MONO }}>
        {summary.bySection.map(s => (
          <div key={s.id} className="flex justify-between gap-2"><span style={{ color: UI.dim }}>{s.id} · {s.name.split(' / ')[0]}</span><span>{fmt(s.amount)}</span></div>
        ))}
        <div className="flex justify-between border-t pt-1" style={{ borderColor: UI.rule }}><span>Subtotal</span><span>{fmt(summary.subtotal)}</span></div>
        <div className="flex justify-between"><span style={{ color: UI.dim }}>Preliminaries</span><span>{fmt(summary.prelims)}</span></div>
        <div className="flex justify-between"><span style={{ color: UI.dim }}>Contingency</span><span>{fmt(summary.contingency)}</span></div>
        <div className="flex justify-between"><span style={{ color: UI.dim }}>Overheads & profit</span><span>{fmt(summary.ohp)}</span></div>
        <div className="flex justify-between border-t pt-1 text-sm" style={{ borderColor: UI.rule, color: '#e6e9ed' }}><span>Total {fin.currency}</span><span>{fmt(summary.total)}</span></div>
      </div>
    </Section>
  );

  const Pricing = (
    <Section title="Pricing">
      <Field label="Currency"><input className={inputCls} value={fin.currency} onChange={e => setFin({ currency: e.target.value.toUpperCase().slice(0, 4) })} /></Field>
      <Field label="Preliminaries (%)"><NumInput className={inputCls} value={fin.prelimsPct} onChange={n => setFin({ prelimsPct: n })} /></Field>
      <Field label="Contingency (%)" hint="Applied after preliminaries"><NumInput className={inputCls} value={fin.contingencyPct} onChange={n => setFin({ contingencyPct: n })} /></Field>
      <Field label="Overheads & profit (%)"><NumInput className={inputCls} value={fin.ohpPct} onChange={n => setFin({ ohpPct: n })} /></Field>
    </Section>
  );

  const side = tab === 'generate' ? (
    <>
      <Section title="Source">
        <Segmented value={src} onChange={id => setSrc(id as 'manual' | 'import')} options={[{ id: 'manual', label: 'Manual' }, { id: 'import', label: 'From drafting' }]} />
        {src === 'manual' ? (
          <Field label="Total trench length (m)"><NumInput className={inputCls} value={gen.length} onChange={n => setGen({ ...gen, length: n })} /></Field>
        ) : (
          <div className={boxCls}>
            <div className="text-xs" style={{ color: UI.dim }}>Net trench length</div>
            {hasLayout
              ? <div className="mt-1 text-2xl" style={{ fontFamily: MONO, color: '#e6e9ed' }}>{project.calculatedTrenchLength!.toFixed(2)}<span className="text-sm" style={{ color: UI.dim }}> m</span></div>
              : <div className="mt-1 font-semibold" style={{ color: UI.danger }}>No data yet</div>}
          </div>
        )}
      </Section>
      <Section title="Dimensions">
        <Field label="Average depth (m)"><NumInput className={inputCls} value={gen.depth} onChange={n => setGen({ ...gen, depth: n })} /></Field>
        <Field label="Trench width (m)"><NumInput className={inputCls} value={gen.width} onChange={n => setGen({ ...gen, width: n })} /></Field>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={gen.sub} onChange={e => setGen({ ...gen, sub: e.target.checked })} />Include blockwork, DPC, filling and disposal</label>
        {gen.sub && <Field label="Wall height, concrete to DPC (m)"><NumInput className={inputCls} value={gen.wallHeight} onChange={n => setGen({ ...gen, wallHeight: n })} /></Field>}
        <button className={btnPrimary + ' w-full'} onClick={runGenerate}>Generate items</button>
      </Section>
    </>
  ) : tab === 'takeoff' ? (
    <Section title="Take-off">
      <p className="text-[11px]" style={{ color: UI.dim }}>Quantity = Nr × every dimension you fill in. Leave a dimension at 0 if it does not apply. Tick Deduct for voids and openings.</p>
      <button className={btnPrimary + ' w-full'} onClick={() => setGroups(g => [...g, newGroup()])}>Add item</button>
      <button className={btnGhost + ' w-full'} disabled={!groups.length} onClick={() => pushGroups(groups)}>Sync all to BoQ</button>
    </Section>
  ) : tab === 'boq' ? (
    <>
      <Section title="Lines">
        <button className={btnPrimary + ' w-full'} onClick={() => setBoq(b => [...b, { id: uid(), code: 'Z', description: '', quantity: 0, unit: 'm2', source: 'manual' }])}>Add line</button>
      </Section>
      {Summary}{Pricing}
    </>
  ) : (
    <>
      <Section title="Gemini">
        <Field label="API key" hint={hasEnvKey() ? 'Using GEMINI_API_KEY from .env.local unless you enter one here.' : 'Held in memory for this session only.'}>
          <input type="password" autoComplete="off" className={inputCls} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={hasEnvKey() ? '(from .env.local)' : 'AI…'} />
        </Field>
        <Field label="Model"><input className={inputCls} value={wb.model} onChange={e => setWb(w => ({ ...w, model: e.target.value }))} /></Field>
        <Field label="Region (for rates)"><input className={inputCls} value={wb.region} onChange={e => setWb(w => ({ ...w, region: e.target.value }))} placeholder="e.g. Greater Accra, Ghana" /></Field>
        <Field label="Currency"><input className={inputCls} value={fin.currency} onChange={e => setFin({ currency: e.target.value.toUpperCase().slice(0, 4) })} /></Field>
      </Section>
      <Section title="Privacy">
        <p className="text-[11px]" style={{ color: UI.dim }}>Item text and quantities from your BoQ are sent to Google’s Gemini API when you run an AI action. Nothing is sent otherwise.</p>
      </Section>
    </>
  );

  return (
    <Screen crumb="Measurement / SMM7" onHome={onClose} actions={
      <>
        <button onClick={reset} className={btnGhost}>Reset</button>
        <button onClick={download} disabled={!boq.length} className={btnGhost}><span className="inline-flex items-center gap-1.5"><Icon n="download" s={14} />Export CSV</span></button>
      </>
    }>
      <div className="flex-1 flex min-h-0">
        <Rail value={tab} onChange={id => setTab(id as Tab)} items={[
          { id: 'generate', icon: 'drawings', label: 'Generate from drafting' },
          { id: 'takeoff', icon: 'table', label: 'Take-off sheets' },
          { id: 'boq', icon: 'measure', label: 'Bill of quantities' },
          { id: 'ai', icon: 'tool', label: 'AI assistant' },
        ]} />
        <main className="flex-1 min-w-0 overflow-auto p-6" style={{ background: UI.bg }}>
          {tab === 'generate' ? Generate : tab === 'takeoff' ? Takeoff : tab === 'boq' ? Boq : Ai}
        </main>
        <Panel width={tab === 'boq' ? 'w-80' : 'w-72'}>{side}</Panel>
      </div>
      <StatusBar
        left={<span style={{ color: UI.text }}>{{ generate: 'Generate', takeoff: 'Take-off sheets', boq: 'Bill of quantities', ai: 'AI assistant' }[tab]}</span>}
        right={<span>{boq.length} items · {fin.currency} {fmt(summary.total)}</span>}
      />
    </Screen>
  );
};
