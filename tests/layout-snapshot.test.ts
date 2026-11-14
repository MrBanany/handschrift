import { describe, expect, it } from 'vitest';
import type { GlyphMeta } from '../src/glyphstore/types';
import { SYMBOLS } from '../src/glyphstore/symbols';
import { SUB, SUB_LETTERS, SUP, SUP_LETTERS, clean } from '../src/renderer/clean';
import { layout, type Settings } from '../src/renderer/layout';
import { ANSWERS } from './ki-answers';

// Snapshots of what layout() makes of the realistic AI answers, so that splitting layout.ts up (plan P8) or any other
// change shows every glyph that moved. Fixed seed, a made-up handwriting with two variants per character (as in
// ki-texte.test.ts; layout() only reads the glyphs' measures, not their pictures).
// A wanted change: look at the diff, then `npx vitest run tests/layout-snapshot.test.ts -u`.
const extra = new Set([...SUP, ...SUB, '⁺', '⁻', ...Object.values(SUP_LETTERS), ...Object.values(SUB_LETTERS), ...Object.keys(SYMBOLS), '⇌', '–', '€']);
const has = (ch: string) => extra.has(ch) || /[\p{L}\p{N} .,:;!?'"\-()/+*=%&@•]/u.test(ch);
const glyph = (key: string, i: number): GlyphMeta => ({
  src: `${key}-${i}`, key, w: 60, h: 120, baseline: 100, strokeW: 5,
  entry: { x: 2, y: 98, dx: 0.7, dy: -0.7, w: 5 }, exit: { x: 58, y: 95, dx: 0.8, dy: -0.6, w: 5 },
});
const S: Settings = { xh: 3, lineH: 10, margin: 15, pageW: 210, pageH: 297, hasty: 0.3, seed: 7 };
const r = (x: number, digits = 1) => { const v = Number(x.toFixed(digits)); return Object.is(v, -0) ? 0 : v; };

function snapshot(answer: string) {
  const text = clean(answer, has).replace(/[\u000e\u000f][^\u000e\u000f]*[\u000e\u000f]/g, ' '); // structures need smiles-drawer, see structure.test.ts
  const chars = [...new Set([...text].filter((c) => !/[\s\u0001-\u001f]/.test(c)))].sort();
  const lib = new Map(chars.map((c) => [c, [glyph(c, 0), glyph(c, 1)]]));
  const { pages } = layout(text, lib, S);
  return {
    pages: pages.length,
    content: pages.map((p) => ({
      lines: p.lines.map((l) => l.text),
      // one glyph per entry: source, x, y (mm), rotation (degrees), scale
      glyphs: p.glyphs.map(({ g, m, accent }) => `${g.src} ${r(m[4])} ${r(m[5])} ${r((Math.atan2(m[1], m[0]) * 180) / Math.PI)}° x${r(Math.hypot(m[0], m[1]), 3)}${accent ? ' accent' : ''}`),
      // joins between letters and pen strokes (underlines, arrows, boxes, fraction bars): start -> end, width
      connectors: p.connectors.map((c) => `${r(c.p[0][0])},${r(c.p[0][1])} -> ${r(c.p[3][0])},${r(c.p[3][1])} w${r((c.w0 + c.w1) / 2, 2)}${c.accent ? ' accent' : ''}`),
      marks: p.marks.map((k) => `${r(k.x0)},${r(k.y0)} -> ${r(k.x1)},${r(k.y1)} h${r(k.h)}`),
      missing: p.missing.length,
    })),
  };
}

describe('layout snapshots', () => {
  for (const [name, answer] of Object.entries(ANSWERS)) {
    it(name, () => {
      const a = snapshot(answer);
      expect(snapshot(answer)).toEqual(a); // same seed, same page: otherwise the snapshot would be worthless
      expect(a).toMatchSnapshot();
    });
  }
});
