import { latex } from './latex';

/** Start and end of emphasised text (Markdown bold, headings); the layout underlines it. */
export const EMPH = ['\u0002', '\u0003'] as const;
/** Start and end of highlighted text (Markdown ==text==); the layout puts a highlighter stroke behind it. */
export const MARK = ['\u0004', '\u0005'] as const;
/** Starts a heading line; the layout writes it bigger. */
export const HEAD = '\u0006';
/** Wraps a structural formula ([[Ethanol]], [[CCO]]) that stands on its own line; the layout draws the molecule. */
export const STRUCT = ['\u000E', '\u000F'] as const;
/** Start and end of circled text (typed as ((text))); the layout draws a ring around it by hand. */
export const CIRC = ['\u0014', '\u0015'] as const;
/** Superscript and subscript digits 0–9. */
export const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUB = '₀₁₂₃₄₅₆₇₈₉';
/** Raised and lowered letters (Unicode has no raised q and only some lowered ones); drawn from the writer's own letters. */
export const SUP_LETTERS: Record<string, string> = { a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ' };
export const SUB_LETTERS: Record<string, string> = { a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' };
/** Indents a list line one step (nested bullets); the layout moves the line right. */
export const INDENT = '\u0018';
const digits = (d: string, set: string) => [...d].map((c) => set[+c]).join('');
/** "2x" -> "²ˣ" with the given digit/letter sets, or null if a character has no raised/lowered form. */
const raise = (s: string, num: string, letters: Record<string, string>) => {
  const out = [...s].map((c) => (/\d/.test(c) ? num[+c] : letters[c]));
  return out.every(Boolean) ? out.join('') : null;
};

/**
 * Some apps drop all line breaks when copying ("BruchrechnungAddition …machen.Aufgabe 1: …"). For a long text without any,
 * break where a word, sentence or formula runs straight into a capitalised word, and treat short lines without
 * punctuation or formulas as headings ("Chemie: Wichtige Ionen").
 * shortcut: CamelCase names (GoodNotes, YouTube) get split too, but only in such flat pastes.
 */
export function unflatten(text: string): string {
  if (text.length < 160 || text.trim().includes('\n')) return text;
  const lines = text.replace(/([\p{Ll}.!?:$\]}])(?=\p{Lu}\p{Ll}{2,})/gu, '$1\n').split('\n');
  return lines.map((l, i) => (i < lines.length - 1 && l.length <= 45 && !/[.!?:;,$\]]\s*$|\$|\[\[|^\s*[-•#]/.test(l) && l.split(/\s+/).length <= 5 ? '## ' + l : l)).join('\n');
}

/**
 * Turns pasted AI answers (Markdown, arrows, emoji, typographic symbols) into plain text a handwriting set can write.
 * has(ch): whether the active handwriting has that character; replacements fall back to what exists.
 */
export function clean(text: string, has: (ch: string) => boolean): string {
  const pick = (...opts: string[]) => opts.find((o) => [...o].every((c) => c === ' ' || has(c))) ?? opts.at(-1)!;
  const arrow = pick('→', '->', '-');
  // [[...]] is kept away from all rules below: SMILES is full of = # ( ) / \ that they would rewrite.
  const mols: string[] = [];
  const kept = unflatten(text.replace(/\r\n?/g, '\n')).replace(/\[\[([^\]\n]+)\]\]/g, (_, s: string) => `${STRUCT[0]}${mols.push(s.trim()) - 1}${STRUCT[1]}`);
  return latex(kept)
    .replace(/^\s*```.*$/gm, '') // code fences
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '') // horizontal rules
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*\S)[ \t]*$/gm, (_, t: string) => HEAD + EMPH[0] + t.replace(/\*\*|__/g, '') + EMPH[1]) // headings: bigger, underlined
    .replace(/^\s*>\s?/gm, '') // quotes
    // Markdown tables: the divider row goes, cells are written with a dash between them, the header row underlined
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$\n?/gm, '')
    .replace(/((?:^\s*\|.*\|\s*(?:\n|$))+)/gm, (block: string) => block.trimEnd().split('\n').map((row, i) => {
      const cells = row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean).join(` ${pick('–', '-')} `);
      return i === 0 ? EMPH[0] + cells + EMPH[1] : cells;
    }).join('\n') + '\n')
    // nested bullets: two spaces (or a tab) per step
    .replace(/^([ \t]{2,})[-*+•●▪◦]\s+/gm, (_, sp: string) => INDENT.repeat(Math.min(3, Math.floor(sp.replace(/\t/g, '  ').length / 2))) + pick('-', '•') + ' ')
    .replace(/^(\s*)[-*+•●▪◦]\s+/gm, `$1${pick('•', '-')} `) // bullets
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> their text
    .replace(/==(?=\S)(.+?)(?<=\S)==/g, `${MARK[0]}$1${MARK[1]}`) // highlighter
    .replace(/(?<![\p{L}\p{N})])\(\((?=\S)([^()\n]+?)(?<=\S)\)\)/gu, `${CIRC[0]}$1${CIRC[1]}`) // ((circled)), but not f((x))
    .replace(/(\*\*|__)(.+?)\1/g, `${EMPH[0]}$2${EMPH[1]}`) // bold: underlined
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*/g, '$1$2') // italic
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/\$([^$\n]+)\$/g, '$1') // inline math
    .replace(/\s*(?:⇔|⟺|<=>)\s*/g, ` ${pick('⇔', '↔', '<->', '-')} `)
    .replace(/\s*(?:↔|⟷|<->)\s*/g, ` ${pick('↔', '<->', '-')} `)
    .replace(/\s*(?:⇒|⟹|=>)\s*/g, ` ${pick('⇒', arrow)} `)
    .replace(/\s*(?:→|⟶|➔|➜|->)\s*/g, ` ${arrow} `)
    .replace(/\s*(?:←|<-)\s*/g, ` ${pick('←', '<-', '-')} `)
    .replace(/[“”„‟″]/g, (q) => (has(q) ? q : pick('"', "'")))
    .replace(/[‘’‚′]/g, (q) => (has(q) ? q : "'"))
    .replace(/[—―]/g, pick('–', '-'))
    .replace(/−/g, '-') // minus sign
    .replace(/\^\{?(\d*)([+-])\}?(?=[\s,.;:)]|$|\p{Lu})/gmu, (m, d: string, q: string) => pick(digits(d, SUP) + (q === '+' ? '⁺' : '⁻'), m)) // Na^+, SO_4^{2-}
    .replace(/\^\{?-(\d+)\}?/g, (m, d: string) => pick('⁻' + digits(d, SUP), m)) // 10^{-3}, s^-1
    .replace(/\^(?:\{([0-9a-z]+)\}|(\d+|[a-z])(?![a-z]))/g, (m, a?: string, b?: string) => { const r = raise(a ?? b!, SUP, SUP_LETTERS); return r ? pick(r, m) : m; }) // x^2, m^{3}, x^n, e^{2x}
    .replace(/(\p{L}|\))_(?:\{([0-9a-z]+)\}|(\d+|[a-z])(?![a-z]))/gu, (m, l: string, a?: string, b?: string) => { const r = raise(a ?? b!, SUB, SUB_LETTERS); return l + (r ? pick(r, m.slice(l.length)) : m.slice(l.length)); }) // H_2O, a_n
    .replace(/[[\]{}]/g, (c) => (has(c) ? c : '()()'['[]{}'.indexOf(c)]))
    .replace(/…/g, '...')
    .replace(/×/g, pick('×', 'x'))
    .replace(/≈/g, pick('≈', 'ca.'))
    .replace(/[✅✔☑]/gu, pick('✓', ''))
    .replace(/[❌✖❎]/gu, pick('✗', 'x'))
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, (c) => (has(c) ? c : '')) // emoji; ↔ counts as one too
    .replace(/[ \t]+$/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    // a structure is one "word" for the layout: spaces around it, its own spaces hidden
    .replace(/[ \t]*\u000E(\d+)\u000F[ \t]*/g, (_, i: string) => ` ${STRUCT[0]}${mols[+i].replace(/ /g, '\u0010')}${STRUCT[1]} `)
    // a stacked fraction too; punctuation right after it stays attached
    .replace(/[ \t]*\u0011([^\u0012\n]*)\u0012([^\u0013\n]*)\u0013[ \t]*/g, (_, a: string, b: string) => ` \u0011${a.trim().replace(/ +/g, '\u0010')}\u0012${b.trim().replace(/ +/g, '\u0010')}\u0013 `)
    .replace(/\u0013 (?=[.,;:!?)])/g, '\u0013')
    .replace(/^ +| +$/gm, '')
    // room between topics: an empty line before every heading, and after a boxed result
    .replace(/\n+(?=\u0006)/g, '\n\n')
    .replace(/^([^\n]*\u0017[^\n]*)\n(?=[^\n])/gm, '$1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
