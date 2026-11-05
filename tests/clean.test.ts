import { describe, expect, it } from 'vitest';
import { EMPH, clean } from '../src/renderer/clean';

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
});
