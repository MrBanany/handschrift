import { describe, expect, it } from 'vitest';
import { EMPH, HEAD, MARK, STRUCT, clean } from '../src/renderer/clean';
import { chem } from '../src/renderer/latex';

describe('clean pasted AI text', () => {
  const has = (ch: string) => /[\p{L}\p{N} .,:!?'"\-–>]/u.test(ch);
  it('strips Markdown and maps arrows, bullets and emoji to writable characters', () => {
    const md = '## Ergebnis\n\n**Photosynthese** → *Glucose* 🌱\n\n- Licht -> Energie\n* `CO2` + Wasser\n\n\n[Quelle](https://x.de)';
    const [b, e] = EMPH; // headings and bold stay marked, the layout underlines them
    expect(clean(md, has)).toBe(`${HEAD}${b}Ergebnis${e}\n\n${b}Photosynthese${e} -> Glucose\n\n- Licht -> Energie\n- CO2 + Wasser\n\nQuelle`);
  });
  it('keeps [[structures]] as one word in the line and leaves SMILES untouched', () => {
    const [a, z] = STRUCT;
    expect(clean('Ethanol: [[Ethanol]] brennt.', has)).toBe(`Ethanol: ${a}Ethanol${z} brennt.`);
    expect(clean('[[CC(=O)O]] und [[C/C=C\\C]]', has)).toBe(`${a}CC(=O)O${z} und ${a}C/C=C\\C${z}`);
    expect(clean('[[Essigsäure skelett]],', has)).toBe(`${a}Essigsäure\u0010skelett${z} ,`);
  });
  it('writes ion charges small and raised', () => {
    const all = () => true;
    expect(clean('$\\ce{Na+ + Cl-}$ und $\\ce{SO4^2-}$, $Ca^{2+}$', all)).toBe('Na⁺ + Cl⁻ und SO₄²⁻, Ca²⁺');
    expect(clean('x^2-3', all)).toBe('x²-3');
  });
  it('keeps arrows the handwriting has', () => {
    expect(clean('a → b', (c) => c !== '>' )).toBe('a → b');
  });
  it('keeps double and two-way arrows and superscripts, or falls back to what can be written', () => {
    expect(clean('A => B ⇔ C <-> D, x^2 − 1 m^3', () => true)).toBe('A ⇒ B ⇔ C ↔ D, x² - 1 m³');
    expect(clean('✅ Vorteil\n❌ Nachteil 🌱', (c) => c !== '🌱')).toBe('✓ Vorteil\n✗ Nachteil');
    expect(clean('x^{10} + H_2O, a_1', () => true)).toBe('x¹⁰ + H₂O, a₁');
    expect(clean('x^4', (c) => c !== '⁴')).toBe('x^4');
    expect(clean('$10^{-3}$ m, s^-1', () => true)).toBe('10⁻³ m, s⁻¹');
  });
  it('turns LaTeX and chemistry from AI answers into writable characters', () => {
    const all = () => true;
    expect(clean('$\\frac{a+b}{2} \\cdot \\sqrt{x} \\approx 3,5 \\pm 0,1$', all)).toBe('\u0011a+b\u00122\u0013 · √x ≈ 3,5 ± 0,1');
    expect(clean('\\[ v = \\frac{\\Delta s}{\\Delta t} \\]', all)).toBe('v = \u0011Δ\u0010s\u0012Δ\u0010t\u0013');
    // a fraction inside a fraction or a root stays on one line; punctuation stays attached
    expect(clean('$\\frac{\\frac{1}{2}}{3}$, $\\sqrt{\\frac{a}{b}}$', all)).toBe('\u00111/2\u00123\u0013, √(a/b)');
    expect(clean('Winkel $90^\\circ$, $x^{2}$, $\\text{km}^2$', all)).toBe('Winkel 90°, x², km²');
    expect(clean('$\\ce{6CO2 + 6H2O -> C6H12O6 + 6O2}$', all)).toBe('6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂');
    expect(clean('CO2 und H2SO4 auf A4, MP3, Ca(OH)2', all)).toBe('CO₂ und H₂SO₄ auf A4, MP3, Ca(OH)₂');
    expect(clean('N2 + 3H2 \\rightleftharpoons 2NH3', all)).toBe('N₂ + 3H₂ ⇌ 2NH₃');
    expect(chem('Seite2')).toBe('Seite2');
  });
  it('marks ==highlighted== text, but leaves a == b alone', () => {
    expect(clean('Das ist ==sehr wichtig== und a == b', () => true)).toBe(`Das ist ${MARK[0]}sehr wichtig${MARK[1]} und a == b`);
    const plain = (c: string) => /[A-Za-z0-9 ,^>-]/.test(c);
    expect(clean('A => B ⇔ C <-> D, x^2', plain)).toBe('A -> B - C - D, x^2');
  });
});
