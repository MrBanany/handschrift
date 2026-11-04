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

describe('text style analysis', () => {
  it('measures size, line spacing and gaps of free writing', () => {
    const lines = measureLines(notesPage(), 10);
    expect(lines).toHaveLength(8);
    const s = summarize(lines)!;
    expect(s.xh).toBeGreaterThan(2.7); expect(s.xh).toBeLessThan(3.3);
    expect(s.lineH).toBeCloseTo(9, 0);
    expect(s.wordGap).toBeGreaterThan(0.85); expect(s.wordGap).toBeLessThan(1.15); // 3 mm / 3 mm
    expect(s.letterGap).toBeGreaterThan(0.15); expect(s.letterGap).toBeLessThan(0.25); // 0.6 mm / 3 mm
  });

  it('gives up instead of guessing on too little text', () => {
    expect(splitGaps([1, 1, 1])).toBeNull();
    expect(summarize([])).toBeNull();
  });
});
