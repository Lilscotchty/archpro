// components/drafting/icons.tsx — line icons for the drafting tool palette (24px grid, 1.6 stroke).
import React from 'react';

const P: Record<string, string> = {
  select: 'M6 3l12 8.5-5.2 1.1L15.5 19l-2.4 1-2.7-6.4L6.5 17z',
  pan: 'M8 13V5a1.5 1.5 0 013 0v6m0-7a1.5 1.5 0 013 0v7m0-5a1.5 1.5 0 013 0v8a6 6 0 01-6 6h-1a6 6 0 01-5-3l-3-5a1.5 1.5 0 012-2l2 2',
  wall: 'M3 16l13-13 5 5L8 21zM7 12l5 5M11 8l5 5',
  rect: 'M4 5h16v14H4zM7 8h10v8H7z',
  door: 'M4 20V4m0 16h5m-5 0h16M4 4a16 16 0 0116 16',
  window: 'M3 8h18v8H3zM3 12h18M12 8v8',
  grid: 'M3 8h18M3 16h18M8 3v18M16 3v18M4 4h2M4 20h2',
  measure: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  scale: 'M4 7v10M20 7v10M4 12h16M8 9v6M12 9v6M16 9v6',
  align: 'M4 12h16M12 4v16M6 6l12 12',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  upload: 'M12 16V4m0 0l-4 4m4-4l4 4M4 20h16',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  open: 'M3 7h6l2 2h10v10H3zM3 11h18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  flip: 'M12 3v18M8 7L3 12l5 5M16 7l5 5-5 5',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  check: 'M5 12l5 5 9-10',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
};

export const DIcon: React.FC<{ n: string; s?: number }> = ({ n, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={P[n] ?? ''} /></svg>
);
