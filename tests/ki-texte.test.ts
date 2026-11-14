import { describe, expect, it } from 'vitest';
import type { GlyphMeta } from '../src/glyphstore/types';
import { SYMBOLS } from '../src/glyphstore/symbols';
import { SUB, SUB_LETTERS, SUP, SUP_LETTERS, clean } from '../src/renderer/clean';
import { layout, type Settings } from '../src/renderer/layout';
import { ANSWERS } from './ki-answers';
import { MEHR } from './ki-mehr';

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
      expect(out.replace(/\u001b[^\u001c\n]*\u001c→/g, '→')).not.toMatch(/\[A-Za-z]|\\|\{|\}|\u001[bc]/); // backslashes, braces, our own placeholders (an arrow's label is allowed)
      expect(out).not.toMatch(/\$(?!\s*\d|\s*\/)/); // a "$" only as a currency sign
      expect(out).not.toMatch(/(?:frac|sqrt|text|boxed|begin|binom|displaystyle|quad)\b|\bend\b/); // "end" alone: "grundlegend" is German
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

// What went wrong with these before (ki-mehr.ts): each line one fix
describe('AI answer details', () => {
  const c = (k: keyof typeof MEHR) => clean(MEHR[k], has);
  it('code block: written as it stands, indents kept', () => {
    expect(c('gemini_code_python')).toContain('# Liste anlegen\nzahlen = [3, 1, 2]\n## Sortieren');
    expect(c('gemini_code_python')).toContain('def __init__(self):\n\u0018return self.x * 2');
  });
  it('HTML tags, autolinks, tracking parameters', () => {
    expect(c('html_tags')).toBe('\u0002Wasser\u0003 ist H₂O, die Fläche ist 5 m².\n\nNeue Zeile nach \u0002br\u0003 und kursiv, \u0002stark\u0003.');
    expect(c('gpt_tabelle_br')).toContain('Chromosomen kondensieren, Kernhülle löst sich auf');
    expect(c('gpt_links_urls')).not.toMatch(/[<>]|utm_/);
  });
  it('footnotes and [1][2] go', () => expect(c('fussnoten')).toBe('Die Französische Revolution begann 1789 mit dem Sturm auf die Bastille.\nSie veränderte Europa grundlegend.'));
  it('emoji: keycaps become numbers, no space left inside a heading', () => {
    expect(c('gemini_emojis')).toMatch(/^\u0006\u0002Versuch/);
    expect(c('gemini_emojis')).toContain('\n1. Kartoffel schneiden\n2. ');
  });
  it('LaTeX: equation, \\tag, \\label, \\cfrac, \\limits, siunitx, mhchem', () => {
    expect(c('gpt_align')).toContain('2x + y = 7 (1)\nx - y = 2 (2)');
    expect(c('gpt_align')).toContain('3x = 9 ⇒ x = 3\n');
    expect(c('frac_fliesstext')).toContain('\u00111\u00122\u0013-Wert');
    expect(c('gemini_cases_und_lim')).toContain('lim(n → ∞)');
    expect(c('siunitx')).toBe('Gegeben: v = 12 m/s, m = 1,5 kg, T = 20 °C\nGesucht: p in kg·m/s\np = m · v = 18 kg·m/s\ng = 9,81 m/s², V = 2 cm³, 3·10⁸');
    expect(c('chemie_gleichungen')).toContain('CaO + CO₂ ↑');
    expect(c('chemie_gleichungen')).toContain('Fe(OH)₃ ↓');
    expect(c('chemie_gleichungen')).toContain('c = 0,1 mol/L');
    expect(c('gpt_latex_pfeile')).toBe('a > 0 ⇔ f ist steigend\nA ↔ B, x ← y\nx ≥ 0 und y ≤ 1\nAB = (1; 2)\n∫∫_A f dA und ∫_C F · ds');
  });
  it('Markdown: escapes, setext and closing-hash headings, italic inside a word', () => {
    expect(c('markdown_escapes')).toBe('5 * 3 = 15\n1. Platz: Anna\nPreis - Rabatt = Endpreis\na₁ und 50% und R&D');
    expect(c('setext_ueberschrift')).toBe('\u0006\u0002Zusammenfassung\u0003\n\nDie Zelle ist die kleinste Einheit des Lebens.\n\n\u0006\u0002Aufbau\u0003\n\n• Zellmembran');
    expect(c('fett_im_wort')).toContain('Zellplasma');
  });
  it('characters without a handwriting sample get a stand-in', () => {
    expect(clean('« ja » ‹ so › 0,5 ‰ ℝ © ⅓', (ch) => /[A-Za-z\d ,"'()]/.test(ch))).toBe('" ja " \' so \' 0,5 Promille R (c) \u00111\u00123\u0013');
  });
});
