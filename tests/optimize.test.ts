import { describe, expect, it } from 'vitest';
import { optimize, pairGap } from '../src/glyphstore/optimize';
import { penWidth } from '../src/glyphstore/pen';
import type { Variant } from '../src/glyphstore/types';

/** Variant with solid ink rectangles [x0, y0, x1, y1] (px), baseline at row 100. */
function v(key: string, src: string, rects: number[][], extra: Partial<Variant> = {}): Variant {
  const w = 80, h = 140, alpha = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) alpha[y * w + x] = 255;
  return { src, key, w, h, alpha, baseline: 100, entry: null, exit: null, strokeW: 5, ...extra };
}

/** Unjoined pair 's' + 't' in a 160 px wide box with the given gap (px; x-height is 50 px). */
function wide(k: number, gap = 10): Variant {
  const w = 160, h = 140, alpha = new Uint8Array(w * h);
  for (const [x0, x1] of [[40, 70], [70 + gap, 100 + gap]]) for (let y = 50; y < 100; y++) for (let x = x0; x < x1; x++) alpha[y * w + x] = 255;
  return { src: `p${k}`, key: 'st', w, h, alpha, baseline: 100, entry: null, exit: null, strokeW: 5, connected: false };
}

describe('optimize', () => {
  it('pulls floating letters back to the baseline, leaves descenders alone', () => {
    const t = optimize([v('i', 'i1', [[10, 40, 16, 85]]), v('g', 'g1', [[10, 50, 40, 130]])]);
    const i = t.variants.find((x) => x.src === 'i1')!, g = t.variants.find((x) => x.src === 'g1')!;
    expect(i.baseline).toBe(84); // ink ended 16 px above the line
    expect(g.baseline).toBe(100);
    const half = optimize([v('i', 'i1', [[10, 40, 16, 85]])], 0.5).variants[0];
    expect(half.baseline).toBe(92);
    expect(optimize([v('i', 'i1', [[10, 40, 16, 85]])], 0).variants[0].baseline).toBe(100);
    // a colon written high: its lower dot goes onto the line in full, even at gentle strength
    const colon = optimize([v(':', 'c1', [[10, 40, 16, 46], [10, 70, 16, 76]])], 0.4).variants[0];
    expect(colon.baseline).toBe(75);
    // school-cursive z with its tail below the line: neither pulled up nor shrunk
    const zu = optimize([v('zu', 'z1', [[0, 60, 30, 125], [30, 60, 70, 100]]), ...['a', 'e', 'n'].map((k) => v(k, k, [[0, 50, 30, 100]]))]).variants[0];
    expect(zu.baseline).toBe(100);
    expect(zu.scale ?? 1).toBe(1);
  });

  it('evens out sizes of one character', () => {
    const t = optimize([v('o', 'o1', [[0, 60, 40, 100]]), v('o', 'o2', [[0, 40, 40, 100]])]);
    const [s1, s2] = t.variants.map((x) => x.scale!);
    expect(s1).toBeGreaterThan(1); // smaller one grows
    expect(s2).toBeCloseTo(1);
  });

  it('brings small letters to one common height', () => {
    const t = optimize(['a', 'e', 'n', 'o'].map((k, i) => v(k, k, [[0, i === 3 ? 70 : 50, 40, 100]])));
    const o = t.variants.find((x) => x.src === 'o')!.scale!;
    expect(o).toBeCloseTo(1 + (49 / 29 - 1) * 0.6); // the short "o" grows towards the others (heights after baseline snap)
    expect(t.variants.find((x) => x.src === 'a')!.scale).toBeCloseTo(1);
  });

  it('drops a size outlier but keeps at least two variants', () => {
    const ok = [1, 2, 3].map((k) => v('a', `a${k}`, [[0, 50, 40, 100]]));
    const huge = v('a', 'a4', [[0, 0, 80, 100]]);
    const t = optimize([...ok, huge]);
    expect([...t.excluded]).toEqual(['a4']);
    expect(optimize([ok[0], huge]).excluded.size).toBe(0);
  });

  it('learns the letter gap from separate pairs', () => {
    const pair = (k: number) => v('en', `p${k}`, [[0, 50, 30, 100], [30 + 10, 50, 80, 100]], { connected: false });
    expect(pairGap(pair(0))).toBe(10);
    const t = optimize([0, 1, 2, 3, 4].map(pair));
    expect(t.letterGap).toBeCloseTo(10 / 50);
    expect(optimize([pair(0)]).letterGap).toBeNull(); // too few samples to trust
  });

  it('leaves out pairs written with a word-sized gap', () => {
    const pair = wide;
    const t = optimize([0, 1, 2, 3, 4].map((k) => pair(k)).concat(pair(5, 60)));
    expect([...t.excluded]).toEqual(['p5']);
  });

  it('keeps pairs with an ordinary letter gap, even when optimising strongly', () => {
    const pair = wide;
    // gap 0.5 x-heights: wider than usual, but no word gap (the user saw such pairs crossed out)
    expect(optimize([0, 1, 2, 3, 4].map((k) => pair(k)).concat(pair(5, 25)), 1.5).excluded.size).toBe(0);
  });
});

describe('review merge', () => {
  it('uses strong, original or automatic per character', async () => {
    const { merge, reviewKeys } = await import('../src/glyphstore/optimize');
    const raw = [v('i', 'i1', [[10, 40, 16, 85]]), v('n', 'n1', [[10, 50, 40, 80]])];
    const auto = optimize(raw, 0.5), strong = optimize(raw, 1.5);
    expect(reviewKeys(raw, strong).sort()).toEqual(['i', 'n']);
    const m = merge(raw, auto, strong, { i: 'accept', n: 'reject' });
    expect(m.variants.find((x) => x.src === 'i1')!.baseline).toBe(84);
    expect(m.variants.find((x) => x.src === 'n1')!.baseline).toBe(100);
    expect(merge(raw, auto, strong, {}).variants.find((x) => x.src === 'i1')!.baseline).toBe(92);
  });
});

describe('pen width', () => {
  it('evens out thick and thin strokes and sets dots to a sensible size', () => {
    // vertical bars 3, 4 and 6 px wide (a thin pen, the median and a fat one), plus a full stop written as a 14 x 10 px blob
    const bars = [3, 4, 6].map((w, i) => v('l', `l${i}`, [[10, 20, 10 + w, 100]]));
    const stop = v('.', 'p1', [[10, 90, 24, 100]]);
    const t = optimize([...bars, ...['a', 'e', 'n', 'o', 'u', 'm', 'r', 'c'].map((k) => v(k, k, [[10, 60, 14, 100], [26, 60, 30, 100]])), stop], 1);
    const widths = t.variants.filter((x) => x.key === 'l').map(penWidth);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.6);
    const dot = t.variants.find((x) => x.key === '.')!;
    let ink = 0;
    for (const a of dot.alpha) ink += a / 255;
    expect(Math.abs(Math.sqrt((4 * ink) / Math.PI) - 3.4 * 4.57)).toBeLessThan(3); // the blob is about 3.4 pen widths across
    // off: untouched
    expect(optimize(bars, 0).variants[0].alpha).toBe(bars[0].alpha);
  });
});
