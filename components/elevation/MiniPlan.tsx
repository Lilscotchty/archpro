// components/elevation/MiniPlan.tsx
// Small line plan used to show which side of the plan is the FRONT of the building.
import React from 'react';
import { ExtWall, PlanSide } from '../../utils/elevation/types';

export const MiniPlan: React.FC<{ walls: ExtWall[]; front: PlanSide }> = ({ walls, front }) => {
  if (walls.length === 0) return null;
  const xs = walls.flatMap(w => [w.x1, w.x2]), ys = walls.flatMap(w => [w.y1, w.y2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = Math.max(maxX - minX, 1), H = Math.max(maxY - minY, 1);
  const pad = Math.max(W, H) * 0.35;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const a = Math.max(W, H) * 0.14; // arrow length
  const sw = Math.max(W, H) / 110;

  // arrow sits outside the chosen side and points at the building
  const arrow = (() => {
    switch (front) {
      case 'bottom': return { x1: cx, y1: maxY + a * 2.1, x2: cx, y2: maxY + a * 0.35, tx: cx, ty: maxY + a * 3.2 };
      case 'top':    return { x1: cx, y1: minY - a * 2.1, x2: cx, y2: minY - a * 0.35, tx: cx, ty: minY - a * 2.6 };
      case 'left':   return { x1: minX - a * 2.1, y1: cy, x2: minX - a * 0.35, y2: cy, tx: minX - a * 1.1, ty: cy - a * 0.5 };
      case 'right':  return { x1: maxX + a * 2.1, y1: cy, x2: maxX + a * 0.35, y2: cy, tx: maxX + a * 1.1, ty: cy - a * 0.5 };
    }
  })();
  const ang = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1);
  const hd = a * 0.35;
  const head = [
    [arrow.x2, arrow.y2],
    [arrow.x2 - hd * Math.cos(ang - 0.5), arrow.y2 - hd * Math.sin(ang - 0.5)],
    [arrow.x2 - hd * Math.cos(ang + 0.5), arrow.y2 - hd * Math.sin(ang + 0.5)],
  ].map(p => p.join(',')).join(' ');

  return (
    <svg viewBox={`${minX - pad} ${minY - pad} ${W + 2 * pad} ${H + 2 * pad}`} className="w-full h-40 bg-white rounded-[3px] border border-[#2e333a]">
      {walls.map(w => <line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#000" strokeWidth={sw} strokeLinecap="square" />)}
      <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} stroke="#000" strokeWidth={sw * 0.8} />
      <polygon points={head} fill="#000" />
      <text x={arrow.tx} y={arrow.ty} fontSize={a * 0.55} textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="bold" fill="#000">FRONT</text>
    </svg>
  );
};
