/** Start and end of emphasised text (Markdown bold, headings); the layout underlines it. */
export const EMPH = ['\u0002', '\u0003'] as const;
/** Start and end of highlighted text (Markdown ==text==); the layout puts a highlighter stroke behind it. */
export const MARK = ['\u0004', '\u0005'] as const;
/** Superscript and subscript digits 0–9. */
export const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUB = '₀₁₂₃₄₅₆₇₈₉';
const digits = (d: string, set: string) => [...d].map((c) => set[+c]).join('');

/**
 * Turns pasted AI answers (Markdown, arrows, emoji, typographic symbols) into plain text a handwriting set can write.
 * has(ch): whether the active handwriting has that character; replacements fall back to what exists.
 */
export function clean(text: string, has: (ch: string) => boolean): string {
  const pick = (...opts: string[]) => opts.find((o) => [...o].every((c) => c === ' ' || has(c))) ?? opts.at(-1)!;
  const arrow = pick('→', '->', '-');
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*```.*$/gm, '') // code fences
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '') // horizontal rules
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*\S)[ \t]*$/gm, (_, t: string) => EMPH[0] + t.replace(/\*\*|__/g, '') + EMPH[1]) // headings: underlined
    .replace(/^\s*>\s?/gm, '') // quotes
    .replace(/^(\s*)[-*+•●▪◦]\s+/gm, `$1${pick('•', '-')} `) // bullets
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> their text
    .replace(/==(?=\S)(.+?)(?<=\S)==/g, `${MARK[0]}$1${MARK[1]}`) // highlighter
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
    .replace(/\^\{?(\d+)\}?/g, (m, d: string) => pick(digits(d, SUP), m)) // x^2, m^{3}
    .replace(/(\p{L}|\))_\{?(\d+)\}?/gu, (m, l: string, d: string) => l + pick(digits(d, SUB), m.slice(l.length))) // H_2O
    .replace(/…/g, '...')
    .replace(/×/g, pick('×', 'x'))
    .replace(/≈/g, pick('≈', 'ca.'))
    .replace(/[✅✔☑]/gu, pick('✓', ''))
    .replace(/[❌✖❎]/gu, pick('✗', 'x'))
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, (c) => (has(c) ? c : '')) // emoji; ↔ counts as one too
    .replace(/[ \t]+$/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
