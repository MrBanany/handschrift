import { describe, expect, it } from 'vitest';
import { EMPH, HEAD, MARK, STRUCT, SUB, SUB_LETTERS, clean } from '../src/renderer/clean';
import { chem } from '../src/renderer/latex';

describe('clean pasted AI text', () => {
  const has = (ch: string) => /[\p{L}\p{N} .,:!?'"\-–>]/u.test(ch);
  it('strips Markdown and maps arrows, bullets and emoji to writable characters', () => {
    const md = '## Ergebnis\n\n**Photosynthese** → *Glucose* 🌱\n\n- Licht -> Energie\n* `CO2` + Wasser\n\n\n[Quelle](https://x.de)';
    const [b, e] = EMPH; // headings and bold stay marked, the layout underlines them
    expect(clean(md, has)).toBe(`${HEAD}${b}Ergebnis${e}\n\n${b}Photosynthese${e} → Glucose\n\n- Licht → Energie\n- CO2 + Wasser\n\nQuelle`);
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
    expect(clean('$x^n$, $e^{2x}$, $a_n$, snake_case, file_name', () => true)).toBe('xⁿ, e²ˣ, aₙ, snake_case, file_name');
    expect(clean('$\\lim_{x \\to 0}$, $\\sum_{i=1}^{n} i$, $\\sqrt[3]{8}$, $\\vec{v}$', () => true)).toBe('lim(x → 0), Σ(i=1 bis n) i, ³√8, v');
    expect(clean('$\\ce{H2O(l) + NaCl(aq) ->[Kat] X}$', () => true)).toBe('H₂O(l) + NaCl(aq) \u001bKat\u001c→ X'); // label above the arrow
    // long and very long arrows keep their length for the layout
    expect(clean('A --> B ---> C ==> D $\\longrightarrow$ E -> F', () => true)).toBe('A \u0001→ B \u001f→ C \u0001⇒ D \u0001→ E → F');
    expect(clean('A --> B', (c) => c !== '→')).toBe('A \u0001→ B'); // drawn as pen strokes, so the set need not hold it
    expect(clean('Mindmap: Thema\n- A --> B\n- C ->[Kat] D', () => true)).not.toMatch(/[\u0001\u001b\u001f]/); // a mind map writes its arrows as letters (\u001c is its own separator)
    expect(clean('a [b] {c}', (c) => !'[]{}'.includes(c))).toBe('a (b) (c)'); // brackets the writer lacks
  });
  it('turns tables into lines and keeps nested bullets indented', () => {
    const [b, e] = EMPH, all = () => true;
    expect(clean('| Stoff | Formel |\n|---|:---:|\n| Wasser | H2O |\nDanach', all)).toBe(`${b}Stoff – Formel${e}\nWasser – H₂O\nDanach`);
    expect(clean('- eins\n  - zwei\n    - drei', all)).toBe('• eins\n\u0018- zwei\n\u0018\u0018- drei');
    // pasted without line breaks: lines and headings come back, with room before each topic and after a boxed result
    const flat = 'Mathe: BruchrechnungAddition: Nenner zuerst gleichnamig machen.Aufgabe 1: $\\boxed{x}$Chemie: Wichtige IonenKationen sind positiv geladen, zum Beispiel $\\ce{Al^3+}$Anionen sind negativ.';
    expect(clean(flat, () => true)).toBe(`${HEAD}${EMPH[0]}Mathe: Bruchrechnung${EMPH[1]}\nAddition: Nenner zuerst gleichnamig machen.\nAufgabe 1: \u0016x\u0017\n\n${HEAD}${EMPH[0]}Chemie: Wichtige Ionen${EMPH[1]}\nKationen sind positiv geladen, zum Beispiel Al³⁺\nAnionen sind negativ.`);
    expect(clean('Kurz.\nNoch eine Zeile ohne Punkt GoodNotes', () => true)).toBe('Kurz.\nNoch eine Zeile ohne Punkt GoodNotes'); // texts with line breaks stay as they are
    expect(clean('Also $\\boxed{x = 4}$ und ((wichtig)), aber f((x)) nicht', () => true)).toBe('Also \u0016x = 4\u0017 und wichtig, aber f((x)) nicht');
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
  it('writes matrices, aligned lines, task lists and fraction characters', () => {
    const all = () => true;
    expect(clean('$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$', all)).toBe('(1 2; 3 4)');
    expect(clean('$$\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}$$', all)).toBe('a = b\nc = d');
    expect(clean('- [ ] offen\n- [x] fertig\n~~alt~~ neu', all)).toBe('• offen\n✓ fertig\nalt neu');
    expect(clean('$\\begin{cases} 1 & x > 0 \\\\ 0 & sonst \\end{cases}$', all)).toBe('1, x > 0; 0, sonst');
    expect(clean('½ Liter', all)).toBe('\u00111\u00122\u0013 Liter');
    expect(clean('$x_{i,j}$', all)).toBe('x_{i,j}');
  });
  it('marks ==highlighted== text, but leaves a == b alone', () => {
    expect(clean('Das ist ==sehr wichtig== und a == b', () => true)).toBe(`Das ist ${MARK[0]}sehr wichtig${MARK[1]} und a == b`);
    expect(clean('==Dieser ganze lange Satz wurde von der KI gelb markiert.==', () => true)).toBe('Dieser ganze lange Satz wurde von der KI gelb markiert.');
    const plain = (c: string) => /[A-Za-z0-9 ,^>-]/.test(c);
    expect(clean('A => B ⇔ C <-> D, x^2', plain)).toBe('A ⇒ B ⇔ C ↔ D, x^2');
  });
  it('writes German decimal commas {,} and \\% from AI answers', () => {
    expect(clean(String.raw`$g = 9{,}81\,\text{m/s}^2$, $20\%$`, () => true)).toBe('g = 9,81 m/s², 20%');
  });
  it('keeps the empty lines around tables, quotes and code fences, and underlines the real header row', () => {
    const [b, e] = EMPH, all = () => true;
    expect(clean('Titel\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nDanach', all)).toBe(`Titel\n\n${b}A – B${e}\n1 – 2\n\nDanach`);
    expect(clean('Text\n\n> Zitat\n\nEnde', all)).toBe('Text\n\nZitat\n\nEnde');
    expect(clean('Text\n\n```py\nx = 1\n```\n\nEnde', all)).toBe('Text\n\nx = 1\n\nEnde');
  });
  it('indents nested numbered items and nested task lists', () => {
    const all = () => true;
    expect(clean('1. Eins\n   1. Unter', all)).toBe('1. Eins\n\u00181. Unter');
    expect(clean('- [ ] oben\n  - [x] unten', all)).toBe('• oben\n\u0018✓ unten');
  });
  it('keeps braces inside fractions and roots from blocking them, and does not raise x^{n-1} wrongly', () => {
    const all = () => true;
    expect(clean(String.raw`$\frac{x^{n+1}}{n+1}$`, all)).toBe('\u0011x^(n+1)\u0012n+1\u0013');
    expect(clean(String.raw`$\sqrt{b^{2}-4ac}$, $\frac{x_{1}}{2}$`, all)).toBe('√(b²-4ac), \u0011x₁\u00122\u0013');
    expect(clean('$x^{n-1}$, $2^{n+1}$, $x^{n}$, $e^{2x}$, $a^{-1}$, $x^{T}$', all)).toBe('x^(n-1), 2^(n+1), xⁿ, e²ˣ, a⁻¹, x^T');
  });
  it('writes binom, set symbols, spacing commands and style switches without leaving their names', () => {
    const all = () => true;
    expect(clean(String.raw`$\binom{n}{k}$, $A \cap B$, $x \in \mathbb{R}$, $\forall x$`, all)).toBe('(n über k), A ∩ B, x ∈ R, ∀ x');
    expect(clean(String.raw`$\displaystyle a\quad b$, $\textbf{fett}$, $\frac12$, $\sqrt2$`, all)).toBe('a b, fett, \u00111\u00122\u0013, √2');
    expect(clean(String.raw`$\xrightarrow{\text{Kat.}}$, $\overset{!}{=}$`, all)).toBe('\u001bKat.\u001c→ , =');
  });
  it('writes the limits of an evaluation bar in words and x_{1,2} with small digits', () => {
    const all = () => true;
    expect(clean(String.raw`$\left[x^3\right]_0^2$`, all)).toBe('[x³] von 0 bis 2');
    expect(clean(String.raw`$\left.\frac{x^2}{2}\right|_0^1$`, all)).toBe('\u0011x²\u00122\u0013 | von 0 bis 1');
    expect(clean('$x_{1,2}$', all)).toBe('x₁,₂');
  });
  it('reads NH4+ as ammonium (subscript) but Ca2+ as a charge, with state symbols behind it', () => {
    const all = () => true;
    expect(clean(String.raw`$\ce{NH4+ + Ca2+ + H3O+}$`, all)).toBe('NH₄⁺ + Ca²⁺ + H₃O⁺');
    expect(clean(String.raw`$\ce{Cu^2+(aq)}$, $-\log[\ce{H3O+}]$`, all)).toBe('Cu²⁺(aq), -log[H₃O⁺]');
  });
  it('keeps dollar signs of prices, strips them around formulas (also around a box)', () => {
    const all = () => true;
    expect(clean('Kosten $5 und $10, aber $x$ ist Mathe', all)).toBe('Kosten $5 und $10, aber x ist Mathe');
    expect(clean(String.raw`$\boxed{A = 10}$`, all)).toBe('\u0016A = 10\u0017');
  });
  it('lowers several letters and capitals from the writer\'s own letters, but leaves snake_case and long names alone', () => {
    const all = () => true, sub = (s: string) => [...s].map((c) => SUB_LETTERS[c] ?? SUB[+c]).join('');
    expect(clean(String.raw`$E_\text{pot}$, $E_{\text{kin}}$, $F_G$, $\Delta_R H$, $v_{max}$`, all)).toBe(`E${sub('pot')}, E${sub('kin')}, F${sub('G')}, Δ${sub('R')} H, v${sub('max')}`);
    expect(clean(String.raw`$a_{n+1}$, $m_{Gesamtmasse}$, snake_case, MAX_VALUE`, all)).toBe('a_(n+1), m_Gesamtmasse, snake_case, MAX_VALUE');
    expect(clean(String.raw`$E_\text{pot}$`, (c) => c !== SUB_LETTERS.p)).toBe('E_pot'); // the writer lacks the letter: stays readable
  });
  it('writes the index after a bracket in complex ions: [Cu(NH3)4]2+', () => {
    expect(clean(String.raw`$\ce{[Cu(NH3)4]^2+}$`, () => true)).toBe('[Cu(NH₃)₄]²⁺');
  });
  it('writes therefore, angle, partial, nabla and more Greek letters as symbols', () => {
    expect(clean(String.raw`$\therefore \angle ABC$, $\nabla f$, $\partial x$, $\psi \chi \xi \zeta$, $\triangle ABC$`, () => true)).toBe('∴ ∠ ABC, ∇ f, ∂ x, ψ χ ξ ζ, Δ ABC');
  });
  it('removes the space before a punctuation mark when an emoji in between is dropped', () => {
    expect(clean('Beispiel 🐍: Text 🌱 hier 🌱.', (c) => !/\p{Extended_Pictographic}/u.test(c))).toBe('Beispiel: Text hier.');
  });
  it('turns tables without outer pipes into lines too', () => {
    const [b, e] = EMPH;
    expect(clean('Stoff | Formel\n--- | :---:\nWasser | H2O\nSalz | NaCl |\nDanach', () => true)).toBe(`${b}Stoff – Formel${e}\nWasser – H₂O\nSalz – NaCl\nDanach`);
    expect(clean('x |-3 und a | b\nkeine Tabelle', () => true)).toBe('x | -3 und a | b\nkeine Tabelle');
  });
  it('copes with Gemini (4-space lists, indented tables) and ChatGPT (\\( \\), \\xrightarrow) habits', () => {
    const all = () => true;
    expect(clean('* a\n    * b\n        * c', all)).toBe('• a\n\u0018- b\n\u0018\u0018- c');
    expect(clean('  | A | B |\n  | :-- | :-- |\n  | 1 | 2 |', all)).toBe('\u0002A – B\u0003\n1 – 2');
    expect(clean(String.raw`Mit \( x = 2 \), dann \(A \xrightarrow{\text{Kat}} B\)`, all)).toBe('Mit x = 2, dann A \u001bKat\u001c→ B');
  });
  it('keeps Geg./Ges. and writes |:2 notes with room after the bar', () => {
    expect(clean(String.raw`Geg.: $2x = 8$ |:2 und $x \quad y$ |-3`, () => true)).toBe('Geg.: 2x = 8 | :2 und x y | -3');
  });
});
