import { describe, expect, it } from 'vitest';
import { gnHint, goodnotesFile } from '../src/export/goodnotes';
import { layout, type Settings } from '../src/renderer/layout';
import type { Variant } from '../src/glyphstore/types';
import { readGoodnotes } from './gn-reader';

const K = 132 / 25.4; // GoodNotes units per mm

// A tiny handwriting with a vertical bar for every letter of "abnx" – no "^".
const bar = (key: string, i: number): Variant => {
  const w = 20, h = 60, alpha = new Uint8Array(w * h);
  for (let y = 5; y < 50; y++) for (let x = 8; x < 12; x++) alpha[y * w + x] = 255;
  return { src: `${key}-${i}`, key, w, h, alpha, baseline: 50, strokeW: 4, entry: null, exit: null } as unknown as Variant;
};
const lib = new Map([...'abnx'].map((c) => [c, [bar(c, 0), bar(c, 1)]]));
const bySrc = new Map([...lib.values()].flat().map((v) => [v.src, v]));
const S: Settings = { xh: 3, lineH: 10, margin: 15, pageW: 210, pageH: 297, hasty: 0, seed: 1 };

describe('GoodNotes export with a missing character', () => {
  it('marks it with a red box where the picture shows one, instead of leaving it out', async () => {
    const res = layout('n x^b', lib, S);
    expect([...res.missing]).toEqual(['^']);
    const page = res.pages[0], [box] = page.missing;

    const gn = readGoodnotes(await goodnotesFile(page, (src) => bySrc.get(src)!, '#203040'));
    const strokes = gn.strokes(gn.notes[0].path);
    const red = strokes.filter((s) => s.rgba[0] > 0.8 && s.rgba[1] < 0.2);
    expect(red).toHaveLength(1);
    expect(strokes.length - red.length).toBe(3); // n, x, b each one stroke, in ink colour
    for (const s of strokes) if (s !== red[0]) expect(s.rgba[0]).toBeCloseTo(0x20 / 255, 3);

    // the red stroke runs around the box: corners at the box, closed
    const pts = red[0].pts.map(([x, y]) => [x / K, y / K]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(box.x, 1);
    expect(Math.max(...xs)).toBeCloseTo(box.x + box.w, 1);
    expect(Math.min(...ys)).toBeCloseTo(box.y, 1);
    expect(Math.max(...ys)).toBeCloseTo(box.y + box.h, 1);
    expect(pts[0][0]).toBeCloseTo(pts.at(-1)![0], 1);
    expect(pts[0][1]).toBeCloseTo(pts.at(-1)![1], 1);
  });

  it('says what is missing and that the file is always A4', () => {
    expect(gnHint([], 'a4')).toBe('');
    expect(gnHint(['^'], 'a4')).toMatch(/^1 Zeichen fehlt in deiner Handschrift: \^\./);
    expect(gnHint(['^', '∫'], 'a4')).toMatch(/^2 Zeichen fehlen .*: \^ ∫\./);
    expect(gnHint([], 'a5')).toBe('Die GoodNotes-Datei ist immer A4 hochkant.');
    expect(gnHint([], 'a4q')).toContain('immer A4');
    expect(gnHint('abcdefghij', 'a4')).toContain('a b c d e f g h …');
  });
});
