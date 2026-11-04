import type { Variant } from './types';

const STORE = 'variants';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('handschrift', 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'src' });
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

export const loadAll = () => tx<Variant[]>('readonly', (s) => s.getAll());
export const remove = (src: string) => tx<undefined>('readwrite', (s) => s.delete(src));
export const clearAll = () => tx<undefined>('readwrite', (s) => s.clear());
/** put() keyed by box id: re-importing a page replaces its old samples instead of duplicating them. */
export const saveMany = (vs: Variant[]) => tx<void>('readwrite', (s) => { for (const v of vs) s.put(v); });

// Backup file: JSON with base64 bitmaps.
const b64 = (a: Uint8Array) => { let s = ''; for (const c of a) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function exportBackup(): Promise<Blob> {
  const all = await loadAll();
  const json = JSON.stringify({ format: 'handschrift', version: 1, variants: all.map((v) => ({ ...v, alpha: b64(v.alpha) })) });
  return new Blob([json], { type: 'application/json' });
}

export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text());
  if (data?.format !== 'handschrift' || !Array.isArray(data.variants)) throw new Error('Keine gültige Handschrift-Sicherung.');
  const vs: Variant[] = data.variants.map((v: Variant & { alpha: string }) => {
    if (typeof v.src !== 'string' || typeof v.key !== 'string' || !(v.w > 0) || !(v.h > 0)) throw new Error('Sicherung beschädigt.');
    const alpha = unb64(v.alpha);
    if (alpha.length !== v.w * v.h) throw new Error('Sicherung beschädigt.');
    return { ...v, alpha };
  });
  await saveMany(vs);
  return vs.length;
}
