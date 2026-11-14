import { describe, expect, it } from 'vitest';
import type { GlyphMeta } from '../src/glyphstore/types';
import { FIT_MIN, fitSize } from '../src/renderer/fit';
import { layout, type Settings } from '../src/renderer/layout';

// Page count as a made-up function: pages grow with the height the lines need.
const pagesOf = (lines: number) => (_xh: number, lineH: number) => Math.ceil((lines * lineH) / 267);

describe('fitSize', () => {
  it('leaves the size alone when the text already fits', () => {
    expect(fitSize(2.6, 8.7, pagesOf(20))).toEqual({ xh: 2.6, lineH: 8.7 });
  });

  it('shrinks size and spacing together, just enough, in steps of 0.1', () => {
    const r = fitSize(2.6, 8.7, pagesOf(40))!; // 40 lines x 8.7 mm = 348 mm: needs a scale of about 0.77
    expect(pagesOf(40)(r.xh, r.lineH)).toBe(1);
    expect(r.lineH).toBeLessThan(8.7);
    expect(r.xh / 2.6).toBeCloseTo(r.lineH / 8.7, 1); // the same scale for both
    expect(pagesOf(40)(r.xh, r.lineH + 0.2)).toBe(2); // no more than needed
    expect(r.lineH * 10).toBeCloseTo(Math.round(r.lineH * 10), 6);
  });

  it('gives up below the lower limit instead of writing tiny', () => {
    expect(fitSize(2.6, 8.7, pagesOf(60))).toBeNull(); // would need about 0.51
    const edge = fitSize(2.6, 8.7, pagesOf(50))!; // needs about 0.61: just possible
    expect(edge.lineH / 8.7).toBeGreaterThanOrEqual(FIT_MIN - 0.01);
  });

  it("never goes below the sliders' smallest values", () => {
    expect(fitSize(1.2, 3.8, pagesOf(100))).toBeNull(); // 3.8 mm spacing is nearly at the slider's 3.6 and 100 lines need 380 mm
  });

  it('fits a real layout() on one page', () => {
    const glyph = (key: string, i: number): GlyphMeta => ({ src: `${key}-${i}`, key, w: 60, h: 120, baseline: 100, strokeW: 5, entry: { x: 2, y: 98, dx: 0.7, dy: -0.7, w: 5 }, exit: { x: 58, y: 95, dx: 0.8, dy: -0.6, w: 5 } });
    const lib = new Map([...'abcdefghilmnorstu'].map((c) => [c, [glyph(c, 0), glyph(c, 1)]]));
    const S: Settings = { xh: 3, lineH: 10, margin: 15, pageW: 210, pageH: 297, hasty: 0.3, seed: 7 };
    const text = Array.from({ length: 14 }, () => 'das ist ein langer satz mit vielen worten, der nicht in eine zeile passt und noch weiter geht').join('\n');
    const count = (xh: number, lineH: number) => layout(text, lib, { ...S, xh, lineH }).pages.length;
    expect(count(3, 10)).toBeGreaterThan(1);
    const r = fitSize(3, 10, count);
    expect(r).not.toBeNull();
    expect(count(r!.xh, r!.lineH)).toBe(1);
  });
});
