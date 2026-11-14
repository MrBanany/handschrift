import { describe, expect, it } from 'vitest';
import type { Library } from '../src/connectors/connect';
import type { Variant } from '../src/glyphstore/types';
import { innerGap, withoutWideGaps } from '../src/renderer/gaps';
import { layout, type Settings } from '../src/renderer/layout';
import { planMindmap, type MapTree } from '../src/renderer/mindmap';

/** A sample made of ink blocks (start, width) in a row, 60 px high. */
const sample = (key: string, blocks: [number, number][]): Variant => {
  const w = Math.max(...blocks.map(([x, l]) => x + l)) + 2, h = 60, alpha = new Uint8ClampedArray(w * h);
  for (const [x, l] of blocks) for (let y = 10; y < 50; y++) for (let i = x; i < x + l; i++) alpha[y * w + i] = 255;
  return { src: `${key}-${blocks.length}-${w}`, key, w, h, baseline: 50, strokeW: 4, alpha } as unknown as Variant;
};

describe('wide holes inside word parts', () => {
  const tight = sample('st', [[2, 20], [24, 20]]), wide = sample('st', [[2, 20], [82, 20]]);
  it('measures the widest empty stretch between inked columns', () => {
    expect(innerGap(tight)).toBe(2);
    expect(innerGap(wide)).toBe(60);
    expect(innerGap(sample('s', [[2, 20]]))).toBe(0);
  });
  const single = (c: string) => [sample(c, [[2, 20]])];
  it('drops only the samples with a hole, and the part itself when none is left', () => {
    const lib: Library = new Map([['s', single('s')], ['t', single('t')], ['st', [tight, wide]], ['xy', [wide]]]);
    const out = withoutWideGaps(lib);
    expect(out.get('st')).toEqual([tight]);
    expect(out.has('xy')).toBe(true); // x and y do not exist alone: a hole is better than a missing letter
    lib.set('x', single('x')); lib.set('y', single('y'));
    expect(withoutWideGaps(lib).has('xy')).toBe(false);
  });
  it('hands back the same library when nothing is wrong', () => {
    const lib: Library = new Map([['s', single('s')], ['t', single('t')], ['st', [tight]]]);
    expect(withoutWideGaps(lib)).toBe(lib);
  });
});

describe('mind map shrinks before it gives up', () => {
  const tree: MapTree = { bullet: '-', topic: 'Photosynthese', branches: [
    { title: 'Lichtreaktion', items: ['- Thylakoid', '- ATP und NADPH'] }, { title: 'Calvin-Zyklus', items: ['- Stroma'] }, { title: 'Chlorophyll', items: [] },
  ] };
  const measure = (t: string, size: number) => t.length * 2.1 * size; // wide handwriting
  const base = { width: 140, xh: 2.6, maxRows: 26, wordGap: 1.4, measure };
  it('writes it smaller instead of a list', () => {
    // find the width where the normal size just fails: there the map must come out smaller, not null
    let w = 140;
    while (planMindmap(tree, { ...base, width: w, measure: (t, s) => t.length * 2.1 * s })?.texts.every((t) => t.size >= 1)) w -= 1;
    const p = planMindmap(tree, { ...base, width: w });
    expect(p, `width ${w}`).not.toBeNull();
    expect(Math.min(...p!.texts.map((t) => t.size))).toBeLessThan(1);
  });
  it('still gives up when even the smallest size is too wide', () => {
    expect(planMindmap(tree, { ...base, measure: (t, s) => t.length * 6 * s })).toBeNull();
  });
});

describe('small marks and spacing', () => {
  const S: Settings = { xh: 3, lineH: 10, margin: 15, pageW: 210, pageH: 297, hasty: 0, seed: 3 };
  const lib: Library = new Map([...'abc,.•-⁺²'].map((c) => [c, [sample(c, [[2, 40]])]]));
  const xs = (text: string) => layout(text, lib, S).pages[0].glyphs.map(({ g, m }) => [g.key, m[4]] as const);
  it('bullets stand in one column', () => {
    for (let seed = 0; seed < 4; seed++) {
      const col = layout('• a\n• b\n• c\n• d', lib, { ...S, seed }).pages[0].glyphs.filter(({ g }) => g.key === '•').map(({ m }) => m[4]);
      expect(Math.max(...col) - Math.min(...col)).toBeLessThan(0.5);
    }
  });
  it('a plus after a letter does not sit on top of it', () => {
    const g = xs('a⁺');
    expect(g[1][1]).toBeGreaterThan(g[0][1] + 1.5);
  });
});
