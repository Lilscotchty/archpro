// utils/drafting/persist.ts
// Autosave (IndexedDB, includes the underlay) and plan files (.archpro.json) so work is never lost.
import { ProjectState } from '../../types';
import { sanitizeProject } from './project';

const DB = 'archpro-drafting', STORE = 'kv', KEY = 'session';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('IndexedDB unavailable')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error ?? new Error('IndexedDB error'));
  });
}

export async function saveSession(p: ProjectState): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ project: p, savedAt: Date.now() }, KEY);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch { return false; }
}

export async function loadSession(): Promise<{ project: ProjectState; savedAt: number } | null> {
  try {
    const db = await open();
    const rec = await new Promise<any>((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    db.close();
    if (!rec?.project) return null;
    return { project: sanitizeProject(rec.project), savedAt: Number(rec.savedAt) || 0 };
  } catch { return null; }
}

export async function clearSession(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* nothing to clear */ }
}

export const FILE_FORMAT = 'archpro-plan';
export const projectToFile = (p: ProjectState): string => JSON.stringify({ format: FILE_FORMAT, version: 1, savedAt: new Date().toISOString(), project: p });

export function parseProjectFile(text: string): ProjectState {
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (!j || j.format !== FILE_FORMAT || !j.project) throw new Error('That is not an ArchPro plan file.');
  return sanitizeProject(j.project);
}
