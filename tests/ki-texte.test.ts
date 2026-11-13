import { describe, expect, it } from 'vitest';
import type { GlyphMeta } from '../src/glyphstore/types';
import { SYMBOLS } from '../src/glyphstore/symbols';
import { SUB, SUB_LETTERS, SUP, SUP_LETTERS, clean } from '../src/renderer/clean';
import { layout, type Settings } from '../src/renderer/layout';
import { ANSWERS } from './ki-answers';

// What the app's writer has: letters, digits, punctuation, raised/lowered characters and the drawn symbols.
const extra = new Set([...SUP, ...SUB, '⁺', '⁻', ...Object.values(SUP_LETTERS), ...Object.values(SUB_LETTERS), ...Object.keys(SYMBOLS), '⇌', '–', '€']);
const has = (ch: string) => extra.has(ch) || /[\p{L}\p{N} .,:;!?'"\-()/+*=%&@•]/u.test(ch);
const glyph = (key: string): GlyphMeta => ({
  src: `${key}-0`, key, w: 60, h: 120, baseline: 100, strokeW: 5,
  entry: { x: 2, y: 98, dx: 0.7, dy: -0.7, w: 5 }, exit: { x: 58, y: 95, dx: 0.8, dy: -0.6, w: 5 },
});
const S: Settings = { xh: 3, lineH: 10, margin: 15, pageW: 210, pageH: 297, hasty: 0.3, seed: 7 };

describe('realistic AI answers', () => {
  for (const [name, answer] of Object.entries(ANSWERS)) {
    it(`${name}: no LaTeX left over, nothing runs off the page`, () => {
      const out = clean(answer, has);
      expect(out).not.toMatch(/\[A-Za-z]|\\|\{|\}|\u001[bc]/); // backslashes, braces, our own placeholders
      expect(out).not.toMatch(/\$(?!\s*\d|\s*\/)/); // a "$" only as a currency sign
      expect(out).not.toMatch(/(?:frac|sqrt|text|boxed|begin|end|binom|displaystyle|quad)\b/);
      const chars = new Set([...out].filter((c) => !/[\s\u0001-\u001f]/.test(c)));
      const lib = new Map([...chars].map((c) => [c, [glyph(c), { ...glyph(c), src: `${c}-1` }]]));
      const { pages } = layout(out.replace(/[\u000e\u000f][^\u000e\u000f]*[\u000e\u000f]/g, ' '), lib, S); // structures need smiles-drawer, see structure.test.ts
      expect(pages.length).toBeGreaterThan(0);
      for (const p of pages) for (const g of p.glyphs) {
        expect(g.m[4] + g.m[0] * g.g.w).toBeLessThan(S.pageW - S.margin / 2);
        expect(g.m[5]).toBeLessThan(S.pageH);
      }
    });
  }
});
