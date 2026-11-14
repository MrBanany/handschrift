import { markBlocks } from './cards';
import { latex } from './latex';
import { ARROW, CIRC, EMPH, HEAD, INCOMING_CONTROL, INDENT, MAP, MARK, PLOT, STRUCT } from './markers';
import { encodeMap, extractMindmaps, type MapTree } from './mindmap';
import { encodePlot, extractPlots } from './plot';

// the marker codes live in markers.ts; re-exported because much of the code and its tests import them from here
export { ARROW, CIRC, EMPH, HEAD, INDENT, LABEL, MARK, STRUCT } from './markers';

/** Superscript and subscript digits 0–9. */
export const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUB = '₀₁₂₃₄₅₆₇₈₉';
/** Raised and lowered letters (Unicode has no raised q and only some lowered ones); drawn from the writer's own letters. */
export const SUP_LETTERS: Record<string, string> = { a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ' };
export const SUB_LETTERS: Record<string, string> = { a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  // Unicode has no lowered b c d f g q w y z or capitals: private-use stand-ins, drawn from the writer's own letters (symbols.ts)
  ...Object.fromEntries([...'bcdfgqwyzABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c, i) => [c, String.fromCodePoint(0xe000 + i)])) };
const indent = (sp: string, step: number) => INDENT.repeat(Math.min(3, Math.floor(sp.replace(/\t/g, '  ').length / step)));
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

const INTRO = /^(?:Hier (?:ist|sind)|(?:Sehr )?[Gg]erne|Klar|Natürlich|Sicher|Okay|Gut)\b[^\n]{0,120}(?:[:!.]|\p{Extended_Pictographic}️?)$/u;
const OUTRO = /^(?:Ich hoffe|Hoffentlich|Soll ich|Möchtest du|Willst du|Sag (?:einfach )?Bescheid|Lass (?:es )?mich wissen|Wenn du (?:noch )?(?:Fragen|Hilfe|weitere)|Viel Erfolg|Kann ich dir)/;
/**
 * What chatbots put around the real answer: the "Hier ist …:" first line and the "Ich hoffe …" / "Soll ich …?" last paragraph,
 * citation markers glued to a word ("um.[1]", "[cite: 4]"), and odd spaces and hyphens (no-break, thin, zero-width) the handwriting has no sample for.
 * shortcut: "[2, 3]" after a space stays (it could be an interval).
 */
export function tidy(text: string): string {
  const t = text
    .replace(/[     ]/g, ' ').replace(/[‐‑]/g, '-').replace(/[​⁠﻿]/g, '')
    .replace(/(?<=[\p{L}\p{N}.,;:!?)])(?<!\\[a-zA-Z]+)\[\d{1,2}(?:\s*[,–-]\s*\d{1,2})*\]|[ \t]?\[cite(?:_start|_end)?[^\]\n]*\](?=[ \t\n.,;:!?)]|$)|\[cite(?:_start|_end)?[^\]\n]*\]/gu, ''); // \sqrt[3]{8} is no citation
  const paras = t.trim().split(/\n[ \t]*\n/);
  const first = paras[0].trim();
  if (paras.length > 1 && !first.includes('\n') && INTRO.test(first)) paras.shift();
  const last = paras.at(-1)!.trim();
  if (paras.length > 1 && last.split('\n').length <= 2 && OUTRO.test(last)) paras.pop();
  return paras.join('\n\n');
}

/**
 * Turns pasted AI answers (Markdown, arrows, emoji, typographic symbols) into plain text a handwriting set can write.
 * has(ch): whether the active handwriting has that character; replacements fall back to what exists.
 */
export function clean(text: string, has: (ch: string) => boolean): string {
  const pick = (...opts: string[]) => opts.find((o) => [...o].every((c) => c === ' ' || has(c))) ?? opts.at(-1)!;
  // [[...]] is kept away from all rules below: SMILES is full of = # ( ) / \ that they would rewrite.
  const mols: string[] = [];
  // a "Mindmap: topic" line with its list is kept away too and drawn as a mind map (see mindmap.ts)
  const maps: Omit<MapTree, 'bullet'>[] = [];
  // a node is plain text: an arrow's label becomes "→ (label)", every other marker goes
  const node = (x: string) => clean(x, has).replace(/\u001b([^\u001c]*)\u001c([→←⇒⇔↔⇌])/g, (_, l: string, a: string) => `${a} (${l})`).replace(/[\u0001-\u0006\u000E\u000F\u0014-\u0018\u001b\u001c\u001f]/g, '').replace(/\u0010/g, ' ').replace(/\s+/g, ' ').trim();
  // incoming control characters are just dropped: only the markers clean() puts in itself may stand in the result
  // [[plot: x^2, -3..3]] too: drawn as a function graph on a line of its own (see plot.ts)
  const plots: string[] = [];
  const kept = extractPlots(unflatten(extractMindmaps(markBlocks(tidy(text.replace(/\r\n?/g, '\n').replace(INCOMING_CONTROL, ''))), (t) => `${MAP[0]}${maps.push(t) - 1}${MAP[1]}`)), (spec) => `${PLOT[0]}${plots.push(spec) - 1}${PLOT[1]}`).replace(/\[\[([^\]\n]+)\]\]/g, (_, s: string) => `${STRUCT[0]}${mols.push(s.trim()) - 1}${STRUCT[1]}`);
  // one indent step is the smallest indent in the text (2 spaces or a tab; Gemini uses 4)
  const step = Math.max(2, Math.min(4, ...[...kept.matchAll(/^([ \t]{2,})(?:[-*+•●▪◦]|\d+[.)])\s/gm)].map((m) => m[1].replace(/\t/g, '  ').length)));
  return latex(kept)
    .replace(/^[ \t]*```.*$/gm, '') // code fences
    .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '') // horizontal rules
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*\S)[ \t]*$/gm, (_, t: string) => HEAD + EMPH[0] + t.replace(/\*\*|__/g, '') + EMPH[1]) // headings: bigger, underlined
    .replace(/^[ \t]*>[ \t]?/gm, '') // quotes (not \s: that would swallow the empty line before)
    // Markdown tables: the divider row goes, cells are written with a dash between them, the header row underlined
    // ("A | B" over "--|--" without outer pipes gets them first, so one rule handles both)
    .replace(/^(?![ \t]*\|)([^\n|]*\|[^\n]*)\n([ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)+)\n((?:[^\n|]*\|[^\n]*(?:\n|$))*)/gm, (_, head: string, div: string, rows: string) =>
      [head, div, ...rows.split('\n').filter(Boolean)].map((r) => (/^[ \t]*:?-{2,}/.test(r) ? r : `| ${r.trim().replace(/\|$/, '').trim()} |`)).join('\n') + '\n')
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$\n?/gm, '')
    .replace(/((?:^[ \t]*\|.*\|[ \t]*(?:\n|$))+)/gm, (block: string) => block.trimEnd().split('\n').map((row, i) => {
      const cells = row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean).join(` ${pick('–', '-')} `);
      return i === 0 ? EMPH[0] + cells + EMPH[1] : cells;
    }).join('\n') + '\n')
    // task lists, nested ones too (before the nested bullets, which would leave the "[ ]" behind)
    .replace(/^([ \t]*)[-*+][ \t]+\[([ xX])\][ \t]+/gm, (_, sp: string, x: string) => indent(sp, step) + (x === ' ' ? pick('•', '-') : pick('✓', '•', '-')) + ' ')
    // nested bullets and numbered items: two spaces (or a tab) per step
    .replace(/^([ \t]{2,})[-*+•●▪◦]\s+/gm, (_, sp: string) => indent(sp, step) + pick('-', '•') + ' ')
    .replace(/^([ \t]{2,})(\d+[.)])[ \t]+/gm, (_, sp: string, n: string) => indent(sp, step) + n + ' ')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1') // strikethrough: just the text
    .replace(/^(\s*)[-*+•●▪◦]\s+/gm, `$1${pick('•', '-')} `) // bullets
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> their text
    .replace(/==(?=\S)(.+?)(?<=\S)==/g, `${MARK[0]}$1${MARK[1]}`) // highlighter
    // shortcut: circling is switched off, ((text)) is written as plain text; replace '$1' with `${CIRC[0]}$1${CIRC[1]}` to turn it back on
    .replace(/(?<![\p{L}\p{N})])\(\((?=\S)([^()\n]+?)(?<=\S)\)\)/gu, '$1') // ((text)), but not f((x))
    .replace(/(\*\*|__)(.+?)\1/g, `${EMPH[0]}$2${EMPH[1]}`) // bold: underlined
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*/g, '$1$2') // italic
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/\$([^$\n]+)\$/g, (m, x: string) => (/^\d.*\s$/.test(x) ? m : x)) // inline math; but "$5 und $10" (prices) stays
    .replace(/\|(?=[:+\-·*/÷][\p{N}\p{L}])/gu, '| ') // "|:2", "|-3": the tall bar would swallow the colon or sign
    // Arrows are always the arrow character, whatever the writer's set holds: the layout draws them as pen strokes.
    // Long ones (-->, ==>, --->, ⟶, ⟹) are marked, so the shaft is as long as the writer wants.
    .replace(/\s*(-{3,}>|={3,}>|⟶|⟹|-->|==>)\s*/g, (_, a: string) => ` ${/^[-=]{3,}>$/.test(a) ? ARROW[1] : ARROW[0]}${a[0] === '=' || a === '⟹' ? '⇒' : '→'} `)
    .replace(/\s*(\u001b[^\u001c\n]*\u001c→)\s*/g, ' $1 ') // an arrow with a label stands alone too
    .replace(/(?<![\u0001\u001f\u001c])\s*(?:⇔|⟺|<=>)\s*/g, ' ⇔ ')
    .replace(/(?<![\u0001\u001f\u001c])\s*(?:↔|⟷|<->)\s*/g, ' ↔ ')
    .replace(/(?<![\u0001\u001f\u001c])\s*(?:⇒|=>)\s*/g, ' ⇒ ')
    .replace(/(?<![\u0001\u001f\u001c])\s*(?:→|➔|➜|->)\s*/g, ' → ')
    .replace(/\s*(?:←|<-)\s*/g, ' ← ')
    .replace(/\s*⇌\s*/g, ' ⇌ ')
    .replace(/[“”„‟″]/g, (q) => (has(q) ? q : pick('"', "'")))
    .replace(/[‘’‚′]/g, (q) => (has(q) ? q : "'"))
    .replace(/[—―]/g, pick('–', '-'))
    .replace(/−/g, '-') // minus sign
    .replace(/\^\{?(\d*)([+-])\}?(?=[\s,.;:)\]]|$|\p{Lu}|\((?:s|l|g|aq)\))/gmu, (m, d: string, q: string) => pick(digits(d, SUP) + (q === '+' ? '⁺' : '⁻'), m)) // Na^+, SO_4^{2-}
    .replace(/\^\{?-(\d+)\}?/g, (m, d: string) => pick('⁻' + digits(d, SUP), m)) // 10^{-3}, s^-1
    .replace(/\^(?:\{([0-9a-z]+)\}|(\d+|[a-z])(?![a-z]))/g, (m, a?: string, b?: string) => { const r = raise(a ?? b!, SUP, SUP_LETTERS); return r ? pick(r, m) : m; }) // x^2, m^{3}, x^n, e^{2x}
    .replace(/(\p{L})_\{(\d),(\d)\}/gu, (m, l: string, a: string, b: string) => pick(l + SUB[+a] + ',' + SUB[+b], m)) // x_{1,2} -> x₁,₂
    .replace(/(\p{L}|\))_(?:\{([0-9A-Za-z]{1,8})\}|(\d+(?![a-z])|[A-Za-z](?![A-Za-z])))/gu,(m, l: string, a?: string, b?: string) => { const r = raise(a ?? b!, SUB, SUB_LETTERS), plain = '_' + (a ?? b!); return l + (r ? pick(r, plain) : plain); }) // H_2O, a_n, E_{pot}
    .replace(/[[\]{}]/g, (c) => (has(c) ? c : '()()'['[]{}'.indexOf(c)]))
    .replace(/…/g, '...')
    .replace(/×/g, pick('×', 'x'))
    .replace(/≈/g, pick('≈', 'ca.'))
    .replace(/[✅✔☑]/gu, pick('✓', ''))
    .replace(/[❌✖❎]/gu, pick('✗', 'x'))
    // emoji (↔ counts as one too, but is an arrow the layout draws); the space in front of one goes too when a punctuation mark follows ("Beispiel 🐍:")
    .replace(/([ \t]*)([\p{Extended_Pictographic}\u{FE0F}\u{200D}]+)(?=([.,;:!?]?))/gu, (_, sp: string, e: string, next: string) => { const kept = [...e].filter((c) => c === '↔' || has(c)).join(''); return kept ? sp + kept : next ? '' : sp; })
    .replace(/[ \t]+$/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    // a structure is one "word" for the layout: spaces around it, its own spaces hidden
    .replace(/[ \t]*\u000E(\d+)\u000F[ \t]*/g, (_, i: string) => ` ${STRUCT[0]}${mols[+i].replace(/ /g, '\u0010')}${STRUCT[1]} `)
    // a stacked fraction too; punctuation right after it stays attached
    .replace(/[ \t]*\u0011([^\u0012\n]*)\u0012([^\u0013\n]*)\u0013[ \t]*/g, (_, a: string, b: string) => ` \u0011${a.trim().replace(/ +/g, '\u0010')}\u0012${b.trim().replace(/ +/g, '\u0010')}\u0013 `)
    .replace(/\u0013 (?=[.,;:!?)])/g, '\u0013')
    // the mind map: one token on a line of its own, its texts cleaned like any other (after the rules above, which would split it)
    .replace(/\u0019(\d+)\u001A/g, (_, i: string) => {
      const t = maps[+i], bullet = pick('•', '-');
      return encodeMap({ bullet, topic: node(t.topic), branches: t.branches.map((b) => ({ title: node(b.title), items: b.items.map((x) => `${bullet} ${node(x)}`) })) });
    })
    .replace(new RegExp(`[ \\t]*${PLOT[0]}(\\d+)${PLOT[1]}[ \\t]*`, 'g'), (_, i: string) => `\n${encodePlot(plots[+i])}\n`) // the graph: one token on a line of its own
    .replace(/^ +| +$/gm, '')
    // room between topics: an empty line before every heading, and after a boxed result
    .replace(/\n+(?=\u0006)/g, '\n\n')
    .replace(/^([^\n]*\u0017[^\n]*)\n(?=[^\n])/gm, '$1\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
