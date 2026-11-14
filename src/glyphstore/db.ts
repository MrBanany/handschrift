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

/** A storage failure as a sentence the user can act on (full storage is the common one on iPads). */
export const storageError = (e: unknown) => new Error(
  (e as Error | null)?.name === 'QuotaExceededError' ? 'Speicher voll – Backup sichern, alte Handschrift löschen.'
    : `Speichern fehlgeschlagen${(e as Error | null)?.message ? `: ${(e as Error).message}` : ' (abgebrochen)'}.`);

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : (undefined as T));
    // a full storage aborts the transaction without a complete: without this the promise never settled
    t.onerror = t.onabort = () => reject(storageError(t.error));
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

const bad = (what: string): never => { throw new Error(`Sicherung beschädigt (${what}).`); };
/** Finite number within [lo, hi], else the file is refused. */
const num = (x: unknown, lo: number, hi: number, what: string) => (typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi ? x : bad(what));
const MAX_SIDE = 2000;

function cleanAnchor(a: unknown, w: number, h: number, what: string): Variant['entry'] {
  if (a === null || a === undefined) return null;
  const o = a as Record<string, unknown>;
  if (typeof a !== 'object') return bad(what);
  return { x: num(o.x, 0, w, `${what}.x`), y: num(o.y, 0, h, `${what}.y`), dx: num(o.dx, -2, 2, `${what}.dx`), dy: num(o.dy, -2, 2, `${what}.dy`), w: num(o.w, 0, MAX_SIDE, `${what}.w`) };
}

/** Files from other people are untrusted: every field is checked and copied; unknown fields and `prof` are dropped. */
function cleanVariant(raw: unknown): Variant {
  if (typeof raw !== 'object' || raw === null) return bad('Probe');
  const v = raw as Record<string, unknown>;
  if (typeof v.src !== 'string' || !v.src || v.src.length > 200) bad('src');
  if (typeof v.key !== 'string' || !v.key || v.key.length > 40) bad('key');
  if (typeof v.alpha !== 'string') bad('alpha');
  const w = num(v.w, 1, MAX_SIDE, 'w'), h = num(v.h, 1, MAX_SIDE, 'h');
  if (!Number.isInteger(w) || !Number.isInteger(h)) bad('Größe');
  const b = v.alpha as string;
  if (b.length > (w * h * 4) / 3 + 8) bad('Bild'); // before decoding, so a huge string costs no memory
  let alpha: Uint8Array;
  try { alpha = unb64(b); } catch { return bad('Bild'); }
  if (alpha.length !== w * h) bad('Bild');
  const out: Variant = {
    src: v.src as string, key: v.key as string, w, h, alpha,
    // real glyphs can sit above their baseline (dash, quotes): it may lie below the bitmap, so only the sane range is checked
    baseline: num(v.baseline, 0, 2 * MAX_SIDE, `„${v.key}“ baseline`),
    entry: cleanAnchor(v.entry, w, h, `„${v.key}“ entry`), exit: cleanAnchor(v.exit, w, h, `„${v.key}“ exit`),
    strokeW: num(v.strokeW, 0, MAX_SIDE, `„${v.key}“ strokeW`),
  };
  if (v.connected !== undefined) { if (typeof v.connected !== 'boolean') bad('connected'); out.connected = v.connected as boolean; }
  if (v.scale !== undefined) out.scale = num(v.scale, 0.2, 5, `„${v.key}“ scale`);
  return out;
}

/** Per-set settings from a file: rebuilt from known fields, or null if unusable (the defaults then apply). */
function cleanPref(name: string, text: unknown): string | null {
  if (typeof text !== 'string' || text.length > 200_000) return null;
  try {
    const v = JSON.parse(text);
    if (name === 'cursive') return v === 0 || v === 1 ? text : null;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    if (name === 'review') return JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k, d]) => k.length <= 40 && (d === 'accept' || d === 'reject'))));
    const ok = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 1000;
    if (!ok(v.xh) || !ok(v.lineH) || !ok(v.lines)) return null; // style: TextStyle
    return JSON.stringify({ xh: v.xh, lineH: v.lineH, lines: v.lines, ...(ok(v.wordGap) && { wordGap: v.wordGap }), ...(ok(v.letterGap) && { letterGap: v.letterGap }), ...(ok(v.pages) && { pages: v.pages }) });
  } catch { return null; }
}

/** `pick` chooses the name each handwriting is stored under (e.g. to ask on a clash); returning null skips it. */
export async function importBackup(file: File, pick: (name: string, existing: string[]) => string | null = (n) => n): Promise<{ sets: string[]; count: number }> {
  const data = JSON.parse(await file.text());
  if (data?.format !== 'handschrift') throw new Error('Keine gültige Handschrift-Sicherung.');
  const entries: { set?: unknown; variants?: unknown; prefs?: unknown }[] = Array.isArray(data.sets) ? data.sets : [data];
  if (entries.length > 100) throw new Error('Sicherung beschädigt (zu viele Handschriften).');
  const parsed = entries.map((e) => {
    if (!Array.isArray(e.variants)) throw new Error('Keine gültige Handschrift-Sicherung.');
    const vs = e.variants.map(cleanVariant);
    const name = typeof e.set === 'string' && e.set.trim() ? e.set.trim().slice(0, 100) : DEFAULT_SET;
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
      const v = cleanPref(p, prefs[p]);
      if (v !== null) localStorage.setItem(`${p}:${to}`, v);
    }
    sets.push(to);
    count += vs.length;
  }
  return { sets, count };
}
