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
import { Icon, Panel, Screen, Section, Segmented, StatusBar, UI, MONO, btnGhost, btnPrimary, tint } from './ui';
import { Stepper, StepHeader, StepFooter, Step, StepInfo } from './measurement/Stepper';
import { billCsv, download, printBill } from '../utils/boq/export';
import { placeholderStats, rateWarning } from '../utils/boq/pricing';

const ORDER: Step[] = ['project', 'drawing', 'quantities', 'rates', 'estimate'];

interface Props { project: ProjectState; onClose: () => void }

export const MeasurementModule: React.FC<Props> = ({ project, onClose }) => {
  const s = useBoqState(project);
  const [step, setStep] = useState<Step>(() => (s.model.footprint.areaM2 > 0 || s.model.walls.length > 0 ? 'estimate' : 'project'));
  const [drawSub, setDrawSub] = useState<'read' | 'stored'>('read');
  const [estSub, setEstSub] = useState<'bill' | 'summary'>('bill');
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiDrawing, setAiDrawing] = useState<DrawingMeta | null>(null);
  const drawings = useAutoDrawings(project, s.assumptions);
  const hasPlan = project.elements.some(e => (e.type as string) === 'wall');
  const approx = s.built.lines.filter(l => l.basis === 'approx').length;
  const note = rateWarning(placeholderStats(s.priced, s.rates, s.overrides));
  const ph = placeholderStats(s.priced, s.rates, s.overrides);
  const wallsN = s.model.walls.length, openN = s.model.openings.length;
  const aiRows = s.model.walls.some(w => w.source === 'ai') || s.model.openings.some(o => o.source === 'ai');
  const hasQty = s.model.footprint.areaM2 > 0 || s.model.walls.length > 0;
  const money = (n: number) => (hasQty ? fmt(n, 0) : '—');
  const footprintOk = s.model.footprint.areaM2 > 0;
  const steps: StepInfo[] = [
    { id: 'project', label: 'Project', blurb: 'Name the project, set the building size and the construction assumptions (foundations, floors, roof, finishes).', status: footprintOk ? `${s.model.footprint.lengthM || '?'} x ${s.model.footprint.widthM || '?'} m` : 'Needs building size', tone: footprintOk ? 'done' : 'warn' },
    { id: 'drawing', label: 'Drawing', blurb: 'Optional. Let the AI read a drawing to fill in the walls, doors, windows and roof for you, or use the drawings stored for this project.', status: aiRows ? 'Read by AI' : 'Optional', tone: aiRows ? 'done' : 'idle' },
    { id: 'quantities', label: 'Quantities', blurb: 'Check the walls, openings and columns the bill is measured from. Edit anything the drawing reading got wrong.', status: wallsN || openN ? `${wallsN} walls · ${openN} openings` : 'Nothing added yet', tone: wallsN ? 'done' : 'warn' },
    { id: 'rates', label: 'Rates', blurb: 'Enter real prices for your area. Rates marked placeholder are only there so the bill is not blank.', status: ph.of === 0 ? 'No priced items yet' : ph.count ? `${ph.count} placeholder` : 'All priced', tone: ph.of === 0 ? 'idle' : ph.count ? 'warn' : 'done' },
    { id: 'estimate', label: 'Estimate', blurb: 'Your priced bill of quantities and the tender summary. Print or export from the top bar.', status: hasQty ? `${s.assumptions.currency} ${fmt(s.summary.grand, 0)}` : 'Set the building size first', tone: hasQty ? (ph.count ? 'warn' : 'done') : 'idle' },
  ];
  const idx = ORDER.indexOf(step), cur = steps[idx];
  const todo: { text: string; go: Step }[] = [];
  if (!footprintOk) todo.push({ text: 'Enter the building length and width', go: 'project' });
  if (!wallsN) todo.push({ text: 'Read a drawing, or add the external walls', go: 'drawing' });
  if (ph.count) todo.push({ text: `Replace ${ph.count} placeholder rate${ph.count === 1 ? '' : 's'} with real prices`, go: 'rates' });
  if (approx) todo.push({ text: `${approx} approximate item${approx === 1 ? '' : 's'}: check the project assumptions`, go: 'project' });
  if (aiRows) todo.push({ text: 'Check the AI-read quantities against your drawing', go: 'quantities' });
  const slug = (s.assumptions.projectName || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const openFile = async (f: File | undefined) => {
    if (!f) return;
    try { const j = JSON.parse(await f.text()) as Saved; if (!j.assumptions || !j.model) throw new Error(); s.load(j); }
    catch { alert('That file is not an ArchPro estimate.'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Screen
      crumb="Measurement / SMM7 estimate"
      onHome={onClose}
      actions={<>
        <button className={btnGhost} onClick={() => fileRef.current?.click()}>Open</button>
        <button className={btnGhost} onClick={() => download(`${slug}-estimate.json`, JSON.stringify(s.snapshot(), null, 2), 'application/json')}>Save</button>
        <button className={btnGhost} disabled={!s.summary.sections.length} onClick={() => download(`${slug}-bill-of-quantities.csv`, billCsv(s.summary, s.markups, s.assumptions, note))}><span className="inline-flex items-center gap-1.5"><Icon n="download" s={14} />CSV</span></button>
        <button className={btnPrimary} disabled={!s.summary.sections.length} onClick={() => printBill(s.summary, s.markups, s.assumptions, s.built.geo.gfaM2, note)}>Print / PDF</button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={e => openFile(e.target.files?.[0])} />
      </>}
    >
      <Stepper steps={steps} value={step} onChange={setStep} />
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 flex flex-col">
          <main className="flex-1 min-h-0 overflow-auto p-6" style={{ background: UI.bg }}>
            <StepHeader n={idx + 1} total={ORDER.length} title={cur.label} blurb={cur.blurb}>
              {step === 'drawing' && <div className="w-72"><Segmented value={drawSub} onChange={v => setDrawSub(v as 'read' | 'stored')} options={[{ id: 'read', label: 'Read a drawing' }, { id: 'stored', label: 'Stored drawings' }]} /></div>}
              {step === 'estimate' && <div className="w-72"><Segmented value={estSub} onChange={v => setEstSub(v as 'bill' | 'summary')} options={[{ id: 'bill', label: 'Bill of quantities' }, { id: 'summary', label: 'Summary' }]} /></div>}
            </StepHeader>
            {step === 'project' && <SetupPanel s={s} />}
            {step === 'drawing' && drawSub === 'stored' && <DrawingsPanel {...drawings} hasPlan={hasPlan} onUseInAi={m => { setAiDrawing(m); setDrawSub('read'); }} />}
            {step === 'drawing' && drawSub === 'read' && <AiPanel s={s} onApplied={() => setStep('quantities')} onEstimate={() => { setStep('estimate'); setEstSub('bill'); }} initialDrawing={aiDrawing} />}
            {step === 'quantities' && <SchedulePanel s={s} hasPlan={hasPlan} />}
            {step === 'rates' && <RatesView s={s} />}
            {step === 'estimate' && (estSub === 'bill' ? <BillView s={s} /> : <SummaryView s={s} />)}
          </main>
          <StepFooter prev={steps[idx - 1]} next={steps[idx + 1]} onGo={setStep} />
        </div>
        <Panel>
          <Section title="Key figures">
            <div className="text-xs space-y-1.5" style={{ fontFamily: MONO }}>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Net works</span><span>{money(s.summary.net)}</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Tender total</span><span style={{ color: 'var(--ui-strong)' }}>{money(s.summary.grand)}</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Per m2 GFA</span><span>{money(s.summary.perM2)}</span></div>
              <div className="flex justify-between"><span style={{ color: UI.dim }}>Currency</span><span>{s.assumptions.currency}</span></div>
            </div>
          </Section>
          <Section title="To do">
            {todo.length === 0
              ? <div className="text-xs" style={{ color: UI.ok }}>Nothing outstanding. Print or export the bill from the top bar.</div>
              : <ul className="space-y-1.5">{todo.map((x, i) => <li key={i}><button onClick={() => setStep(x.go)} className="w-full text-left text-xs rounded-[var(--ui-r)] px-2 py-1.5 hover:bg-[var(--ui-hover)] flex gap-2" style={{ color: UI.text }}><span style={{ color: UI.warn }}>•</span><span>{x.text}</span></button></li>)}</ul>}
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
      <StatusBar left={<span style={{ color: UI.text }}>Step {idx + 1} of {ORDER.length}: {cur.label}</span>} right={<span>{hasQty ? `${s.built.lines.length} items · ${s.assumptions.currency} ${fmt(s.summary.grand, 0)}` : 'no quantities yet'}</span>} />
    </Screen>
  );
};
