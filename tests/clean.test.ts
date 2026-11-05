import { describe, expect, it } from 'vitest';
import { EMPH, MARK, clean } from '../src/renderer/clean';

describe('clean pasted AI text', () => {
  const has = (ch: string) => /[\p{L}\p{N} .,:!?'"\-–>]/u.test(ch);
  it('strips Markdown and maps arrows, bullets and emoji to writable characters', () => {
    const md = '## Ergebnis\n\n**Photosynthese** → *Glucose* 🌱\n\n- Licht -> Energie\n* `CO2` + Wasser\n\n\n[Quelle](https://x.de)';
    const [b, e] = EMPH; // headings and bold stay marked, the layout underlines them
    expect(clean(md, has)).toBe(`${b}Ergebnis${e}\n\n${b}Photosynthese${e} -> Glucose\n\n- Licht -> Energie\n- CO2 + Wasser\n\nQuelle`);
  });
  it('keeps arrows the handwriting has', () => {
    expect(clean('a → b', (c) => c !== '>' )).toBe('a → b');
  });
  it('keeps double and two-way arrows and superscripts, or falls back to what can be written', () => {
    expect(clean('A => B ⇔ C <-> D, x^2 − 1 m^3', () => true)).toBe('A ⇒ B ⇔ C ↔ D, x² - 1 m³');
    expect(clean('✅ Vorteil\n❌ Nachteil 🌱', (c) => c !== '🌱')).toBe('✓ Vorteil\n✗ Nachteil');
    expect(clean('x^{10} + H_2O, a_1', () => true)).toBe('x¹⁰ + H₂O, a₁');
    expect(clean('x^4', (c) => c !== '⁴')).toBe('x^4');
  });
  it('marks ==highlighted== text, but leaves a == b alone', () => {
    expect(clean('Das ist ==sehr wichtig== und a == b', () => true)).toBe(`Das ist ${MARK[0]}sehr wichtig${MARK[1]} und a == b`);
    const plain = (c: string) => /[A-Za-z0-9 ,^>-]/.test(c);
    expect(clean('A => B ⇔ C <-> D, x^2', plain)).toBe('A -> B - C - D, x^2');
  });
});
