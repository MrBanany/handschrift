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
// Per-set settings kept in localStorage as `<name>:<set>`; they travel with the set (backup, rename, delete).
const PREFS = ['style', 'cursive', 'review'];
const DIRTY = 'dirty'; // ms timestamp of the first change since the last backup (not part of a backup)
const prefsOf = (set: string) => Object.fromEntries(PREFS.flatMap((p) => { const v = localStorage.getItem(`${p}:${set}`); return v === null ? [] : [[p, v]]; }));
const markDirty = (set: string) => { if (!localStorage.getItem(`${DIRTY}:${set}`)) localStorage.setItem(`${DIRTY}:${set}`, String(Date.now())); };
/** Names of handwritings changed more than `days` ago and not backed up since. */
export const staleSets = (days: number) => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter((k) => k.startsWith(`${DIRTY}:`) && Date.now() - Number(localStorage.getItem(k)) > days * 864e5).map((k) => k.slice(DIRTY.length + 1));
export const markSaved = (sets: string[]) => sets.forEach((s) => localStorage.removeItem(`${DIRTY}:${s}`));
export { markDirty };

/** put() keyed by set + box id: re-importing a page replaces its old samples instead of duplicating them. */
export const saveMany = async (set: string, vs: Variant[]) => { await tx<void>('readwrite', (s) => { for (const v of vs) s.put({ ...v, set }); }); markDirty(set); };
export const remove = async (set: string, src: string) => { await tx<undefined>('readwrite', (s) => s.delete([set, src])); markDirty(set); };
export const deleteSet = async (set: string) => {
  await tx<void>('readwrite', (s) => {
    s.index('set').openCursor(set).onsuccess = (ev) => {
      const c = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (c) { c.delete(); c.continue(); }
    };
  });
  [...PREFS, DIRTY].forEach((p) => localStorage.removeItem(`${p}:${set}`));
};

/** First "name (2)", "name (3)" … not yet taken. */
export function freeName(name: string, taken: string[]) {
  let n = 2;
  while (taken.includes(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

export async function renameSet(from: string, to: string) {
  to = to.trim();
  if (!to) throw new Error('Der Name darf nicht leer sein.');
  if (to === from) return;
  if ((await listSets()).includes(to)) throw new Error(`„${to}“ gibt es schon.`);
  await saveMany(to, await loadSet(from));
  for (const p of [...PREFS, DIRTY]) { const v = localStorage.getItem(`${p}:${from}`); if (v !== null) localStorage.setItem(`${p}:${to}`, v); }
  await deleteSet(from);
}

// Backup file: JSON with base64 bitmaps. One handwriting: { set, variants, prefs } (as before, so old app versions still read it);
// all of them: { sets: [{ set, variants, prefs }] }.
const b64 = (a: Uint8Array) => { let s = ''; for (const c of a) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pack(set: string) {
  const all = await loadSet(set);
  return { set, variants: all.map(({ prof: _p, ...v }) => ({ ...v, alpha: b64(v.alpha) })), prefs: prefsOf(set) };
}
const asBlob = (o: object) => new Blob([JSON.stringify({ format: 'handschrift', version: 3, ...o })], { type: 'application/json' });

export const exportBackup = async (set: string) => asBlob(await pack(set));
export const exportAll = async (sets: string[]) => asBlob({ sets: await Promise.all(sets.map(pack)) });

/** `pick` chooses the name each handwriting is stored under (e.g. to ask on a clash); returning null skips it. */
export async function importBackup(file: File, pick: (name: string, existing: string[]) => string | null = (n) => n): Promise<{ sets: string[]; count: number }> {
  const data = JSON.parse(await file.text());
  if (data?.format !== 'handschrift') throw new Error('Keine gültige Handschrift-Sicherung.');
  const entries: { set?: unknown; variants?: unknown; prefs?: unknown }[] = Array.isArray(data.sets) ? data.sets : [data];
  const parsed = entries.map((e) => {
    if (!Array.isArray(e.variants)) throw new Error('Keine gültige Handschrift-Sicherung.');
    const vs: Variant[] = e.variants.map((v: Variant & { alpha: string }) => {
      if (typeof v.src !== 'string' || typeof v.key !== 'string' || !(v.w > 0) || !(v.h > 0)) throw new Error('Sicherung beschädigt.');
      const alpha = unb64(v.alpha);
      if (alpha.length !== v.w * v.h) throw new Error('Sicherung beschädigt.');
      return { ...v, alpha };
    });
    const name = typeof e.set === 'string' && e.set.trim() ? e.set.trim() : DEFAULT_SET;
    return { name, vs, prefs: (e.prefs ?? {}) as Record<string, unknown> };
  });
  // everything is checked before anything is written
  const sets: string[] = [];
  let count = 0;
  for (const { name, vs, prefs } of parsed) {
    const to = pick(name, await listSets())?.trim();
    if (!to) continue;
    await saveMany(to, vs);
    for (const p of PREFS) {
      const v = prefs[p];
      if (typeof v !== 'string') continue;
      try { JSON.parse(v); localStorage.setItem(`${p}:${to}`, v); } catch { /* damaged value: keep the defaults */ }
    }
    sets.push(to);
    count += vs.length;
  }
  return { sets, count };
}
