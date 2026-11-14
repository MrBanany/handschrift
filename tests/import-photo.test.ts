import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { saveMany, loadSet } from '../src/glyphstore/db';
import { extractPage } from '../src/segmentation/extract';
import { fitHomography, type Raster } from '../src/segmentation/register';
import { MARKS, MM, TEMPLATE_PAGES } from '../src/template/layout';
import { filledPage, rotation, shade, warp } from './photo';

const mem = new Map<string, string>(); // db.ts keeps its backup markers in localStorage
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k),
  key: (i: number) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
} });

const ink = (a: Uint8Array) => a.reduce((s, v) => s + v, 0) / 255;

describe('Einlesen: Fotos und Härtefälle', () => {
  const base = filledPage(0, 40);
  const ref = extractPage(base);
  const { width: W, height: H } = base;

  /** Same boxes, same letters (not noise), ink about as heavy as in the clean page. */
  function expectSame(img: Raster) {
    const r = extractPage(img);
    expect(r.page).toBe(0);
    expect(r.variants.map((v) => v.src)).toEqual(ref.variants.map((v) => v.src));
    r.variants.forEach((v, i) => expect(ink(v.alpha) / ink(ref.variants[i].alpha)).toBeGreaterThan(0.5));
    r.variants.forEach((v, i) => expect(ink(v.alpha) / ink(ref.variants[i].alpha)).toBeLessThan(1.6));
  }
  /** Photo in which the four marks land on `quad` (clockwise from top left, px). */
  const quadPhoto = (w: number, h: number, quad: [number, number][]) => {
    const marks = [MARKS[0], MARKS[1], MARKS[3], MARKS[2]].map(([x, y]) => [x * MM, y * MM] as [number, number]);
    return warp(base, w, h, fitHomography(quad, marks));
  };

  it('schiefes Foto (10°, Seite kleiner als das Bild)', () => expectSame(warp(base, W, H, rotation(10, W, H, 0.85))), 60_000);
  it('Seite liegt mitten in einem größeren Foto', () => expectSame(warp(base, Math.round(W * 1.15), Math.round(H * 1.15), [1, 0, -0.07 * W, 0, 1, -0.07 * H, 0, 0, 1])), 60_000);
  it('perspektivisch verzerrt', () => expectSame(quadPhoto(2400, 3200, [[300, 250], [2100, 100], [2250, 2950], [120, 3100]])), 60_000);
  it('Foto um 90° oder 180° gedreht', () => {
    expectSame(warp(base, H, W, [0, 1, 0, -1, 0, H, 0, 0, 1]));
    expectSame(warp(base, W, H, [-1, 0, W, 0, -1, H, 0, 0, 1]));
  }, 60_000);
  it('dunkel und ungleichmäßig beleuchtet: weder Buchstaben verloren noch leere Kästchen gefüllt', () => {
    expectSame(shade(base, () => 0.4));
    expectSame(shade(base, (x, y) => 1 - (0.65 * (x + y)) / 2));
  }, 60_000);

  it('Schatten über einem Kästchen ist keine Handschrift', () => {
    const p = filledPage(0, 5);
    const b = TEMPLATE_PAGES[0][30]; // an empty box
    for (let y = b.y; y < b.y + b.h; y += 0.1) for (let x = b.x; x < b.x + b.w; x += 0.1) {
      const u = Math.round(x * MM), v = Math.round(y * MM);
      p.data.fill(60, (v * p.width + u) * 4, (v * p.width + u) * 4 + 3);
    }
    expect(extractPage(p).variants.map((v) => v.src)).not.toContain(b.id);
  });

  it('nur halb ausgefüllt: nur die geschriebenen Kästchen', () => {
    expect(extractPage(filledPage(0, 7)).variants).toHaveLength(7);
  });

  it('Seiten in beliebiger Reihenfolge, auch die mit vielen Code-Feldern, werden an ihrer Kennung erkannt', () => {
    for (const page of [7, TEMPLATE_PAGES.length - 1, 3]) expect(extractPage(filledPage(page, 4)).page).toBe(page);
  }, 60_000);

  it('falsche Datei: verständliche Meldung statt Müll', () => {
    const white: Raster = { data: new Uint8ClampedArray(W * H * 4).fill(255), width: W, height: H };
    expect(() => extractPage(white)).toThrow('Passermarken nicht gefunden');
    const noise = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < noise.length; i += 4) { const v = (i * 2654435761) % 7 < 2 ? 0 : 255; noise.fill(v, i, i + 3); noise[i + 3] = 255; }
    expect(() => extractPage({ data: noise, width: W, height: H })).toThrow(/Passermarken|Seitenkennung/);
  }, 60_000);

  it('doppelt importiert: dieselben Proben ersetzen sich, nichts wird doppelt', async () => {
    await saveMany('Doppelt', ref.variants);
    await saveMany('Doppelt', extractPage(base).variants);
    expect(await loadSet('Doppelt')).toHaveLength(ref.variants.length);
  });
});
