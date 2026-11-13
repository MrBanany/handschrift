import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { deleteSet, exportAll, exportBackup, freeName, importBackup, listSets, loadSet, renameSet, saveMany, staleSets, markSaved } from '../src/glyphstore/db';
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
const prefs = { style: '{"xh":3.4,"lineH":9}', cursive: '1', review: '{"a":"keep"}' };
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
