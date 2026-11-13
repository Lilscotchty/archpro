// components/elevation/OpeningThumb.tsx
import React, { useMemo } from 'react';
import { symbolPreview } from '../../utils/elevation/symbols';
import { primsToSVGBody } from '../../utils/elevation/svg';
import { OpeningKind, OpeningStyle } from '../../utils/elevation/types';

export const OpeningThumb: React.FC<{ kind: OpeningKind; style: OpeningStyle; hinge?: 'left' | 'right'; className?: string }> = ({ kind, style, hinge = 'left' as const, className }) => {
  const { html, vb } = useMemo(() => {
    const { prims, vbW, vbH } = symbolPreview(kind, style, hinge);
    return { html: primsToSVGBody(prims), vb: `0 0 ${vbW.toFixed(2)} ${vbH.toFixed(2)}` };
  }, [kind, style, hinge]);
  return (
    <svg viewBox={vb} className={className} style={{ background: '#fff' }} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML={{ __html: html }} />
  );
};
