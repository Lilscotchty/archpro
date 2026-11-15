// components/drafting/Inspector.tsx — properties of the selection (or a plan summary when nothing is selected).
import React from 'react';
import { ArchElement, ProjectState } from '../../types';
import { angleDeg, fmtMm, polar, segLen } from '../../utils/drafting/geometry';
import { isOpening, isWall, planStats, setWallLength, stretchEnd } from '../../utils/drafting/ops';
import { Section, UI, MONO, btnDanger, btnGhost, inputCls, tint } from '../ui';
import { NumField, Row } from './fields';
import { DIcon } from './icons';

type Commit = (fn: (p: ProjectState) => ProjectState) => void;

export const Inspector: React.FC<{ project: ProjectState; sel: Set<string>; commit: Commit; onDelete: () => void }> = ({ project, sel, commit, onDelete }) => {
  const picked = project.elements.filter(e => sel.has(e.id));
  const grid = project.gridLines.filter(g => sel.has(g.id));
  const count = picked.length + grid.length;

  if (count === 0) {
    const s = planStats(project);
    return (
      <Section title="Plan summary">
        <div className="text-xs space-y-1" style={{ fontFamily: MONO }}>
          <div className="flex justify-between"><span style={{ color: UI.dim }}>Walls</span><span>{s.walls}</span></div>
          <div className="flex justify-between"><span style={{ color: UI.dim }}>Doors and windows</span><span>{s.openings}</span></div>
          <div className="flex justify-between"><span style={{ color: UI.dim }}>Total wall length</span><span>{(s.totalMm / 1000).toFixed(2)} m</span></div>
        </div>
        {s.walls > 0 && s.dangling > 0 && (
          <div className="flex gap-2 text-xs p-2 border rounded-[3px]" style={{ borderColor: tint(UI.warn, 40), color: UI.warn }}>
            <DIcon n="warn" s={14} /><span>{s.dangling} wall {s.dangling === 1 ? 'end is' : 'ends are'} not joined to another wall. Foundation and room detection need closed loops.</span>
          </div>
        )}
        {s.walls === 0 && <p className="text-xs" style={{ color: UI.dim }}>Press W and click to draw walls. Type a length and press Enter for exact sizes.</p>}
      </Section>
    );
  }

  if (count > 1 || grid.length) {
    if (count === 1 && grid.length === 1) {
      const g = grid[0];
      return (
        <Section title="Grid line">
          <Row label="Label"><input className={inputCls} value={g.label} onChange={e => commit(p => ({ ...p, gridLines: p.gridLines.map(x => (x.id === g.id ? { ...x, label: e.target.value.slice(0, 3) } : x)) }))} onKeyDown={e => e.stopPropagation()} /></Row>
          <Row label={g.orientation === 'vertical' ? 'X position' : 'Y position'}><NumField value={g.position} suffix="mm" onCommit={n => commit(p => ({ ...p, gridLines: p.gridLines.map(x => (x.id === g.id ? { ...x, position: n } : x)) }))} /></Row>
          <button className={btnDanger + ' w-full'} onClick={onDelete}>Delete</button>
        </Section>
      );
    }
    const total = picked.filter(isWall).reduce((a, w) => a + segLen(w), 0);
    return (
      <Section title={`${count} selected`}>
        {total > 0 && <div className="text-xs" style={{ fontFamily: MONO }}>Wall length {fmtMm(total)}</div>}
        <button className={btnDanger + ' w-full'} onClick={onDelete}>Delete {count} items</button>
      </Section>
    );
  }

  const e = picked[0];
  const patch = (p: Partial<ArchElement>) => commit(pr => ({ ...pr, elements: pr.elements.map(x => (x.id === e.id ? { ...x, ...p } : x)) }));

  if (isWall(e)) {
    const L = segLen(e), a = angleDeg({ x: e.x1, y: e.y1 }, { x: e.x2, y: e.y2 });
    const setAngle = (deg: number) => { const to = polar({ x: e.x1, y: e.y1 }, L, deg); commit(p => ({ ...p, elements: stretchEnd(p, e.id, 2, to) })); };
    return (
      <Section title="Wall">
        <Row label="Length"><NumField value={L} suffix="mm" onCommit={n => commit(p => ({ ...p, elements: setWallLength(p, e.id, n) }))} min={1} /></Row>
        <Row label="Angle"><NumField value={a} suffix="°" decimals={1} onCommit={setAngle} /></Row>
        <Row label="Start X"><NumField value={e.x1} suffix="mm" onCommit={n => commit(p => ({ ...p, elements: stretchEnd(p, e.id, 1, { x: n, y: e.y1 }) }))} /></Row>
        <Row label="Start Y"><NumField value={e.y1} suffix="mm" onCommit={n => commit(p => ({ ...p, elements: stretchEnd(p, e.id, 1, { x: e.x1, y: n }) }))} /></Row>
        <Row label="End X"><NumField value={e.x2} suffix="mm" onCommit={n => commit(p => ({ ...p, elements: stretchEnd(p, e.id, 2, { x: n, y: e.y2 }) }))} /></Row>
        <Row label="End Y"><NumField value={e.y2} suffix="mm" onCommit={n => commit(p => ({ ...p, elements: stretchEnd(p, e.id, 2, { x: e.x2, y: n }) }))} /></Row>
        <p className="text-[10px]" style={{ color: UI.dim }}>Joined walls follow when an end moves. Wall thickness is set for the whole plan below.</p>
        <button className={btnDanger + ' w-full'} onClick={onDelete}>Delete wall</button>
      </Section>
    );
  }

  if (isOpening(e)) {
    const kind = e.type as string, L = segLen(e), cx = (e.x1 + e.x2) / 2, cy = (e.y1 + e.y2) / 2;
    const setWidth = (w: number) => { const ux = (e.x2 - e.x1) / (L || 1), uy = (e.y2 - e.y1) / (L || 1); patch({ x1: cx - ux * w / 2, y1: cy - uy * w / 2, x2: cx + ux * w / 2, y2: cy + uy * w / 2 }); };
    return (
      <Section title={kind === 'door' ? 'Door' : kind === 'window' ? 'Window' : 'Opening'}>
        <Row label="Width"><NumField value={L} suffix="mm" onCommit={setWidth} min={100} /></Row>
        <Row label="Height"><NumField value={e.height ?? (kind === 'window' ? 1200 : 2100)} suffix="mm" onCommit={n => patch({ height: n })} min={100} /></Row>
        {kind === 'window' && <Row label="Sill height"><NumField value={e.sill ?? 900} suffix="mm" onCommit={n => patch({ sill: n })} min={0} /></Row>}
        {kind === 'door' && (
          <div className="grid grid-cols-2 gap-2">
            <button className={btnGhost} onClick={() => patch({ flip: !e.flip })}><span className="inline-flex items-center gap-1.5"><DIcon n="flip" s={13} />Swing side</span></button>
            <button className={btnGhost} onClick={() => patch({ mirror: !e.mirror })}><span className="inline-flex items-center gap-1.5"><DIcon n="flip" s={13} />Hinge side</span></button>
          </div>
        )}
        <button className={btnDanger + ' w-full'} onClick={onDelete}>Delete</button>
      </Section>
    );
  }

  return (
    <Section title="Rectangle (legacy)">
      <div className="text-xs" style={{ fontFamily: MONO }}>{fmtMm(Math.abs(e.x2 - e.x1))} × {fmtMm(Math.abs(e.y2 - e.y1))}</div>
      <button className={btnDanger + ' w-full'} onClick={onDelete}>Delete</button>
    </Section>
  );
};
