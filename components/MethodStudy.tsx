// components/MethodStudy.tsx — construction programme (critical path) and site risk register.
import React, { useMemo, useState } from 'react';
import { Activity, Risk, RiskBand, SAMPLE_ACTIVITIES, SAMPLE_RISKS, riskBand, riskScore, schedule } from '../utils/methodEngine';
import { Empty, Icon, Panel, Rail, Screen, Section, Stat, StatusBar, Tag, UI, MONO, btnGhost, btnPrimary, inputCls, tdCls, thCls } from './ui';

type Tab = 'programme' | 'risks';
const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const withIds = <T,>(xs: T[]) => xs.map((x, i) => ({ ...x, id: i + 1 }));
const parsePreds = (s: string) => Array.from(new Set(s.split(/[\s,;]+/).map(x => parseInt(x, 10)).filter(n => Number.isFinite(n))));
const BAND_COLOR: Record<RiskBand, string> = { Low: UI.ok, Medium: UI.warn, High: '#ff8a3d', Critical: UI.danger };

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csv = (rows: (string | number)[][]) => rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

export const MethodStudy: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [tab, setTab] = useState<Tab>('programme');
  const [acts, setActs] = useState<Activity[]>(() => withIds(SAMPLE_ACTIVITIES));
  const [predText, setPredText] = useState<Record<number, string>>({});
  const [risks, setRisks] = useState<Risk[]>(() => withIds(SAMPLE_RISKS));

  const sched = useMemo(() => schedule(acts), [acts]);
  const nextId = (xs: { id: number }[]) => (xs.length ? Math.max(...xs.map(x => x.id)) + 1 : 1);
  const patchAct = (id: number, p: Partial<Activity>) => setActs(a => a.map(x => (x.id === id ? { ...x, ...p } : x)));
  const removeAct = (id: number) => setActs(a => a.filter(x => x.id !== id).map(x => ({ ...x, preds: x.preds.filter(p => p !== id) })));
  const patchRisk = (id: number, p: Partial<Risk>) => setRisks(r => r.map(x => (x.id === id ? { ...x, ...p } : x)));

  const weeks = sched.total / 7;
  const critical = sched.items.filter(i => i.critical).length;
  const ticks = Math.max(1, Math.ceil(sched.total / 7));
  const highRisks = risks.filter(r => ['High', 'Critical'].includes(riskBand(riskScore(r)))).length;

  const exportProgramme = () => download('programme.csv', csv([['ID', 'Activity', 'Days', 'Predecessors', 'Start day', 'Finish day', 'Float', 'Critical'],
    ...sched.items.map(i => [i.id, i.name, i.days, i.preds.join(' '), i.es, i.ef, i.float, i.critical ? 'yes' : 'no'])]));
  const exportRisks = () => download('risk_register.csv', csv([['ID', 'Hazard', 'Likelihood', 'Severity', 'Score', 'Rating', 'Control'],
    ...risks.map(r => [r.id, r.hazard, r.likelihood, r.severity, riskScore(r), riskBand(riskScore(r)), r.control])]));

  return (
    <Screen crumb={`Method study / ${tab === 'programme' ? 'Programme' : 'Risk register'}`} onHome={onClose}
      actions={<button className={btnPrimary} onClick={tab === 'programme' ? exportProgramme : exportRisks}>Export CSV</button>}>
      <div className="flex-1 flex min-h-0">
        <Rail value={tab} onChange={id => setTab(id as Tab)} items={[
          { id: 'programme', icon: 'gantt', label: 'Programme (critical path)' },
          { id: 'risks', icon: 'risk', label: 'Risk register' },
        ]} />

        {tab === 'programme' ? (
          <>
            <main className="flex-1 min-w-0 overflow-auto p-6" style={{ background: UI.bg }}>
              {sched.error ? (
                <Empty icon="risk" title="Can’t build the programme" hint={sched.error} />
              ) : acts.length === 0 ? (
                <Empty icon="gantt" title="No activities" hint="Add activities in the panel on the right." />
              ) : (
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Total duration" value={String(sched.total)} unit="days" />
                    <Stat label="About" value={weeks.toFixed(1)} unit="weeks" />
                    <Stat label="Critical activities" value={`${critical} / ${acts.length}`} tone="warn" />
                  </div>
                  <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] p-3 overflow-x-auto">
                    <div style={{ minWidth: 560 }}>
                      <div className="flex text-[10px] mb-1" style={{ color: UI.dim, fontFamily: MONO, paddingLeft: 200 }}>
                        <div className="relative flex-1 h-4">
                          {Array.from({ length: ticks + 1 }, (_, w) => (
                            <span key={w} className="absolute" style={{ left: `${Math.min(100, (w * 7 / Math.max(sched.total, 1)) * 100)}%` }}>W{w + 1}</span>
                          ))}
                        </div>
                      </div>
                      {sched.items.map(i => (
                        <div key={i.id} className="flex items-center h-7 text-xs">
                          <div className="w-[200px] pr-2 truncate" title={i.name}><span style={{ color: UI.dim, fontFamily: MONO }}>{i.id}</span> {i.name}</div>
                          <div className="relative flex-1 h-4" style={{ background: UI.raised, borderRadius: 3 }}>
                            <div title={`Day ${i.es} → ${i.ef}`} style={{
                              position: 'absolute', top: 0, bottom: 0, left: `${(i.es / Math.max(sched.total, 1)) * 100}%`,
                              width: `${(Math.max(i.days, 0.4) / Math.max(sched.total, 1)) * 100}%`, borderRadius: 3,
                              background: i.critical ? UI.warn : UI.accent,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-4 text-[11px]" style={{ color: UI.dim }}>
                      <span><span style={{ background: UI.warn }} className="inline-block w-2.5 h-2.5 rounded-[2px] mr-1.5 align-middle" />Critical path</span>
                      <span><span style={{ background: UI.accent }} className="inline-block w-2.5 h-2.5 rounded-[2px] mr-1.5 align-middle" />Has float</span>
                    </div>
                  </div>
                  <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] overflow-hidden">
                    <table className="w-full text-xs">
                      <thead style={{ borderColor: UI.rule, color: UI.dim }} className="border-b"><tr>
                        <th className={`${thCls} w-10`}>#</th><th className={thCls}>Activity</th><th className={`${thCls} text-right`}>Days</th><th className={`${thCls} text-right`}>Start</th><th className={`${thCls} text-right`}>Finish</th><th className={`${thCls} text-right`}>Float</th>
                      </tr></thead>
                      <tbody>
                        {sched.items.map(i => (
                          <tr key={i.id} style={{ borderColor: UI.rule }} className="border-b last:border-b-0">
                            <td className={tdCls} style={{ fontFamily: MONO, color: UI.dim }}>{i.id}</td>
                            <td className={tdCls}>{i.name}{i.critical && <span className="ml-2"><Tag tone="warn">critical</Tag></span>}</td>
                            {[i.days, i.es, i.ef, i.float].map((v, k) => <td key={k} className={`${tdCls} text-right`} style={{ fontFamily: MONO }}>{v}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </main>
            <Panel>
              <Section title="Activities">
                {acts.map(a => (
                  <div key={a.id} style={{ borderColor: UI.rule, background: UI.raised }} className="border rounded-[3px] p-2 space-y-1.5">
                    <div className="flex gap-1 items-center">
                      <span className="w-5 text-center text-[11px]" style={{ color: UI.dim, fontFamily: MONO }}>{a.id}</span>
                      <input className={inputCls} value={a.name} onChange={e => patchAct(a.id, { name: e.target.value })} />
                      <button title="Remove activity" onClick={() => removeAct(a.id)} style={{ color: UI.dim }} className="px-1 hover:text-white"><Icon n="trash" s={14} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="text-[10px]" style={{ color: UI.dim }}>Days<input type="number" min={0} className={`${inputCls} mt-0.5`} value={a.days} onChange={e => patchAct(a.id, { days: Math.max(0, num(e.target.value)) })} /></label>
                      <label className="text-[10px]" style={{ color: UI.dim }}>After (#, comma-separated)
                        <input className={`${inputCls} mt-0.5`} value={predText[a.id] ?? a.preds.join(', ')}
                          onChange={e => { setPredText(t => ({ ...t, [a.id]: e.target.value })); patchAct(a.id, { preds: parsePreds(e.target.value) }); }}
                          onBlur={() => setPredText(t => { const n = { ...t }; delete n[a.id]; return n; })} />
                      </label>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button className={btnGhost} onClick={() => setActs(a => [...a, { id: nextId(a), name: 'New activity', days: 1, preds: a.length ? [a[a.length - 1].id] : [] }])}>Add activity</button>
                  <button className={btnGhost} onClick={() => { setActs(withIds(SAMPLE_ACTIVITIES)); setPredText({}); }}>Load sample</button>
                </div>
              </Section>
            </Panel>
          </>
        ) : (
          <>
            <main className="flex-1 min-w-0 overflow-auto p-6" style={{ background: UI.bg }}>
              {risks.length === 0 ? <Empty icon="risk" title="No hazards" hint="Add a hazard to start the register." /> : (
                <div className="max-w-5xl mx-auto space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <Stat label="Hazards" value={String(risks.length)} />
                    <Stat label="High / critical" value={String(highRisks)} tone={highRisks ? 'danger' : 'ok'} />
                    <Stat label="Highest score" value={String(Math.max(...risks.map(riskScore)))} unit="/ 25" />
                  </div>
                  <div style={{ borderColor: UI.rule, background: UI.panel }} className="border rounded-[3px] overflow-hidden">
                    <table className="w-full text-xs">
                      <thead style={{ borderColor: UI.rule, color: UI.dim }} className="border-b"><tr>
                        <th className={thCls}>Hazard</th><th className={`${thCls} w-14 text-right`}>L</th><th className={`${thCls} w-14 text-right`}>S</th><th className={`${thCls} w-24`}>Rating</th><th className={thCls}>Control measures</th><th className="w-8" />
                      </tr></thead>
                      <tbody>
                        {risks.map(r => {
                          const sc = riskScore(r), band = riskBand(sc);
                          return (
                            <tr key={r.id} style={{ borderColor: UI.rule }} className="border-b last:border-b-0 align-top">
                              <td className="px-2 py-1.5"><input className={inputCls} value={r.hazard} onChange={e => patchRisk(r.id, { hazard: e.target.value })} /></td>
                              {(['likelihood', 'severity'] as const).map(k => (
                                <td key={k} className="px-1 py-1.5"><select className={inputCls} value={r[k]} onChange={e => patchRisk(r.id, { [k]: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></td>
                              ))}
                              <td className={tdCls}><span className="px-1.5 py-0.5 border rounded-[3px]" style={{ color: BAND_COLOR[band], borderColor: BAND_COLOR[band] + '66', fontFamily: MONO }}>{sc} · {band}</span></td>
                              <td className="px-2 py-1.5"><input className={inputCls} value={r.control} onChange={e => patchRisk(r.id, { control: e.target.value })} /></td>
                              <td className="px-1 py-1.5"><button title="Remove hazard" onClick={() => setRisks(rs => rs.filter(x => x.id !== r.id))} style={{ color: UI.dim }} className="p-1 hover:text-white"><Icon n="trash" s={14} /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px]" style={{ color: UI.dim }}>L = likelihood, S = severity (1–5). Score = L × S: 1–4 low, 5–9 medium, 10–16 high, 17–25 critical.</p>
                </div>
              )}
            </main>
            <Panel>
              <Section title="Register">
                <button className={btnGhost} onClick={() => setRisks(r => [...r, { id: nextId(r), hazard: 'New hazard', likelihood: 3, severity: 3, control: '' }])}>Add hazard</button>
                <button className={btnGhost} onClick={() => setRisks(withIds(SAMPLE_RISKS))}>Load sample</button>
                <p className="text-xs leading-relaxed" style={{ color: UI.dim }}>Sample entries are examples only. Write hazards and controls for your own site and have them reviewed by your safety officer.</p>
              </Section>
            </Panel>
          </>
        )}
      </div>
      <StatusBar left={<span style={{ color: UI.text }}>{tab === 'programme' ? 'Programme' : 'Risk register'}</span>}
        right={<span>{tab === 'programme' ? (sched.error ? 'check predecessors' : `${acts.length} activities · ${sched.total} days`) : `${risks.length} hazards`}</span>} />
    </Screen>
  );
};
