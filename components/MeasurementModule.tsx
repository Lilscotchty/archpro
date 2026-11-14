// components/MeasurementModule.tsx
// SMM7 measurement and estimating: plan data (or AI-read drawings) -> take-off -> priced bill -> summary.
import React, { useRef, useState } from 'react';
import { ProjectState } from '../types';
import { useBoqState, Saved } from './measurement/useBoqState';
import { SetupPanel } from './measurement/SetupPanel';
import { SchedulePanel } from './measurement/SchedulePanel';
import { AiPanel } from './measurement/AiPanel';
import { BillView } from './measurement/BillView';
import { SummaryView } from './measurement/SummaryView';
import { RatesView } from './measurement/RatesView';
import { DrawingsPanel } from './measurement/DrawingsPanel';
import { useAutoDrawings } from './measurement/useAutoDrawings';
import { DrawingMeta } from '../utils/drawings/types';
import { fmt } from './measurement/fields';
import { Icon, Panel, Rail, Screen, Section, StatusBar, UI, MONO, btnGhost, btnPrimary } from './ui';
import { billCsv, download, printBill } from '../utils/boq/export';

type Tab = 'setup' | 'schedule' | 'drawings' | 'ai' | 'bill' | 'summary' | 'rates';
const TITLES: Record<Tab, string> = { setup: 'Setup', schedule: 'Schedule', drawings: 'Drawings', ai: 'AI drawing reader', bill: 'Bill of quantities', summary: 'Summary', rates: 'Rates' };

interface Props { project: ProjectState; onClose: () => void }

export const MeasurementModule: React.FC<Props> = ({ project, onClose }) => {
  const s = useBoqState(project);
  const [tab, setTab] = useState<Tab>(() => (s.built.lines.length ? 'bill' : 'setup'));
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiDrawing, setAiDrawing] = useState<DrawingMeta | null>(null);
  const drawings = useAutoDrawings(project, s.assumptions);
  const hasPlan = project.elements.some(e => (e.type as string) === 'wall');
  const approx = s.built.lines.filter(l => l.basis === 'approx').length;
  const slug = (s.assumptions.projectName || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const openFile = async (f: File | undefined) => {
    if (!f) return;
    try { const j = JSON.parse(await f.text()) as Saved; if (!j.assumptions || !j.model) throw new Error(); s.load(j); }
    catch { alert('That file is not an ArchPro estimate.'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Screen
      crumb={`Measurement / SMM7 / ${TITLES[tab]}`}
      onHome={onClose}
      actions={<>
        <button className={btnGhost} onClick={() => fileRef.current?.click()}>Open</button>
        <button className={btnGhost} onClick={() => download(`${slug}-estimate.json`, JSON.stringify(s.snapshot(), null, 2), 'application/json')}>Save</button>
        <button className={btnGhost} disabled={!s.summary.sections.length} onClick={() => download(`${slug}-bill-of-quantities.csv`, billCsv(s.summary, s.markups, s.assumptions))}><span className="inline-flex items-center gap-1.5"><Icon n="download" s={14} />CSV</span></button>
        <button className={btnPrimary} disabled={!s.summary.sections.length} onClick={() => printBill(s.summary, s.markups, s.assumptions, s.built.geo.gfaM2)}>Print / PDF</button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={e => openFile(e.target.files?.[0])} />
      </>}
    >
      <div className="flex-1 flex min-h-0">
        <Rail value={tab} onChange={id => setTab(id as Tab)} items={[
          { id: 'setup', icon: 'setup', label: 'Setup and assumptions' },
          { id: 'schedule', icon: 'table', label: 'Walls, openings, columns' },
          { id: 'drawings', icon: 'drawings', label: 'Drawings' },
          { id: 'ai', icon: 'spark', label: 'AI drawing reader' },
          { id: 'bill', icon: 'measure', label: 'Bill of quantities' },
          { id: 'summary', icon: 'sum', label: 'Summary' },
          { id: 'rates', icon: 'coins', label: 'Rates' },
        ]} />
        <main className="flex-1 min-w-0 overflow-auto p-6" style={{ background: UI.bg }}>
          {tab === 'setup' && <SetupPanel s={s} />}
          {tab === 'schedule' && <SchedulePanel s={s} hasPlan={hasPlan} />}
          {tab === 'drawings' && <DrawingsPanel {...drawings} hasPlan={hasPlan} onUseInAi={m => { setAiDrawing(m); setTab('ai'); }} />}
          {tab === 'ai' && <AiPanel s={s} onApplied={() => setTab('schedule')} initialDrawing={aiDrawing} />}
          {tab === 'bill' && <BillView s={s} />}
          {tab === 'summary' && <SummaryView s={s} />}
          {tab === 'rates' && <RatesView s={s} />}
        </main>
        <Panel>
          <Section title="Key figures">
            <div className="text-xs space-y-1.5" style={{ fontFamily: MONO }}>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Net works</span><span>{fmt(s.summary.net, 0)}</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Tender total</span><span style={{ color: '#e6e9ed' }}>{fmt(s.summary.grand, 0)}</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Per m2 GFA</span><span>{fmt(s.summary.perM2, 0)}</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Currency</span><span>{s.assumptions.currency}</span></div>
            </div>
          </Section>
          <Section title="Take-off">
            <div className="text-xs space-y-1.5" style={{ fontFamily: MONO }}>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>GFA</span><span>{s.built.geo.gfaM2.toFixed(1)} m2</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Net floor / storey</span><span>{s.built.geo.aNetM2.toFixed(1)} m2</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>External walls</span><span>{s.built.geo.extLenM.toFixed(1)} m</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Bill items</span><span>{s.built.lines.length + s.customs.length}</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Approximate items</span><span style={{ color: approx ? UI.warn : UI.text }}>{approx}</span></div>
            </div>
          </Section>
          <Section title="Data">
            <div className="text-[11px]" style={{ color: UI.dim }}>
              {s.saveError ? <span style={{ color: UI.danger }}>Autosave failed: browser storage is full or blocked. Use Save to keep your work.</span> : 'Autosaved in this browser. Save writes a file you can reopen.'}
            </div>
            <button className={btnGhost + ' w-full'} onClick={() => { if (confirm('Clear the whole estimate (schedule, assumptions, rates, edits)?')) s.resetAll(); }}>Start a new estimate</button>
          </Section>
        </Panel>
      </div>
      <StatusBar left={<span style={{ color: UI.text }}>{TITLES[tab]}</span>} right={<span>{s.built.lines.length ? `${s.built.lines.length} items · ${s.assumptions.currency} ${fmt(s.summary.grand, 0)}` : 'no quantities yet'}</span>} />
    </Screen>
  );
};
