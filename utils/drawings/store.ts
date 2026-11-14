// utils/drawings/store.ts
// Drawing storage. Cloud = Supabase Storage (files) + a `drawings` table (metadata + the page data that produced each drawing).
// Local = IndexedDB in this browser. Cloud is used when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set and
// Supabase anonymous sign-in works; otherwise the app keeps working with local storage and says so.

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DrawingMeta, SaveInput } from './types';

const ENV = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {});
const URL_ = ENV.VITE_SUPABASE_URL;
const KEY_ = ENV.VITE_SUPABASE_ANON_KEY;
const BUCKET = 'drawings';
export const cloudConfigured = !!(URL_ && KEY_);

// ---------------------------------------------------------------- project id and change events
const PID = 'archpro.projectId';
export function getProjectId(): string {
  try { let id = localStorage.getItem(PID); if (!id) { id = crypto.randomUUID(); localStorage.setItem(PID, id); } return id; }
  catch { return 'local-session'; }
}
export function newProjectId(): string { const id = crypto.randomUUID(); try { localStorage.setItem(PID, id); } catch { /* blocked */ } notify(); return id; }
export const projectCode = (pid = getProjectId()) => pid.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'PROJ';
export const refFor = (suffix: string, pid = getProjectId()) => `${projectCode(pid)}-${suffix}`;

type Listener = () => void;
const listeners = new Set<Listener>();
export const subscribe = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const notify = () => listeners.forEach(f => f());

// ---------------------------------------------------------------- status
export interface StoreStatus { configured: boolean; backend: 'cloud' | 'local'; error: string | null; user: string | null }
let status: StoreStatus = { configured: cloudConfigured, backend: 'local', error: cloudConfigured ? null : 'Supabase is not configured (.env.local). Drawings are kept in this browser only.', user: null };
export const getStatus = () => status;

// ---------------------------------------------------------------- cloud backend
let sb: SupabaseClient | null = null;
let sessionPromise: Promise<string | null> | null = null;
const client = () => (sb ??= createClient(URL_!, KEY_!, { auth: { persistSession: true, autoRefreshToken: true } }));

async function cloudUser(): Promise<string | null> {
  if (!cloudConfigured) return null;
  sessionPromise ??= (async () => {
    try {
      const c = client();
      const { data } = await c.auth.getSession();
      if (data.session) return data.session.user.id;
      const { data: s, error } = await c.auth.signInAnonymously();
      if (error || !s.user) throw new Error(error?.message ?? 'no user');
      return s.user.id;
    } catch (e) {
      status = { ...status, backend: 'local', error: `Supabase sign-in failed (${(e as Error).message}). Enable Anonymous sign-ins in Authentication settings. Using local storage meanwhile.` };
      sessionPromise = null; notify(); return null;
    }
  })();
  return sessionPromise;
}

const toMeta = (r: any, backend: 'cloud' | 'local'): DrawingMeta => ({
  id: r.id, ref: r.ref, projectId: r.project_id, kind: r.kind, title: r.title, origin: r.origin, generated: r.generated, mime: r.mime,
  width: r.width, height: r.height, version: r.version, createdAt: r.created_at, updatedAt: r.updated_at, backend,
});
const ext = (mime: string) => (mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : mime.includes('pdf') ? 'pdf' : 'bin');

async function cloudPut(uid: string, projectId: string, ref: string, i: SaveInput): Promise<DrawingMeta> {
  const c = client();
  const { data: prev, error: e0 } = await c.from('drawings').select('id,version,created_at').eq('project_id', projectId).eq('ref', ref).maybeSingle();
  if (e0) throw e0;
  const path = `${uid}/${projectId}/${ref}.${ext(i.blob.type)}`;
  const up = await c.storage.from(BUCKET).upload(path, i.blob, { upsert: true, contentType: i.blob.type, cacheControl: '60' });
  if (up.error) throw up.error;
  const row = {
    id: prev?.id ?? crypto.randomUUID(), project_id: projectId, ref, kind: i.kind, title: i.title, origin: i.origin, generated: i.generated,
    mime: i.blob.type, storage_path: path, width: Math.round(i.width), height: Math.round(i.height), version: (prev?.version ?? 0) + 1, data: i.data,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await c.from('drawings').upsert(row, { onConflict: 'owner,project_id,ref' }).select('id,ref,project_id,kind,title,origin,generated,mime,width,height,version,created_at,updated_at').single();
  if (error) throw error;
  return toMeta(data, 'cloud');
}

// ---------------------------------------------------------------- local backend (IndexedDB)
const DB = 'archpro-drawings', ST = 'drawings';
const idb = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'key' });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await idb();
  return new Promise<T>((res, rej) => { const q = fn(db.transaction(ST, mode).objectStore(ST)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
};
type LocalRow = { key: string; meta: DrawingMeta; blob: Blob; data: unknown };

async function localPut(projectId: string, ref: string, i: SaveInput): Promise<DrawingMeta> {
  const key = `${projectId}|${ref}`;
  const prev = await tx<LocalRow | undefined>('readonly', s => s.get(key));
  const now = new Date().toISOString();
  const meta: DrawingMeta = { id: prev?.meta.id ?? crypto.randomUUID(), ref, projectId, kind: i.kind, title: i.title, origin: i.origin, generated: i.generated, mime: i.blob.type,
    width: Math.round(i.width), height: Math.round(i.height), version: (prev?.meta.version ?? 0) + 1, createdAt: prev?.meta.createdAt ?? now, updatedAt: now, backend: 'local' };
  await tx('readwrite', s => s.put({ key, meta, blob: i.blob, data: i.data } satisfies LocalRow));
  return meta;
}

// ---------------------------------------------------------------- facade
const lastHash = new Map<string, string>();
async function hashOf(i: SaveInput): Promise<string> {
  const v = new Uint8Array(await i.blob.arrayBuffer());
  let h = 0x811c9dc5;                                   // FNV-1a over every byte, so any change is noticed
  for (let k = 0; k < v.length; k++) { h ^= v[k]; h = Math.imul(h, 0x01000193); }
  let d = 0x811c9dc5; const js = JSON.stringify(i.data ?? null);
  for (let k = 0; k < js.length; k++) { d ^= js.charCodeAt(k); d = Math.imul(d, 0x01000193); }
  return `${v.length}:${h >>> 0}:${js.length}:${d >>> 0}:${i.title}`;
}

/** Save (or update) a drawing under its designated ref. Skips the upload when nothing has changed since the last save. */
export async function saveDrawing(i: SaveInput): Promise<DrawingMeta | null> {
  const projectId = getProjectId(), ref = refFor(i.refSuffix, projectId);
  const hash = await hashOf(i);
  if (lastHash.get(ref) === hash) return null;
  let meta: DrawingMeta | null = null;
  const uid = await cloudUser();
  if (uid) {
    try { meta = await cloudPut(uid, projectId, ref, i); status = { ...status, backend: 'cloud', error: null, user: uid }; }
    catch (e) { status = { ...status, backend: 'local', error: `Cloud save failed (${(e as Error).message ?? e}). Saved in this browser instead.` }; }
  }
  if (!meta) meta = await localPut(projectId, ref, i);
  lastHash.set(ref, hash); notify();
  return meta;
}

export async function listDrawings(): Promise<DrawingMeta[]> {
  const pid = getProjectId(); const out: DrawingMeta[] = [];
  const uid = await cloudUser();
  if (uid) {
    const { data, error } = await client().from('drawings').select('id,ref,project_id,kind,title,origin,generated,mime,width,height,version,created_at,updated_at').eq('project_id', pid).order('created_at');
    if (!error && data) out.push(...data.map(r => toMeta(r, 'cloud')));
    else if (error) status = { ...status, error: `Could not list cloud drawings: ${error.message}` };
  }
  try {
    const all = await tx<LocalRow[]>('readonly', s => s.getAll() as IDBRequest<LocalRow[]>);
    all.filter(r => r.meta.projectId === pid && !out.some(o => o.ref === r.meta.ref)).forEach(r => out.push(r.meta));
  } catch { /* IndexedDB unavailable */ }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getDrawingBlob(m: DrawingMeta): Promise<Blob> {
  if (m.backend === 'cloud') {
    const uid = await cloudUser();
    const { data, error } = await client().storage.from(BUCKET).download(`${uid}/${m.projectId}/${m.ref}.${ext(m.mime)}`);
    if (error || !data) throw new Error(error?.message ?? 'download failed');
    return data;
  }
  const r = await tx<LocalRow | undefined>('readonly', s => s.get(`${m.projectId}|${m.ref}`));
  if (!r) throw new Error('Drawing not found in this browser.');
  return r.blob;
}

export async function getDrawingData(m: DrawingMeta): Promise<unknown> {
  if (m.backend === 'cloud') {
    const { data, error } = await client().from('drawings').select('data').eq('id', m.id).single();
    if (error) throw error; return data?.data;
  }
  const r = await tx<LocalRow | undefined>('readonly', s => s.get(`${m.projectId}|${m.ref}`));
  return r?.data;
}

export async function deleteDrawing(m: DrawingMeta): Promise<void> {
  if (m.backend === 'cloud') {
    const uid = await cloudUser();
    await client().storage.from(BUCKET).remove([`${uid}/${m.projectId}/${m.ref}.${ext(m.mime)}`]);
    const { error } = await client().from('drawings').delete().eq('id', m.id); if (error) throw error;
  } else await tx('readwrite', s => s.delete(`${m.projectId}|${m.ref}`));
  lastHash.delete(m.ref); notify();
}

/** Copy drawings kept only in this browser up to Supabase (after cloud has been configured). */
export async function uploadLocalToCloud(): Promise<number> {
  const uid = await cloudUser(); if (!uid) throw new Error(status.error ?? 'Supabase is not available.');
  const rows = await tx<LocalRow[]>('readonly', s => s.getAll() as IDBRequest<LocalRow[]>);
  let n = 0;
  for (const r of rows.filter(x => x.meta.projectId === getProjectId())) {
    await cloudPut(uid, r.meta.projectId, r.meta.ref, { kind: r.meta.kind, refSuffix: '', title: r.meta.title, origin: r.meta.origin, generated: r.meta.generated, blob: r.blob, width: r.meta.width, height: r.meta.height, data: r.data });
    await tx('readwrite', s => s.delete(r.key)); n++;
  }
  notify(); return n;
}
