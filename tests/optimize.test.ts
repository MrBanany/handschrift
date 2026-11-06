import { describe, expect, it } from 'vitest';
import { optimize, pairGap } from '../src/glyphstore/optimize';
import type { Variant } from '../src/glyphstore/types';

/** Variant with solid ink rectangles [x0, y0, x1, y1] (px), baseline at row 100. */
function v(key: string, src: string, rects: number[][], extra: Partial<Variant> = {}): Variant {
  const w = 80, h = 140, alpha = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) alpha[y * w + x] = 255;
  return { src, key, w, h, alpha, baseline: 100, entry: null, exit: null, strokeW: 5, ...extra };
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
    const pair = (k: number, gap = 10) => v('st', `p${k}`, [[0, 50, 30, 100], [30 + gap, 50, 80, 100]], { connected: false });
    const t = optimize([0, 1, 2, 3, 4].map((k) => pair(k)).concat(pair(5, 40)));
    expect([...t.excluded]).toEqual(['p5']);
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
