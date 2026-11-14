import { describe, expect, it } from 'vitest';
import { SYMBOLS } from '../src/glyphstore/symbols';
import { SUB, SUB_LETTERS, SUP, SUP_LETTERS, clean, tidy } from '../src/renderer/clean';
import { CARD } from '../src/renderer/cards';
import { GEMINI } from './ki-gemini';

const extra = new Set([...SUP, ...SUB, '⁺', '⁻', ...Object.values(SUP_LETTERS), ...Object.values(SUB_LETTERS), ...Object.keys(SYMBOLS), '⇌', '–', '€']);
const has = (ch: string) => extra.has(ch) || /[\p{L}\p{N} .,:;!?'"\-()/+*=%&@•]/u.test(ch);
// drop the markers (headings, underline, fractions, boxes …) to compare plain text
const plain = (s: string) => clean(s, has).replace(/[\u0001-\u0006\u000e-\u001f-]/g, '');

describe('Gemini answers', () => {
  it('drops the "Hier ist …" intro, the closing offer, emoji and the rule line, keeps the content', () => {
    const out = plain(GEMINI.gemini_mathe);
    expect(out).not.toMatch(/Hier ist|Ich hoffe|Sag einfach|😊|✅|---/);
    expect(out).toContain('2x + 3 = 11 | -3');
    expect(out).toContain('2x = 8 | :2');
    expect(out).toContain('11 = 11 ✓'); // \checkmark
    expect(out.split('\n')[0]).toBe('Aufgabe: Löse 2x + 3 = 11');
  });
  it('keeps real sentences that start like an intro but stand in the middle of the text', () => {
    expect(tidy('Titel\n\nHier ist der Beweis:\n\nText')).toBe('Titel\n\nHier ist der Beweis:\n\nText');
    expect(tidy('Hier ist ein Satz.')).toBe('Hier ist ein Satz.'); // nothing else to keep: leave it
    expect(tidy('Gerne!\n\n## Titel\n\n- a\n\nIch hoffe, das hilft!')).toBe('## Titel\n\n- a');
  });
  it('removes citation markers glued to words, [cite: n] and odd spaces', () => {
    expect(tidy('Energie (ATP) um.[1] Das [cite: 4] ist [cite_start]wichtig[2, 3].')).toBe('Energie (ATP) um. Das ist wichtig.');
    expect(tidy('Intervall [1, 2] bleibt, 5 km und 3 m, Zahl‑7')).toBe('Intervall [1, 2] bleibt, 5 km und 3 m, Zahl-7');
  });
  it('writes \\text{…} chemistry, ions, states and the code block copy of the equation', () => {
    const out = plain(GEMINI.gemini_chemie);
    expect(out).toContain('CH₄ + 2 O₂ → CO₂ + 2 H₂O');
    expect(out).toContain('Na⁺, Calcium: Ca²⁺, Sulfat: SO₄²⁻, Hydroxid: OH⁻');
    expect(out).toContain('N₂ + 3 H₂ ⇌ 2 NH₃');
    expect(out).not.toMatch(/```|\\|text/);
  });
  it('turns units, tables and sub-scripts of a physics answer into plain lines', () => {
    const out = plain(GEMINI.gemini_physik);
    expect(out).toContain('Fallhöhe – h – 20 m');
    expect(out).toContain('Erdbeschleunigung – g – 9,81 m/s²');
    expect(out).toContain('R = 4,7 kΩ');
    expect(out).toContain('(20°C)');
  });
  it('reads **Mindmap: …** with an empty line before the "*   " list as a mind map', () => {
    const out = clean(GEMINI.gemini_mindmap, has);
    expect(out).toMatch(/Photosynthese/);
    expect(out).not.toContain('Mindmap:'); // the title line became the drawing
    expect(out).not.toMatch(/Klar!|Soll ich/);
  });
  it('reads **Frage:** / **Antwort:** cards and a **Merke:** note', () => {
    const out = clean(GEMINI.gemini_karteikarten, has);
    expect(out.split(CARD[0]).length - 1).toBe(3); // two "Karteikarte" blocks plus the "*   **Frage:**" pair
    expect(out).toContain('Wo findet die Proteinsynthese statt?');
    expect(out).toContain('Merke:');
  });
  it('writes aligned/display maths, limits, integrals and \\mid without leftovers', () => {
    const out = plain(GEMINI.gemini_mathe_funktion);
    expect(out).toContain('S(2 | -1)');
    expect(out).toContain('x₁,₂');
    expect(out).toContain('lim(x → ∞) f(x) = ∞');
    expect(out).not.toMatch(/\\|begin|aligned|mathbb/);
  });
  it('escaped characters: 20\\%, \\$5, R\\&D, \\{1, 2\\}', () => {
    expect(clean(String.raw`20\% mehr, \$5 und \$10, R\&D, $M = \{1, 2\}$`, has)).toBe('20% mehr, $5 und $10, R&D, M = (1, 2)');
  });
});
