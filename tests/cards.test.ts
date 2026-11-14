import { describe, expect, it } from 'vitest';
import { CARD, CORNELL, NOTE, markBlocks } from '../src/renderer/cards';
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
  it('ends a note box at a list or heading too, not only at an empty line', () => {
    expect(markBlocks('Merke: eins\nzwei\n- Punkt\nDefinition: drei\n## Neu')).toBe(`**Merke:** eins ${NOTE}\nzwei ${NOTE}\n- Punkt\n**Definition:** drei ${NOTE}\n## Neu`);
  });
  it('marks Cornell notes: heading, cue | notes rows with further note lines, the summary', () => {
    const [K, T, Z] = CORNELL;
    const out = `## Zellatmung\nGlykolyse ${K}\nim Zytoplasma ${T}\n- 2 ATP ${T}\nCitratzyklus ${K}\nin den Mitochondrien ${T}\n**Zusammenfassung:** Glucose wird abgebaut. ${Z}\n\nText`;
    expect(markBlocks('Cornell: Zellatmung\nGlykolyse | im Zytoplasma\n- 2 ATP\nCitratzyklus | in den Mitochondrien\n\nZusammenfassung: Glucose wird abgebaut.\n\nText')).toBe(out);
    // written as a Markdown table, with bold labels
    expect(markBlocks('**Cornell:** Zellatmung\n| Stichwort | Notizen |\n|---|---|\n| Glykolyse | im Zytoplasma |\n- 2 ATP\n| Citratzyklus | in den Mitochondrien |\n**Zusammenfassung:** Glucose wird abgebaut.\n\nText')).toBe(out);
    expect(clean('Cornell: A\nx | y', () => true)).toBe(`\u0006${b}A${e}\nx ${K}\ny ${T}`);
  });
});
