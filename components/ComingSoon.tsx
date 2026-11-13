import React from 'react';
import { Icon, Screen, UI, btnPrimary } from './ui';

export const ComingSoon: React.FC<{ title: string; icon: string; onClose: () => void }> = ({ title, icon, onClose }) => (
  <Screen crumb={title} onHome={onClose}>
    <main className="flex-1 grid place-items-center">
      <div className="text-center max-w-sm">
        <div style={{ color: UI.dim }} className="flex justify-center"><Icon n={icon} s={30} /></div>
        <div className="mt-3 font-semibold" style={{ color: '#e6e9ed' }}>{title}</div>
        <div className="mt-1 text-xs" style={{ color: UI.dim }}>This studio is not available yet.</div>
        <button onClick={onClose} className={`${btnPrimary} mt-4`}>Back to dashboard</button>
      </div>
    </main>
  </Screen>
);
