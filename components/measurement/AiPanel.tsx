// components/measurement/AiPanel.tsx — read drawings (image or PDF) with a free AI model and review the result before it is used.
import React, { useRef, useState } from 'react';
import { BoqState } from './useBoqState';
import { Card, Check, Lbl, Select, TextInput } from './fields';
import { Empty, Tag, UI, MONO, btnGhost, btnPrimary, inputCls, tint } from '../ui';
import { AiExtraction, DEFAULT_MODEL, Provider, resolveModel, analyseGemini, analyseText, applyExtraction, listGeminiModels, listGroqModels, mergeExtractions, testProvider } from '../../utils/boq/ai';
import { readPageText } from '../../utils/boq/textRead';
import { rasterizeForAi } from '../../utils/boq/rasterize';
import { DrawingMeta } from '../../utils/drawings/types';
import { getDrawingBlob, listDrawings, subscribe } from '../../utils/drawings/store';

const K_PROV = 'archpro.aiProvider';
const kKey = (p: Provider) => (p === 'gemini' ? 'archpro.geminiKey' : 'archpro.groqKey'), kModel = (p: Provider) => (p === 'gemini' ? 'archpro.geminiModel2' : 'archpro.groqTextModel');
const lsGet = (k: string) => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const lsSet = (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage blocked */ } };
const MAX_PAGES = 4;

export const AiPanel: React.FC<{ s: BoqState; onApplied: () => void; onEstimate?: () => void; initialDrawing?: DrawingMeta | null }> = ({ s, onApplied, onEstimate, initialDrawing }) => {
  const [provider, setProvider] = useState<Provider>(lsGet(K_PROV) === 'groq-text' ? 'groq-text' : 'gemini');
  const [key, setKey] = useState(lsGet(kKey(provider)));
  const [remember, setRemember] = useState(!!lsGet(kKey(provider)));
  const [model, setModel] = useState(resolveModel(provider, lsGet(kModel(provider))));
  const changeProvider = (p: Provider) => { setProvider(p); lsSet(K_PROV, p); setKey(lsGet(kKey(p))); setRemember(!!lsGet(kKey(p))); setModel(resolveModel(p, lsGet(kModel(p)))); setModels([]); setTest(''); setError(''); };
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
  const [usedModel, setUsedModel] = useState('');
  const abort = useRef<AbortController | null>(null);
  const [stored, setStored] = useState<DrawingMeta[]>([]);
  const [storedId, setStoredId] = useState('');
  React.useEffect(() => { const load = () => listDrawings().then(setStored).catch(() => undefined); load(); return subscribe(load); }, []);
  const pickStored = async (id: string) => {
    setStoredId(id); if (!id) return;
    const m = stored.find(d => d.id === id); if (!m) return;
    try { const b = await getDrawingBlob(m); setFile(new File([b], `${m.ref}.${m.mime.includes('svg') ? 'svg' : m.mime.includes('pdf') ? 'pdf' : m.mime.includes('png') ? 'png' : 'jpg'}`, { type: m.mime })); setResult(null); setApplied(''); setFrom(1); setTo(1); setError(''); }
    catch (e) { setError((e as Error).message); }
  };
  React.useEffect(() => { if (initialDrawing && stored.some(d => d.id === initialDrawing.id)) pickStored(initialDrawing.id); }, [initialDrawing?.id, stored.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveKey = (k: string, r = remember) => { setKey(k); lsSet(kKey(provider), r ? k : ''); };
  const saveModel = (m: string) => { setModel(m); lsSet(kModel(provider), m); };

  const loadModels = async () => {
    setError('');
    try { const l = provider === 'gemini' ? await listGeminiModels(key.trim()) : await listGroqModels(key.trim()); setModels(l); if (!l.includes(model)) setError('The selected model is not in your model list. Pick one from the list.'); }
    catch (e) { setError((e as Error).message); }
  };

  const [test, setTest] = useState('');
  const [auto, setAuto] = useState(true);
  const runTest = async () => {
    setTest('Testing with your key…'); setError('');
    try { const r = await testProvider(provider, key.trim(), model); setTest((r.ok ? 'OK: ' : 'Failed: ') + r.message); if (r.ok && r.modelUsed !== model) saveModel(r.modelUsed); }
    catch (e) { setTest('Failed: ' + (e as Error).message); }
  };

  const run = async () => {
    if (!key.trim()) { setError(provider === 'gemini' ? 'Enter your Google AI Studio key first.' : 'Enter your Groq API key first.'); return; }
    if (!file) { setError('Choose a drawing (PNG, JPG or PDF).'); return; }
    setBusy(true); setError(''); setResult(null); setRaw([]); setThumbs([]); setApplied('');
    const ctl = new AbortController(); abort.current = ctl;
    const results: AiExtraction[] = []; const raws: string[] = []; const imgs: string[] = [];
    try {
      let last = Math.min(Math.max(from, to), from + MAX_PAGES - 1);
      for (let p = from; p <= last; p++) {
        let out: { extraction: AiExtraction; raw: string; modelUsed: string };
        if (provider === 'gemini') {
          setProgress(`Preparing page ${p}…`);
          const img = await rasterizeForAi(file, p);
          last = Math.min(last, img.numPages);
          if (p > img.numPages) break;
          imgs.push(img.dataUrl); setThumbs([...imgs]);
          setProgress(`Reading page ${p} of ${last} with Gemini…`);
          out = await analyseGemini({ apiKey: key.trim(), model, imageDataUrl: img.dataUrl, hint, signal: ctl.signal });
        } else {
          setProgress(`Extracting text from page ${p}…`);
          const pt = await readPageText(file, p, setProgress);
          last = Math.min(last, pt.numPages);
          if (p > pt.numPages) break;
          if (pt.chars < 40) { setError(`Page ${p}: almost no text could be read (${pt.method}). Use a clearer export, or switch to the Gemini route which reads the image.`); continue; }
          setProgress(`Page ${p}: ${pt.chars} characters via ${pt.method === 'pdf-text' ? 'PDF text' : 'OCR'}, structuring with ${model}…`);
          out = await analyseText({ apiKey: key.trim(), model, pageText: pt.text, hint, signal: ctl.signal });
          raws.push(`--- text read from page ${p} (${pt.method}) ---\n${pt.text.slice(0, 4000)}\n\n--- model reply ---`);
        }
        const { extraction, raw: r, modelUsed } = out;
        results.push(extraction); raws.push(r);
        if (modelUsed !== model) { setUsedModel(modelUsed); saveModel(modelUsed); }
      }
      const merged = mergeExtractions(results); setResult(merged); setRaw(raws);
      if (auto && results.length) { const out = applyExtraction(merged, s.model, s.assumptions, 'replace'); s.setModel(out.model); s.setAssumptions(out.assumptions); onEstimate?.(); }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      if (results.length) { setResult(mergeExtractions(results)); setRaw(raws); }
    } finally { setBusy(false); setProgress(''); abort.current = null; }
  };

  const apply = (mode: 'replace' | 'add') => {
    if (!result) return;
    const out = applyExtraction(result, s.model, s.assumptions, mode);
    s.setModel(out.model); s.setAssumptions(out.assumptions);
    setApplied(`Applied: ${out.summary.join(', ') || 'nothing usable was found'}. Review it in the Quantities step before relying on the bill.`);
    onApplied();
  };

  return (
    <div className="max-w-5xl mx-auto grid gap-3">
      <div className="rounded-[var(--ui-r)] p-3 text-xs" style={{ background: UI.raised, color: UI.dim }}>
        The AI <b style={{ color: UI.text }}>reads</b> printed dimensions, door and window schedules, room labels and notes from the drawing. It does not measure by scale and it can misread. Everything it returns is checked,
        shown here for review, and only enters the bill when you apply it. Check the Quantities step afterwards. Your key stays in this browser. Gemini route: pages go to Google. Text route: only the extracted text goes to Groq.
      </div>
      <Card title="AI connection (free options)">
        <Lbl label="How should the drawing be read?" hint={provider === 'gemini' ? 'Sends the page image to Google Gemini. Free tier, no card needed. Free-tier content may be used by Google, so avoid confidential drawings.' : 'No image is sent. Text is pulled from the PDF (or OCR in your browser for scans) and a free Groq text model turns it into the schedule. Best for PDFs from CAD or the Drafting Studio.'}>
          <Select value={provider} onChange={v => changeProvider(v as Provider)} options={[['gemini', 'Gemini free tier: reads the image or PDF page'], ['groq-text', 'Groq text model: reads extracted text (no vision needed)']] as [string, string][]} />
        </Lbl>
        <Lbl label={provider === 'gemini' ? 'Google AI Studio key' : 'Groq API key'}><TextInput type="password" value={key} onChange={v => saveKey(v)} placeholder={provider === 'gemini' ? 'AIza…  (aistudio.google.com/apikey)' : 'gsk_…'} /></Lbl>
        <Lbl label="Model" hint={`Default: ${DEFAULT_MODEL[provider]}. Use Check key to list what your account offers, and pick a free one.`}>
          {models.length ? <Select value={model} onChange={saveModel} options={models.map(m => [m, m] as [string, string])} /> : <TextInput value={model} onChange={saveModel} />}
        </Lbl>
        <Check checked={remember} onChange={r => { setRemember(r); lsSet(kKey(provider), r ? key : ''); }} label="Remember the key on this device" />
        <div className="flex items-center gap-2 flex-wrap">
          <button className={btnGhost} onClick={loadModels} disabled={!key.trim()}>Check key and list models</button>
          <button className={btnGhost} onClick={runTest} disabled={!key.trim()}>Test connection</button>
          <span className="text-xs" style={{ color: test.startsWith('OK') ? UI.ok : UI.dim }}>{test}</span>
        </div>
      </Card>
      <Card title="Drawing">
        <Lbl label="Stored drawing (by designated id)" hint="Drawings from the Drafting Studio, Elevation Studio, auto-generated and uploaded ones.">
          <select className={inputCls} value={storedId} onChange={e => pickStored(e.target.value)}>
            <option value="">Choose a stored drawing…</option>
            {stored.map(d => <option key={d.id} value={d.id}>{d.ref}  {d.title}</option>)}
          </select>
        </Lbl>
        <Lbl label="Or a file (PNG, JPG or PDF)">
          <input type="file" accept="image/*,application/pdf" className={inputCls} onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); setStoredId(''); setResult(null); setApplied(''); setFrom(1); setTo(1); }} />
        </Lbl>
        <div className="grid grid-cols-2 gap-2">
          <Lbl label="From page"><input type="number" min={1} className={inputCls} value={from} onChange={e => { const n = Math.max(1, parseInt(e.target.value) || 1); setFrom(n); if (to < n) setTo(n); }} /></Lbl>
          <Lbl label={`To page (max ${MAX_PAGES} at a time)`}><input type="number" min={from} className={inputCls} value={to} onChange={e => setTo(Math.max(from, parseInt(e.target.value) || from))} /></Lbl>
        </div>
        <div className="col-span-2"><Lbl label="Hint (optional)" hint="Example: ground floor plan, dimensions in mm, sandcrete blocks, 3 m floor height."><TextInput value={hint} onChange={setHint} /></Lbl></div>
        <div className="col-span-2 flex items-center gap-2">
          <button className={btnPrimary} onClick={run} disabled={busy}>{busy ? 'Reading…' : auto ? 'Read drawing and build estimate' : 'Read drawing'}</button>
          <Check checked={auto} onChange={setAuto} label="Build the bill straight away" />
          {busy && <button className={btnGhost} onClick={() => abort.current?.abort()}>Stop</button>}
          <span className="text-xs" style={{ color: UI.dim }}>{progress}</span>
        </div>
      </Card>
      {error && <div className="text-xs rounded-[var(--ui-r)] p-2" style={{ background: tint(UI.danger, 6), color: UI.danger }}>{error}</div>}
      {thumbs.length > 0 && <div className="flex gap-2 overflow-x-auto">{thumbs.map((t, i) => <img key={i} src={t} alt={`page ${from + i}`} className="h-28 rounded-[var(--ui-r)]" style={{ background: '#fff' }} />)}</div>}

      {result ? (
        <div style={{ background: UI.panel }} className="rounded-[var(--ui-r)] p-3 text-xs space-y-3">
          <div className="flex items-center gap-2"><span className="font-semibold" style={{ color: 'var(--ui-strong)' }}>What the AI read</span><Tag tone="warn">review</Tag><Tag>{result.drawingType}</Tag>{result.scale && <Tag>{result.scale}</Tag>}</div>
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
              {(result.roof.type || result.columns.length > 0 || result.stairs !== null) && <><div className="mt-2" style={{ color: UI.dim }}>Roof, columns, stairs</div><div style={{ fontFamily: MONO }}>{[result.roof.type && `${result.roof.type} roof${result.roof.pitchDeg ? ` ${result.roof.pitchDeg}°` : ''}${result.roof.covering ? ` ${result.roof.covering.replace('_', ' ')}` : ''}`, result.columns.length > 0 && `columns ${result.columns.map(c => `${c.label} ${c.bMm}x${c.dMm} ×${c.count}`).join(' · ')}`, result.stairs !== null && `${result.stairs} staircase(s)`].filter(Boolean).join(' | ')}</div></>}
              {result.specs.length > 0 && <><div className="mt-2" style={{ color: UI.dim }}>Notes that affect pricing</div><ul>{result.specs.map((x, i) => <li key={i}>• {x}</li>)}</ul></>}
            </div>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button className={btnPrimary} onClick={() => { apply('replace'); onEstimate?.(); }}>Apply and open the bill</button>
            <button className={btnGhost} onClick={() => apply('replace')}>Apply, replacing plan and AI rows</button>
            <button className={btnGhost} onClick={() => apply('add')}>Add to schedule</button>
            <span style={{ color: UI.dim }}>Values you typed yourself are never replaced.</span>
          </div>
          {applied && <div style={{ color: UI.ok }}>{applied}</div>}
          <details><summary className="cursor-pointer" style={{ color: UI.dim }}>Raw model reply</summary><pre className="mt-1 whitespace-pre-wrap text-[11px]" style={{ fontFamily: MONO, color: UI.dim }}>{raw.join('\n\n---\n\n')}</pre></details>
        </div>
      ) : !busy && !error && <Empty icon="spark" title="Read a drawing" hint="Add a free key, choose a floor plan or door and window schedule, and the quantities it can read land here for review." />}
    </div>
  );
};
