// components/measurement/AiPanel.tsx — read drawings (image or PDF) with a Groq vision model and review the result before it is used.
import React, { useRef, useState } from 'react';
import { BoqState } from './useBoqState';
import { Card, Check, Lbl, Select, TextInput } from './fields';
import { Empty, Tag, UI, MONO, btnGhost, btnPrimary, inputCls } from '../ui';
import { AiExtraction, DEFAULT_GROQ_MODEL, analyseDrawing, applyExtraction, listGroqModels, mergeExtractions } from '../../utils/boq/ai';
import { rasterizeForAi } from '../../utils/boq/rasterize';

const K_KEY = 'archpro.groqKey', K_MODEL = 'archpro.groqModel';
const lsGet = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const lsSet = (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage blocked */ } };
const MAX_PAGES = 4;

export const AiPanel: React.FC<{ s: BoqState; onApplied: () => void }> = ({ s, onApplied }) => {
  const [key, setKey] = useState(lsGet(K_KEY));
  const [remember, setRemember] = useState(!!lsGet(K_KEY));
  const [model, setModel] = useState(lsGet(K_MODEL) || DEFAULT_GROQ_MODEL);
  const [models, setModels] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<AiExtraction | null>(null);
  const [raw, setRaw] = useState<string[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [applied, setApplied] = useState('');
  const abort = useRef<AbortController | null>(null);

  const saveKey = (k: string, r = remember) => { setKey(k); lsSet(K_KEY, r ? k : ''); };
  const saveModel = (m: string) => { setModel(m); lsSet(K_MODEL, m); };

  const loadModels = async () => {
    setError('');
    try { const l = await listGroqModels(key.trim()); setModels(l); if (!l.includes(model)) setError('The selected model is not in your Groq model list. Pick a vision-capable model (Llama 4 Scout or Maverick, if listed).'); }
    catch (e) { setError((e as Error).message); }
  };

  const run = async () => {
    if (!key.trim()) { setError('Enter your Groq API key first.'); return; }
    if (!file) { setError('Choose a drawing (PNG, JPG or PDF).'); return; }
    setBusy(true); setError(''); setResult(null); setRaw([]); setThumbs([]); setApplied('');
    const ctl = new AbortController(); abort.current = ctl;
    const results: AiExtraction[] = []; const raws: string[] = []; const imgs: string[] = [];
    try {
      let last = Math.min(Math.max(from, to), from + MAX_PAGES - 1);
      for (let p = from; p <= last; p++) {
        setProgress(`Preparing page ${p}…`);
        const img = await rasterizeForAi(file, p);
        last = Math.min(last, img.numPages);
        if (p > img.numPages) break;
        imgs.push(img.dataUrl); setThumbs([...imgs]);
        setProgress(`Reading page ${p} of ${last}…`);
        const { extraction, raw: r } = await analyseDrawing({ apiKey: key.trim(), model, imageDataUrl: img.dataUrl, hint, signal: ctl.signal });
        results.push(extraction); raws.push(r);
      }
      setResult(mergeExtractions(results)); setRaw(raws);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      if (results.length) { setResult(mergeExtractions(results)); setRaw(raws); }
    } finally { setBusy(false); setProgress(''); abort.current = null; }
  };

  const apply = (mode: 'replace' | 'add') => {
    if (!result) return;
    const out = applyExtraction(result, s.model, s.assumptions, mode);
    s.setModel(out.model); s.setAssumptions(out.assumptions);
    setApplied(`Applied: ${out.summary.join(', ') || 'nothing usable was found'}. Review it on the Schedule tab before relying on the bill.`);
    onApplied();
  };

  return (
    <div className="max-w-4xl mx-auto grid gap-3">
      <div className="border rounded-[3px] p-3 text-xs" style={{ borderColor: UI.rule, background: UI.raised, color: UI.dim }}>
        The AI <b style={{ color: UI.text }}>reads</b> printed dimensions, door and window schedules, room labels and notes from the drawing. It does not measure by scale and it can misread. Everything it returns is checked,
        shown here for review, and only enters the bill when you apply it. Check the Schedule tab afterwards. Pages are sent to Groq (api.groq.com); your key stays in this browser.
      </div>
      <Card title="Groq connection">
        <Lbl label="API key"><TextInput type="password" value={key} onChange={v => saveKey(v)} placeholder="gsk_…" /></Lbl>
        <Lbl label="Model" hint="Needs a vision model. Use Check key to list what your account offers.">
          {models.length ? <Select value={model} onChange={saveModel} options={models.map(m => [m, m] as [string, string])} /> : <TextInput value={model} onChange={saveModel} />}
        </Lbl>
        <Check checked={remember} onChange={r => { setRemember(r); lsSet(K_KEY, r ? key : ''); }} label="Remember the key on this device" />
        <div><button className={btnGhost} onClick={loadModels} disabled={!key.trim()}>Check key and list models</button></div>
      </Card>
      <Card title="Drawing">
        <Lbl label="File (PNG, JPG or PDF)">
          <input type="file" accept="image/*,application/pdf" className={inputCls} onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); setResult(null); setApplied(''); setFrom(1); setTo(1); }} />
        </Lbl>
        <div className="grid grid-cols-2 gap-2">
          <Lbl label="From page"><input type="number" min={1} className={inputCls} value={from} onChange={e => { const n = Math.max(1, parseInt(e.target.value) || 1); setFrom(n); if (to < n) setTo(n); }} /></Lbl>
          <Lbl label={`To page (max ${MAX_PAGES} at a time)`}><input type="number" min={from} className={inputCls} value={to} onChange={e => setTo(Math.max(from, parseInt(e.target.value) || from))} /></Lbl>
        </div>
        <div className="col-span-2"><Lbl label="Hint (optional)" hint="Example: ground floor plan, dimensions in mm, sandcrete blocks, 3 m floor height."><TextInput value={hint} onChange={setHint} /></Lbl></div>
        <div className="col-span-2 flex items-center gap-2">
          <button className={btnPrimary} onClick={run} disabled={busy}>{busy ? 'Reading…' : 'Read drawing'}</button>
          {busy && <button className={btnGhost} onClick={() => abort.current?.abort()}>Stop</button>}
          <span className="text-xs" style={{ color: UI.dim }}>{progress}</span>
        </div>
      </Card>
      {error && <div className="text-xs border rounded-[3px] p-2" style={{ borderColor: UI.danger + '88', color: UI.danger }}>{error}</div>}
      {thumbs.length > 0 && <div className="flex gap-2 overflow-x-auto">{thumbs.map((t, i) => <img key={i} src={t} alt={`page ${from + i}`} className="h-28 border rounded-[3px]" style={{ borderColor: UI.rule, background: '#fff' }} />)}</div>}

      {result ? (
        <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] p-3 text-xs space-y-3">
          <div className="flex items-center gap-2"><span className="font-semibold" style={{ color: '#e6e9ed' }}>What the AI read</span><Tag tone="warn">review</Tag><Tag>{result.drawingType}</Tag>{result.scale && <Tag>{result.scale}</Tag>}</div>
          {result.warnings.length > 0 && <ul className="space-y-1" style={{ color: UI.warn }}>{result.warnings.map((w, i) => <li key={i}>• {w}</li>)}</ul>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div style={{ color: UI.dim }}>Overall and levels</div>
              <div style={{ fontFamily: MONO }}>
                {result.overall.lengthM && result.overall.widthM ? `${result.overall.lengthM} x ${result.overall.widthM} m external` : 'overall size: not read'}<br />
                storeys {result.floors ?? '-'} · floor height {result.heights.floorHeightMm ?? '-'} mm · plinth {result.heights.plinthMm ?? '-'} mm · foundation depth {result.heights.foundationDepthMm ?? '-'} mm
              </div>
              <div className="mt-2" style={{ color: UI.dim }}>Walls ({result.walls.length})</div>
              <div style={{ fontFamily: MONO }}>{result.walls.length ? result.walls.map(w => `${w.kind === 'external' ? 'E' : 'I'} ${w.lengthM} m`).join(' · ') : 'none dimensioned'}</div>
              <div className="mt-2" style={{ color: UI.dim }}>Rooms ({result.rooms.length})</div>
              <div style={{ fontFamily: MONO }}>{result.rooms.map(r => `${r.name}${r.areaM2 ? ` ${r.areaM2} m2` : r.lengthM && r.widthM ? ` ${r.lengthM}x${r.widthM}` : ''}`).join(' · ') || 'none'}</div>
            </div>
            <div>
              <div style={{ color: UI.dim }}>Doors ({result.doors.reduce((n, o) => n + o.count, 0)})</div>
              <div style={{ fontFamily: MONO }}>{result.doors.map(o => `${o.mark} ${o.widthMm}x${o.heightMm ?? '?'} ×${o.count}`).join(' · ') || 'none'}</div>
              <div className="mt-2" style={{ color: UI.dim }}>Windows ({result.windows.reduce((n, o) => n + o.count, 0)})</div>
              <div style={{ fontFamily: MONO }}>{result.windows.map(o => `${o.mark} ${o.widthMm}x${o.heightMm ?? '?'} ×${o.count}`).join(' · ') || 'none'}</div>
              {result.specs.length > 0 && <><div className="mt-2" style={{ color: UI.dim }}>Notes that affect pricing</div><ul>{result.specs.map((x, i) => <li key={i}>• {x}</li>)}</ul></>}
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button className={btnPrimary} onClick={() => apply('replace')}>Apply, replacing plan and AI rows</button>
            <button className={btnGhost} onClick={() => apply('add')}>Add to schedule</button>
            <span style={{ color: UI.dim }}>Values you typed yourself are never replaced.</span>
          </div>
          {applied && <div style={{ color: UI.ok }}>{applied}</div>}
          <details><summary className="cursor-pointer" style={{ color: UI.dim }}>Raw model reply</summary><pre className="mt-1 whitespace-pre-wrap text-[11px]" style={{ fontFamily: MONO, color: UI.dim }}>{raw.join('\n\n---\n\n')}</pre></details>
        </div>
      ) : !busy && !error && <Empty icon="spark" title="Read a drawing" hint="Add your Groq key, choose a floor plan or door and window schedule, and the quantities it can read land here for review." />}
    </div>
  );
};
