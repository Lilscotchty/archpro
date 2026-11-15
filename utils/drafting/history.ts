// utils/drafting/history.ts — undo / redo for the plan, with explicit checkpoints so a drag is one undo step.
import { useCallback, useRef, useState } from 'react';

export function useHistory<T>(initial: () => T) {
  const [state, setState] = useState<T>(initial);
  const cur = useRef(state);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, bump] = useState(0);

  const set = useCallback((n: T) => { cur.current = n; setState(n); bump(v => v + 1); }, []);
  const push = useCallback(() => { past.current.push(cur.current); if (past.current.length > 100) past.current.shift(); future.current = []; }, []);

  /** Apply a change as one undo step. */
  const commit = useCallback((fn: (p: T) => T) => { push(); set(fn(cur.current)); }, [push, set]);
  /** Apply a change without adding an undo step (live drag updates after a checkpoint). */
  const apply = useCallback((fn: (p: T) => T) => { set(fn(cur.current)); }, [set]);
  const checkpoint = useCallback(() => { push(); bump(v => v + 1); }, [push]);
  /** Discard the last checkpoint (a drag that changed nothing). */
  const dropCheckpoint = useCallback(() => { past.current.pop(); bump(v => v + 1); }, []);
  const undo = useCallback(() => { const p = past.current.pop(); if (p === undefined) return; future.current.push(cur.current); set(p); }, [set]);
  const redo = useCallback(() => { const n = future.current.pop(); if (n === undefined) return; past.current.push(cur.current); set(n); }, [set]);
  /** Replace everything and forget history (new / open). */
  const reset = useCallback((n: T) => { past.current = []; future.current = []; set(n); }, [set]);

  return { state, commit, apply, checkpoint, dropCheckpoint, undo, redo, reset, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
