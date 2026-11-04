import type { Variant } from './types';

/** Samples imported before handwriting sets existed belong to this set. */
export const DEFAULT_SET = 'Meine Handschrift';
const STORE = 'glyphs';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('handschrift', 2);
    req.onupgradeneeded = (e) => {
      const d = req.result;
      const store = d.createObjectStore(STORE, { keyPath: ['set', 'src'] });
      store.createIndex('set', 'set');
      if (e.oldVersion < 1) return;
      // v1 had one unnamed set keyed by box id: move it into DEFAULT_SET.
      const old = req.transaction!.objectStore('variants');
      old.openCursor().onsuccess = (ev) => {
        const c = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (c) { store.put({ ...c.value, set: DEFAULT_SET }); c.continue(); } else d.deleteObjectStore('variants');
      };
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    t.onerror = () => reject(t.error);
  }));
}

export async function listSets(): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.index('set').getAllKeys());
  return [...new Set(keys.map((k) => (k as [string, string])[0]))].sort((a, b) => a.localeCompare(b, 'de'));
}
export const loadSet = (set: string) => tx<Variant[]>('readonly', (s) => s.index('set').getAll(set));
export const remove = (set: string, src: string) => tx<undefined>('readwrite', (s) => s.delete([set, src]));
/** put() keyed by set + box id: re-importing a page replaces its old samples instead of duplicating them. */
export const saveMany = (set: string, vs: Variant[]) => tx<void>('readwrite', (s) => { for (const v of vs) s.put({ ...v, set }); });
export const deleteSet = (set: string) => tx<void>('readwrite', (s) => {
  s.index('set').openCursor(set).onsuccess = (ev) => {
    const c = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (c) { c.delete(); c.continue(); }
  };
});

// Backup file: JSON with base64 bitmaps.
const b64 = (a: Uint8Array) => { let s = ''; for (const c of a) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function exportBackup(set: string): Promise<Blob> {
  const all = await loadSet(set);
  const json = JSON.stringify({ format: 'handschrift', version: 2, set, variants: all.map(({ prof: _p, ...v }) => ({ ...v, alpha: b64(v.alpha) })) });
  return new Blob([json], { type: 'application/json' });
}

export async function importBackup(file: File): Promise<{ set: string; count: number }> {
  const data = JSON.parse(await file.text());
  if (data?.format !== 'handschrift' || !Array.isArray(data.variants)) throw new Error('Keine gültige Handschrift-Sicherung.');
  const set = typeof data.set === 'string' && data.set.trim() ? data.set.trim() : DEFAULT_SET;
  const vs: Variant[] = data.variants.map((v: Variant & { alpha: string }) => {
    if (typeof v.src !== 'string' || typeof v.key !== 'string' || !(v.w > 0) || !(v.h > 0)) throw new Error('Sicherung beschädigt.');
    const alpha = unb64(v.alpha);
    if (alpha.length !== v.w * v.h) throw new Error('Sicherung beschädigt.');
    return { ...v, alpha };
  });
  await saveMany(set, vs);
  return { set, count: vs.length };
}
