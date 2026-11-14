import { describe, expect, it } from 'vitest';
import { CARD, NOTE, markBlocks } from '../src/renderer/cards';
import { EMPH, clean } from '../src/renderer/clean';

const [Q, A] = CARD, [b, e] = EMPH;

describe('study-sheet blocks', () => {
  it('marks a card: the question line, then the answer with its following lines up to the empty line', () => {
    const src = 'Vorher.\n\nKarteikarte: Was ist x^2?\nAntwort: **viel**\n- eins\n\nDanach.';
    expect(clean(src, () => true).split('\n')).toEqual(['Vorher.', '', `Was ist x²? ${Q}`, `${b}viel${e} ${A}`, `• eins ${A}`, '', 'Danach.']);
  });
  it('accepts what AIs really write: bold labels, numbers, "Frage:", an empty line before the answer', () => {
    const out = [`Was? ${Q}`, `Das. ${A}`].join('\n');
    for (const src of ['**Karteikarte 3:** Was?\n**Antwort:** Das.', 'Frage: Was?\n\nAntwort: Das.', '- Karte: Was?\n- Antwort: Das.', '### Karteikarte 1\nFrage: Was?\nAntwort: Das.'.replace('### Karteikarte 1', 'Karteikarte 1:')]) {
      expect(markBlocks(src), src).toBe(out);
    }
  });
  it('leaves a question without an answer alone', () => {
    expect(markBlocks('Frage: Was?\nKeine Ahnung.')).toBe('Frage: Was?\nKeine Ahnung.');
  });
  it('marks a note box: the paragraph that starts with Merke / Merksatz / Definition', () => {
    expect(clean('Merke: a^2 + b^2 = c^2\ngilt im rechtwinkligen Dreieck.\n\nText', () => true).split('\n'))
      .toEqual([`${b}Merke:${e} a² + b² = c² ${NOTE}`, `gilt im rechtwinkligen Dreieck. ${NOTE}`, '', 'Text']);
  });
});
