import { describe, expect, it } from 'vitest';
import type { GlyphMeta } from '../src/glyphstore/types';
import { FIT_MIN, fitSize } from '../src/renderer/fit';
import { layout, type Settings } from '../src/renderer/layout';

// Page count as a made-up function: the smaller the letters, the fewer lines the text wraps into (never below `floor`).
const pagesOf = (lines: number, floor = 1) => (xh: number) => Math.ceil(Math.max(floor, (lines * xh) / 2.6) / 30);

describe('fitSize', () => {
  it('leaves the size alone when the text already fits', () => {
    expect(fitSize(2.6, pagesOf(20))).toBe(2.6);
  });

  it('shrinks the letters just enough, in steps of 0.1', () => {
    const r = fitSize(2.6, pagesOf(40))!; // 40 lines of 30 per page: needs a scale of 0.75
    expect(pagesOf(40)(r)).toBe(1);
    expect(r).toBeLessThan(2.6);
    expect(pagesOf(40)(r + 0.1)).toBe(2); // no more than needed
    expect(r * 10).toBeCloseTo(Math.round(r * 10), 6);
  });

  it('gives up below the lower limit instead of writing tiny', () => {
    expect(fitSize(2.6, pagesOf(60))).toBeNull(); // would need 0.5
    const edge = fitSize(2.6, pagesOf(48))!; // needs 1.625 mm = 0.625 x: just possible
    expect(edge / 2.6).toBeGreaterThanOrEqual(FIT_MIN - 0.01);
  });

  it('gives up when smaller letters do not help (short lines, line spacing fixed)', () => {
    expect(fitSize(2.6, () => 2)).toBeNull();
  });

  it("never goes below the slider's smallest size", () => {
    expect(fitSize(1.3, pagesOf(80))).toBeNull(); // would need 0.8 mm, the slider stops at 1.1
  });

  it('fits a real layout() on one page and keeps the line spacing', () => {
    const glyph = (key: string, i: number): GlyphMeta => ({ src: `${key}-${i}`, key, w: 60, h: 120, baseline: 100, strokeW: 5, entry: { x: 2, y: 98, dx: 0.7, dy: -0.7, w: 5 }, exit: { x: 58, y: 95, dx: 0.8, dy: -0.6, w: 5 } });
    const lib = new Map([...'abcdefghilmnorstu'].map((c) => [c, [glyph(c, 0), glyph(c, 1)]]));
    const S: Settings = { xh: 3, lineH: 10, margin: 15, pageW: 210, pageH: 297, hasty: 0.3, seed: 7 };
    // one paragraph: at xh 3 it wraps into about 30 lines (two pages at 10 mm), smaller letters need fewer
    const text = 'das ist ein satz mit worten '.repeat(70);
    const count = (xh: number) => layout(text, lib, { ...S, xh }).pages.length;
    expect(count(3)).toBeGreaterThan(1);
    const xh = fitSize(3, count);
    expect(xh).not.toBeNull();
    expect(xh!).toBeLessThan(3);
    expect(count(xh!)).toBe(1);
  });
});
