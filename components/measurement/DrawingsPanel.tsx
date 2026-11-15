// components/measurement/DrawingsPanel.tsx — every stored drawing, with its designated id; view, download, upload, delete.
import React, { useCallback, useEffect, useState } from 'react';
import { Check } from './fields';
import { Empty, Tag, UI, MONO, btnGhost, btnPrimary, btnDanger, tint } from '../ui';
import { DrawingMeta, KIND_LABEL, ORIGIN_LABEL } from '../../utils/drawings/types';
import { cloudConfigured, deleteDrawing, getDrawingBlob, getDrawingData, getStatus, listDrawings, newProjectId, projectCode, refFor, saveDrawing, subscribe, uploadLocalToCloud } from '../../utils/drawings/store';
import { svgToPngBlob } from '../../utils/elevation/svg';
import { download } from '../../utils/boq/export';

const extOf = (m: string) => (m.includes('svg') ? 'svg' : m.includes('png') ? 'png' : m.includes('jpeg') ? 'jpg' : m.includes('pdf') ? 'pdf' : 'bin');
const saveBlob = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };

const Thumb: React.FC<{ m: DrawingMeta }> = ({ m }) => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let u = ''; let live = true;
    if (m.mime.includes('pdf')) return;
    getDrawingBlob(m).then(b => { if (live) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => undefined);
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [m.id, m.version, m.backend]);
  return url ? <img src={url} alt={m.title} className="w-full h-36 object-contain" style={{ background: '#fff' }} />
    : <div className="w-full h-36 grid place-items-center text-[11px]" style={{ background: UI.raised, color: UI.dim }}>{m.mime.includes('pdf') ? 'PDF' : 'loading…'}</div>;
};

interface Props {
  auto: boolean; setAuto: (v: boolean) => void; running: boolean; skipped: string[]; error: string; regenerate: () => void;
  onUseInAi: (m: DrawingMeta) => void; hasPlan: boolean;
}

export const DrawingsPanel: React.FC<Props> = ({ auto, setAuto, running, skipped, error, regenerate, onUseInAi, hasPlan }) => {
  const [list, setList] = useState<DrawingMeta[]>([]);
  const [view, setView] = useState<{ m: DrawingMeta; url: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [, force] = useState(0);
  const refresh = useCallback(() => { listDrawings().then(setList).catch(e => setMsg((e as Error).message)); force(x => x + 1); }, []);
  useEffect(() => { refresh(); return subscribe(refresh); }, [refresh]);
  const st = getStatus();
  const localCount = list.filter(d => d.backend === 'local').length;

  const open = async (m: DrawingMeta) => {
    try { const b = await getDrawingBlob(m); setView({ m, url: URL.createObjectURL(b) }); } catch (e) { setMsg((e as Error).message); }
  };
  const close = () => { if (view) URL.revokeObjectURL(view.url); setView(null); };
  const dl = async (m: DrawingMeta, as: 'file' | 'png' | 'json') => {
    try {
      if (as === 'json') { download(`${m.ref}.data.json`, JSON.stringify({ drawing: m, data: await getDrawingData(m) }, null, 2), 'application/json'); return; }
      const b = await getDrawingBlob(m);
      if (as === 'png' && m.mime.includes('svg')) saveBlob(await svgToPngBlob(await b.text(), 4961, 3508), `${m.ref}.png`);
      else saveBlob(b, `${m.ref}.${extOf(m.mime)}`);
    } catch (e) { setMsg((e as Error).message); }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    const n = list.filter(d => d.origin === 'upload').length + 1;
    try {
      let w = 0, h = 0;
      if (f.type.startsWith('image/')) { const u = URL.createObjectURL(f); const i = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Could not open that image.')); im.src = u; }); w = i.width; h = i.height; URL.revokeObjectURL(u); }
      await saveDrawing({ kind: 'source_plan', refSuffix: `UPLOAD-${String(n).padStart(2, '0')}`, title: f.name, origin: 'upload', generated: false, blob: new Blob([f], { type: f.type || 'application/octet-stream' }), width: w, height: h, data: { fileName: f.name, size: f.size, uploadedAt: new Date().toISOString() } });
      setMsg(`Stored ${f.name} as ${refFor(`UPLOAD-${String(n).padStart(2, '0')}`)}.`);
    } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div className="max-w-6xl mx-auto grid gap-3">
      <div className="border rounded-[3px] p-3 text-xs flex items-start gap-3 flex-wrap" style={{ borderColor: st.backend === 'cloud' ? tint(UI.ok, 53) : tint(UI.warn, 53), background: UI.raised }}>
        <div className="flex-1 min-w-[260px]">
          <div className="font-semibold" style={{ color: 'var(--ui-strong)' }}>
            {st.backend === 'cloud' ? 'Stored in Supabase' : cloudConfigured ? 'Supabase configured, but unavailable right now' : 'Stored in this browser only'}
            <span className="ml-2 font-normal" style={{ color: UI.dim, fontFamily: MONO }}>drawing set {projectCode()}</span>
          </div>
          <div style={{ color: UI.dim }} className="mt-1">{st.error ?? 'Drawings and the page data that produced them are saved under their designated ids and are private to your sign-in.'}</div>
          {!cloudConfigured && <div style={{ color: UI.dim }} className="mt-1">To use Supabase: run supabase/schema.sql, enable anonymous sign-ins, and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (see .env.example).</div>}
        </div>
        <div className="flex gap-2 flex-wrap">
          {localCount > 0 && st.backend === 'cloud' && <button className={btnGhost} onClick={() => uploadLocalToCloud().then(n => setMsg(`Copied ${n} drawing(s) to Supabase.`)).catch(e => setMsg((e as Error).message))}>Copy {localCount} local to Supabase</button>}
          <button className={btnGhost} onClick={() => { if (confirm('Start a new drawing set? Existing drawings stay stored under the old set.')) newProjectId(); }}>New drawing set</button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Check checked={auto} onChange={setAuto} label="Generate the drawings needed for the take-off automatically" />
        <button className={btnPrimary} onClick={regenerate} disabled={running || !hasPlan}>{running ? 'Generating…' : 'Generate now'}</button>
        <label className={btnGhost + ' cursor-pointer'}>Upload a drawing<input type="file" accept="image/*,application/pdf" className="hidden" onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <span className="flex-1" />
        <span className="text-[11px]" style={{ color: UI.dim }}>{list.length} stored</span>
      </div>
      {!hasPlan && <div className="text-xs" style={{ color: UI.dim }}>Draw walls in the Drafting Studio and the floor plan, foundation plan and elevations are produced for you here. You can still upload your own drawings.</div>}
      {skipped.map((s, i) => <div key={i} className="text-xs border rounded-[3px] p-2" style={{ borderColor: tint(UI.warn, 53), color: UI.warn }}>{s}</div>)}
      {error && <div className="text-xs border rounded-[3px] p-2" style={{ borderColor: tint(UI.danger, 53), color: UI.danger }}>{error}</div>}
      {msg && <div className="text-xs" style={{ color: UI.accent }}>{msg}</div>}

      {list.length === 0 ? <Empty icon="drawings" title="No drawings stored yet" hint="Drawings made in the Drafting Studio, the Elevation Studio or generated here for the take-off appear with their designated ids." /> : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {list.map(m => (
            <div key={m.id} style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] overflow-hidden flex flex-col">
              <button onClick={() => open(m)} title="View"><Thumb m={m} /></button>
              <div className="p-3 text-xs space-y-1 flex-1">
                <div style={{ fontFamily: MONO, color: UI.warn }} className="break-all">{m.ref}</div>
                <div style={{ color: 'var(--ui-strong)' }}>{m.title}</div>
                <div className="flex gap-1 flex-wrap"><Tag>{KIND_LABEL[m.kind]}</Tag>{m.generated && <Tag tone="warn">auto</Tag>}<Tag tone={m.backend === 'cloud' ? 'ok' : 'dim'}>{m.backend}</Tag></div>
                <div style={{ color: UI.dim }}>{ORIGIN_LABEL[m.origin]} · v{m.version} · {new Date(m.updatedAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</div>
                <div style={{ color: UI.dim, fontFamily: MONO }} className="text-[10px] break-all">id {m.id}</div>
              </div>
              <div className="px-3 pb-3 flex gap-1.5 flex-wrap">
                <button className={btnGhost} onClick={() => dl(m, 'file')}>{extOf(m.mime).toUpperCase()}</button>
                {m.mime.includes('svg') && <button className={btnGhost} onClick={() => dl(m, 'png')}>PNG</button>}
                <button className={btnGhost} onClick={() => dl(m, 'json')} title="The page data stored with this drawing">Data</button>
                <button className={btnGhost} onClick={() => onUseInAi(m)}>Read with AI</button>
                <button className={btnDanger} onClick={() => { if (confirm(`Delete ${m.ref}?`)) deleteDrawing(m).then(refresh).catch(e => setMsg((e as Error).message)); }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view && (
        <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: 'rgba(10,11,13,.85)' }} onClick={close}>
          <div className="max-w-[92vw] max-h-[92vh] flex flex-col border rounded-[3px]" style={{ background: UI.panel, borderColor: UI.rule }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-3 py-2 border-b text-xs" style={{ borderColor: UI.rule }}>
              <span style={{ fontFamily: MONO, color: UI.warn }}>{view.m.ref}</span><span>{view.m.title}</span><span className="flex-1" />
              <button className={btnGhost} onClick={() => dl(view.m, 'file')}>Download</button><button className={btnGhost} onClick={close}>Close</button>
            </div>
            <div className="overflow-auto p-3" style={{ background: 'var(--ui-sunken)' }}>
              {view.m.mime.includes('pdf') ? <iframe src={view.url} title={view.m.title} className="w-[80vw] h-[75vh] bg-white" /> : <img src={view.url} alt={view.m.title} className="max-w-full bg-white" style={{ maxHeight: '78vh' }} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
