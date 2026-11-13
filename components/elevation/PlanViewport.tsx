// components/elevation/PlanViewport.tsx
// Zoom / pan viewport for a plan image with an SVG overlay in IMAGE-PIXEL
// coordinates. It turns pointer input into image-space events so the studio
// never has to think about zoom or scroll.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pt } from '../../utils/elevation/types';

interface Props {
  src: string;
  width: number;
  height: number;
  /** left-drag pans (hand tool) */
  panTool?: boolean;
  cursor?: string;
  onHover?: (p: Pt, e: React.PointerEvent, zoom: number) => void;
  onLeave?: () => void;
  /** a click that was not a drag/pan */
  onClickPt?: (p: Pt, e: React.PointerEvent, zoom: number) => void;
  onDoubleClickPt?: (p: Pt, e: React.MouseEvent, zoom: number) => void;
  /** return true to take ownership of the drag (then onDrag / onDragEnd are called) */
  onDragStart?: (p: Pt, e: React.PointerEvent, zoom: number) => boolean;
  onDrag?: (p: Pt, e: React.PointerEvent, zoom: number) => void;
  onDragEnd?: (p: Pt, e: React.PointerEvent, zoom: number) => void;
  /** overlay drawn inside an <svg viewBox="0 0 w h"> – receives the current zoom so strokes/text can stay a constant size */
  overlay?: (zoom: number) => React.ReactNode;
  children?: React.ReactNode;
}

export const PlanViewport: React.FC<Props> = ({
  src, width, height, panTool, cursor, onHover, onLeave, onClickPt, onDoubleClickPt,
  onDragStart, onDrag, onDragEnd, overlay, children,
}) => {
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ zoom: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const spaceDown = useRef(false);
  const gesture = useRef<null | { mode: 'pending' | 'pan' | 'own'; sx: number; sy: number; tx: number; ty: number; id: number }>(null);

  const fit = useCallback(() => {
    const el = wrap.current;
    if (!el || !width || !height) return;
    const z = Math.min(el.clientWidth / width, el.clientHeight / height) * 0.95;
    setView({ zoom: z, tx: (el.clientWidth - width * z) / 2, ty: (el.clientHeight - height * z) / 2 });
  }, [width, height]);

  useLayoutEffect(() => { fit(); }, [fit, src]);
  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLTextAreaElement)) { spaceDown.current = true; e.preventDefault(); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // wheel zoom around the cursor (non-passive so we can preventDefault)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const v = viewRef.current;
      const k = Math.exp(-e.deltaY * 0.0015);
      const z = Math.min(12, Math.max(0.05, v.zoom * k));
      const ix = (mx - v.tx) / v.zoom, iy = (my - v.ty) / v.zoom;
      setView({ zoom: z, tx: mx - ix * z, ty: my - iy * z });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toImg = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrap.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (e.clientX - r.left - v.tx) / v.zoom, y: (e.clientY - r.top - v.ty) / v.zoom };
  };

  const zoomBy = (k: number) => {
    const el = wrap.current; if (!el) return;
    const v = viewRef.current;
    const mx = el.clientWidth / 2, my = el.clientHeight / 2;
    const z = Math.min(12, Math.max(0.05, v.zoom * k));
    const ix = (mx - v.tx) / v.zoom, iy = (my - v.ty) / v.zoom;
    setView({ zoom: z, tx: mx - ix * z, ty: my - iy * z });
  };

  const handleDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const v = viewRef.current;
    const forcePan = panTool || e.button === 1 || spaceDown.current;
    if (forcePan) { gesture.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty, id: e.pointerId }; return; }
    const owned = onDragStart ? onDragStart(toImg(e), e, v.zoom) : false;
    gesture.current = { mode: owned ? 'own' : 'pending', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty, id: e.pointerId };
  };

  const handleMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (g && g.id === e.pointerId) {
      if (g.mode === 'own') { onDrag?.(toImg(e), e, viewRef.current.zoom); return; }
      const moved = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
      if (g.mode === 'pending' && moved > 5) g.mode = 'pan';
      if (g.mode === 'pan') { setView(v => ({ ...v, tx: g.tx + e.clientX - g.sx, ty: g.ty + e.clientY - g.sy })); return; }
    }
    onHover?.(toImg(e), e, viewRef.current.zoom);
  };

  const handleUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId) return;
    if (g.mode === 'own') onDragEnd?.(toImg(e), e, viewRef.current.zoom);
    else if (g.mode === 'pending') onClickPt?.(toImg(e), e, viewRef.current.zoom);
  };

  return (
    <div className="relative w-full h-full select-none">
      <div
        ref={wrap}
        className="absolute inset-0 overflow-hidden bg-slate-600"
        style={{ cursor: cursor ?? 'crosshair', touchAction: 'none' }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={() => onLeave?.()}
        onDoubleClick={e => onDoubleClickPt?.(toImg(e), e, viewRef.current.zoom)}
        onContextMenu={e => e.preventDefault()}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, width, height, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.zoom})`, transformOrigin: '0 0' }}>
          <img src={src} width={width} height={height} draggable={false} alt="plan" style={{ display: 'block', background: '#fff', boxShadow: '0 0 0 1px #475569' }} />
          <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
            {overlay?.(view.zoom)}
          </svg>
        </div>
      </div>
      {children}
      <div className="absolute right-3 bottom-3 flex flex-col gap-1 z-10">
        <button className="w-8 h-8 rounded bg-slate-900/90 border border-slate-600 text-white hover:bg-slate-700" onClick={() => zoomBy(1.25)} title="Zoom in">+</button>
        <button className="w-8 h-8 rounded bg-slate-900/90 border border-slate-600 text-white hover:bg-slate-700" onClick={() => zoomBy(0.8)} title="Zoom out">−</button>
        <button className="w-8 h-8 rounded bg-slate-900/90 border border-slate-600 text-white hover:bg-slate-700 text-[10px]" onClick={fit} title="Fit to window">FIT</button>
      </div>
      <div className="absolute left-3 bottom-3 z-10 text-[10px] text-slate-300 bg-slate-900/80 px-2 py-1 rounded pointer-events-none">
        Scroll = zoom · drag / Space+drag = pan
      </div>
    </div>
  );
};
