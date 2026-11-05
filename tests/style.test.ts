import { describe, expect, it } from 'vitest';
import { measureLines, splitGaps, summarize } from '../src/segmentation/style';
import { Painter } from './synthetic';

// Synthetic notes page: "letters" are blocks, x-height 3 mm, letter gap 0.6 mm, word gap 3 mm, line pitch 9 mm.
function notesPage() {
  const p = new Painter();
  for (let l = 0; l < 8; l++) {
    const base = 30 + l * 9;
    p.line([5, base + 1.2], [205, base + 1.2], 0.1, [200, 200, 205]); // ruled paper line, must be ignored
    let x = 15;
    for (let w = 0; w < 6; w++) {
      for (let c = 0; c < 4; c++) {
        const asc = (c + w + l) % 3 === 0 ? 3 : 0; // some ascenders
        p.fill(x, base - 3 - asc, x + 2.4, base, () => true, [20, 20, 30]);
        x += 2.4 + 0.6;
      }
      x += 3 - 0.6;
    }
  }
  return p.img;
}

type RGB = [number, number, number];
// Free writing with real proportions: outlined letters, ascenders 2.2 x-heights tall and descenders that reach into
// the next line, so there is never an empty row between two lines (the usual case in GoodNotes notes).
function writtenPage({ pitch = 7, ink = [20, 20, 30] as RGB, paper = null as RGB | null, rule = null as RGB | null, joined = false } = {}) {
  const p = new Painter();
  if (paper) p.fill(0, 0, 210, 297, () => true, paper);
  const xh = 3, r = 0.2;
  for (let base = 30; base < 280; base += pitch) {
    if (rule) p.line([0, base], [210, base], 0.1, rule);
    let x = 15;
    for (let w = 0; w < 7; w++) {
      for (let c = 0; c < 5; c++) {
        const k = (c * 7 + w * 3 + Math.round(base)) % 5; // 0: ascender, 1: descender, else a small letter
        p.line([x, base - (k === 0 ? 2.2 * xh : xh)], [x, base + (k === 1 ? xh : 0)], r, ink);
        p.line([x, base - xh], [x + 2, base - xh], r, ink);
        p.line([x + 2, base - xh], [x + 2, base], r, ink);
        p.line([x, base], [x + 2, base], r, ink);
        x += joined ? 2 : 2.7;
      }
      x += 3;
    }
  }
  return p.img;
}

describe('text style analysis', () => {
  for (const [name, opts] of [
    ['tight lines that touch', {}],
    ['dark rulings under the writing and a light blue pen', { pitch: 8.7, ink: [90, 170, 240], rule: [120, 120, 120] }],
    ['light writing on dark paper', { pitch: 7.5, ink: [235, 235, 235], paper: [40, 40, 45], rule: [90, 90, 90] }],
  ] as const) {
    it(`finds every line: ${name}`, () => {
      const pitch = (opts as { pitch?: number }).pitch ?? 7;
      const lines = measureLines(writtenPage(opts), 10);
      expect(lines.length).toBe(Math.ceil((280 - 30) / pitch));
      const s = summarize(lines)!;
      expect(s.xh).toBeGreaterThan(3); expect(s.xh).toBeLessThan(3.8); // ink: 3 mm x-height plus the 0.4 mm stroke
      expect(Math.abs(s.lineH - pitch)).toBeLessThan(0.1);
      expect(s.wordGap).toBeGreaterThan(0.8); expect(s.wordGap).toBeLessThan(1.2); // 3 mm / 3 mm (minus the stroke)
    });
  }

  it('keeps size and line spacing when letters are joined and gaps cannot be split', () => {
    const s = summarize(measureLines(writtenPage({ joined: true }), 10))!;
    expect(s.xh).toBeGreaterThan(3); expect(s.xh).toBeLessThan(3.8);
    expect(Math.abs(s.lineH - 7)).toBeLessThan(0.1);
    expect(s.wordGap).toBeUndefined();
  });

  it('measures size, line spacing and gaps of free writing', () => {
    const lines = measureLines(notesPage(), 10);
    expect(lines).toHaveLength(8);
    const s = summarize(lines)!;
    expect(s.xh).toBeGreaterThan(2.7); expect(s.xh).toBeLessThan(3.5);
    expect(s.lineH).toBeCloseTo(9, 0);
    expect(s.wordGap).toBeGreaterThan(0.85); expect(s.wordGap).toBeLessThan(1.15); // 3 mm / 3 mm
    expect(s.letterGap).toBeGreaterThan(0.15); expect(s.letterGap).toBeLessThan(0.25); // 0.6 mm / 3 mm
  });

  it('gives up instead of guessing on too little text', () => {
    expect(splitGaps([1, 1, 1])).toBeNull();
    expect(summarize([])).toBeNull();
  });
});
