// components/theme.tsx — dark / light theme. Every UI colour is a CSS variable (--ui-*), switched by data-theme on <html>.
import React, { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'archpro.theme';

export const getTheme = (): Theme => {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
};
export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked: theme still applies for this session */ }
  document.documentElement.setAttribute('data-theme', t);
  window.dispatchEvent(new CustomEvent('archpro-theme', { detail: t }));
}
export function useTheme(): [Theme, (t: Theme) => void] {
  const [t, setT] = useState<Theme>(getTheme);
  useEffect(() => { const on = (e: Event) => setT((e as CustomEvent<Theme>).detail); window.addEventListener('archpro-theme', on); return () => window.removeEventListener('archpro-theme', on); }, []);
  return [t, setTheme];
}

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [t, set] = useTheme();
  const light = t === 'light';
  return (
    <button onClick={() => set(light ? 'dark' : 'light')} title={light ? 'Switch to dark theme' : 'Switch to light theme'} aria-label="Toggle light or dark theme"
      className={`px-2 py-1.5 text-xs border rounded-[var(--ui-r)] hover:bg-[var(--ui-hover)] ${className}`} style={{ borderColor: 'var(--ui-rule)', color: 'var(--ui-text)' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {light ? <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
      </svg>
    </button>
  );
};
