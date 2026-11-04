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
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // headings
    .replace(/^\s*>\s?/gm, '') // quotes
    .replace(/^(\s*)[-*+•●▪◦]\s+/gm, `$1${pick('•', '-')} `) // bullets
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> their text
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // bold
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*/g, '$1$2') // italic
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/\$([^$\n]+)\$/g, '$1') // inline math
    .replace(/\s*(?:→|⟶|➔|➜|⇒|=>|->)\s*/g, ` ${arrow} `)
    .replace(/\s*(?:←|<-)\s*/g, ` ${pick('←', '<-', '-')} `)
    .replace(/[“”„‟″]/g, (q) => (has(q) ? q : pick('"', "'")))
    .replace(/[‘’‚′]/g, (q) => (has(q) ? q : "'"))
    .replace(/[—―]/g, pick('–', '-'))
    .replace(/…/g, '...')
    .replace(/×/g, pick('×', 'x'))
    .replace(/≈/g, pick('≈', 'ca.'))
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '') // emoji
    .replace(/[ \t]+$/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
