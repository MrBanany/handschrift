import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { deleteSet, exportAll, exportBackup, freeName, importBackup, listSets, loadSet, renameSet, saveMany, staleSets, markSaved, storageError, isDirty } from '../src/glyphstore/db';
import type { Variant } from '../src/glyphstore/types';

const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; },
  } });
});

const glyph = (src: string, key: string, fill: number): Variant => ({
  src, key, w: 4, h: 3, baseline: 2, entry: { x: 0, y: 1, dx: 1, dy: 0, w: 1 }, exit: null, strokeW: 1.5, connected: true, scale: 0.9,
  alpha: Uint8Array.from({ length: 12 }, (_, i) => (i * fill) % 256),
});
const fileOf = (b: Blob, name = 'x.json') => new File([b], name);
const prefs = { style: '{"xh":3.4,"lineH":9,"lines":12}', cursive: '1', review: '{"a":"accept","b":"reject"}' };
const fill = (set: string) => { for (const [k, v] of Object.entries(prefs)) store.set(`${k}:${set}`, v); };

describe('Backup: Export → Löschen → Import', () => {
  it('bringt Handschrift und Einstellungen unverändert zurück', async () => {
    await saveMany('Anna', [glyph('p1-1', 'a', 7), glyph('p1-2', 'ch', 13)]);
    fill('Anna');
    const before = await loadSet('Anna');
    const file = fileOf(await exportBackup('Anna'));
    await deleteSet('Anna');
    expect(await listSets()).not.toContain('Anna');
    for (const k of Object.keys(prefs)) expect(store.has(`${k}:Anna`)).toBe(false); // Löschen räumt auf
    const { sets, count } = await importBackup(file);
    expect(sets).toEqual(['Anna']);
    expect(count).toBe(2);
    expect(await loadSet('Anna')).toEqual(before);
    for (const [k, v] of Object.entries(prefs)) expect(store.get(`${k}:Anna`)).toBe(v);
  });

  it('alte Sicherungen (ohne prefs) lassen sich weiter laden', async () => {
    const vs = [glyph('o-1', 'b', 5)].map((v) => ({ ...v, alpha: btoa(String.fromCharCode(...v.alpha)) }));
    const old = new File([JSON.stringify({ format: 'handschrift', version: 2, set: 'Alt', variants: vs })], 'alt.json');
    expect((await importBackup(old)).sets).toEqual(['Alt']);
    expect((await loadSet('Alt'))[0].alpha).toEqual(glyph('o-1', 'b', 5).alpha);
  });

  it('Alle-Backup: mehrere Handschriften, Namenskonflikt wird umbenannt', async () => {
    await saveMany('Ben', [glyph('b-1', 'x', 3)]);
    fill('Ben');
    const file = fileOf(await exportAll(['Anna', 'Ben']));
    const { sets } = await importBackup(file, (n, ex) => (ex.includes(n) ? freeName(n, ex) : n));
    expect(sets).toEqual(['Anna (2)', 'Ben (2)']);
    expect(await loadSet('Ben (2)')).toHaveLength(1);
    expect(store.get('cursive:Ben (2)')).toBe('1');
    expect(await loadSet('Anna')).toHaveLength(2); // das Original bleibt unberührt
  });

  it('beschädigte Datei schreibt nichts', async () => {
    const bad = new File([JSON.stringify({ format: 'handschrift', sets: [{ set: 'Gut', variants: [] }, { set: 'Kaputt', variants: [{ src: 's', key: 'a', w: 2, h: 2, alpha: 'AA==' }] }] })], 'bad.json');
    await expect(importBackup(bad)).rejects.toThrow('beschädigt');
    expect(await listSets()).not.toContain('Gut');
  });
});

describe('Umbenennen, Löschen, Erinnerung', () => {
  it('Umbenennen nimmt Einstellungen mit und lässt keinen Rest zurück', async () => {
    await renameSet('Ben (2)', 'Bernd');
    expect(await listSets()).toContain('Bernd');
    expect(await listSets()).not.toContain('Ben (2)');
    expect(store.get('review:Bernd')).toBe(prefs.review);
    expect([...store.keys()].some((k) => k.endsWith(':Ben (2)'))).toBe(false);
    await expect(renameSet('Bernd', 'Anna')).rejects.toThrow('gibt es schon');
  });

  it('Erinnerung erst nach Tagen, und nicht mehr nach dem Sichern', async () => {
    expect(staleSets(3)).toEqual([]);
    store.set('dirty:Anna', String(Date.now() - 4 * 864e5));
    expect(staleSets(3)).toEqual(['Anna']);
    markSaved(['Anna']);
    expect(staleSets(3)).toEqual([]);
  });
});

describe('Speicher voll / abgebrochene Transaktion (P1)', () => {
  it('lehnt ab statt zu hängen, mit verständlicher Meldung bei vollem Speicher', async () => {
    const orig = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: Parameters<IDBObjectStore['put']>) { const r = orig.apply(this, a); this.transaction.abort(); return r; };
    try { await expect(saveMany('Voll', [glyph('v-1', 'a', 3)])).rejects.toThrow('abgebrochen'); }
    finally { IDBObjectStore.prototype.put = orig; }
    expect(await listSets()).not.toContain('Voll');
    expect(storageError(new DOMException('x', 'QuotaExceededError')).message).toBe('Speicher voll – Backup sichern, alte Handschrift löschen.');
  });
});

describe('Geteilte Dateien prüfen (P5)', () => {
  const pack = (v: Record<string, unknown>) => ({ ...v, alpha: btoa(String.fromCharCode(...glyph('x', 'a', 3).alpha)) });
  const ok = () => pack({ ...glyph('t-1', 'a', 3) });
  const file = (...vs: object[]) => new File([JSON.stringify({ format: 'handschrift', set: 'Fremd', variants: vs })], 'f.json');
  const refused = async (v: object, msg = 'beschädigt') => {
    await expect(importBackup(file(v))).rejects.toThrow(msg);
    expect(await listSets()).not.toContain('Fremd');
  };

  it('NaN-Baseline, Baseline absurd, riesiges w, schiefer Anker, falscher scale', async () => {
    await refused({ ...ok(), baseline: null }); // JSON macht aus NaN null
    await refused({ ...ok(), baseline: 9999 });
    await refused({ ...ok(), w: 1e9 });
    await refused({ ...ok(), entry: { x: 500, y: 1, dx: 1, dy: 0, w: 1 } });
    await refused({ ...ok(), scale: 50 });
    await refused({ ...ok(), strokeW: -1 });
    await refused({ ...ok(), alpha: '!!!' });
  });

  it('Zusatzfelder und prof werden verworfen, Gültiges bleibt', async () => {
    const { sets } = await importBackup(file({ ...ok(), evil: 'x', prof: { l: [1], r: [1] }, set: 'anderer' }));
    expect(sets).toEqual(['Fremd']);
    const [v] = await loadSet('Fremd');
    expect(Object.keys(v).sort()).toEqual(['alpha', 'baseline', 'connected', 'entry', 'exit', 'h', 'key', 'scale', 'set', 'src', 'strokeW', 'w']);
    expect(v.set).toBe('Fremd');
  });

  it('Einstellungen aus der Datei werden geprüft', async () => {
    const f = new File([JSON.stringify({ format: 'handschrift', set: 'Pref', variants: [ok()], prefs: { style: '{"xh":"x","lineH":9,"lines":3}', cursive: '7', review: '{"a":"accept","b":"evil"}' } })], 'p.json');
    await importBackup(f);
    expect(store.has('style:Pref')).toBe(false);
    expect(store.has('cursive:Pref')).toBe(false);
    expect(store.get('review:Pref')).toBe('{"a":"accept"}');
  });
});

describe('Speicher-Fixes: Löschen-Angebot, gleicher Name, Umbenennen', () => {
  it('ungesichert = isDirty; nach dem Sichern nicht mehr', async () => {
    await saveMany('Neu', [glyph('n-1', 'a', 3)]);
    expect(isDirty('Neu')).toBe(true);
    markSaved(['Neu']);
    expect(isDirty('Neu')).toBe(false);
  });

  it('Umbenennen nimmt den Gesichert-Status mit (und den Zeitpunkt, wenn ungesichert)', async () => {
    await renameSet('Neu', 'Neu2');
    expect(isDirty('Neu2')).toBe(false);
    store.set('dirty:Neu2', '12345');
    await renameSet('Neu2', 'Neu3');
    expect(store.get('dirty:Neu3')).toBe('12345');
    expect(store.has('dirty:Neu2')).toBe(false);
  });

  it('Backup unter gleichem Namen überschreibt nichts Vorhandenes, ergänzt nur', async () => {
    await saveMany('Eins', [glyph('b-1', 'a', 3), glyph('b-2', 'b', 3)]);
    store.set('cursive:Eins', '1');
    const old = fileOf(await exportBackup('Eins'));
    await deleteSet('Eins'); // neuerer Stand: b-1 neu gezeichnet, b-3 dazu, b-2 fehlt, andere Einstellung
    await saveMany('Eins', [glyph('b-1', 'a', 9), glyph('b-3', 'c', 5)]);
    store.set('cursive:Eins', '0');
    const { count } = await importBackup(old);
    const now = await loadSet('Eins');
    expect(count).toBe(1); // nur b-2 kommt dazu
    expect(now.map((v) => v.src).sort()).toEqual(['b-1', 'b-2', 'b-3']);
    expect(now.find((v) => v.src === 'b-1')!.alpha).toEqual(glyph('b-1', 'a', 9).alpha);
    expect(store.get('cursive:Eins')).toBe('0'); // vorhandene Einstellung bleibt
  });
});
