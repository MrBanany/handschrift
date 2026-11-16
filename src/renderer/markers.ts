/**
 * Every control character the text pipeline (clean → latex → layout) uses to mark something inside a string, in ONE place.
 * They live in the C0 range U+0001–U+001F (the layout and its regexes know these) or, for separators that never leave one
 * stage, in the private-use block U+F700–U+F7FF (U+E000+ is taken by the lowered letters, see clean.ts SUB_LETTERS).
 * New marker? Add it here and to ALL below: loading this file fails if two share a code.
 * clean() drops all of these (and every other control character) from incoming text first, so pasted text can never
 * be read as a marker.
 */

/** Start and end of emphasised text (Markdown bold, headings); the layout underlines it. */
export const EMPH = ['\u0002', '\u0003'] as const;
/** Start and end of highlighted text (Markdown ==text==); the layout puts a highlighter stroke behind it. */
export const MARK = ['\u0004', '\u0005'] as const;
/** Starts a heading line; the layout writes it bigger. */
export const HEAD = '\u0006';
/** Wraps a structural formula ([[Ethanol]], [[CCO]]) that stands on its own line; the layout draws the molecule. */
export const STRUCT = ['\u000E', '\u000F'] as const;
/** A space that must not split a token (inside a structure, a fraction part, an arrow label, a mind map). */
export const SP = '\u0010';
/** Stacked fraction: FRAC[0] numerator FRAC[1] denominator FRAC[2]; the layout writes it over a fraction bar. */
export const FRAC = ['\u0011', '\u0012', '\u0013'] as const;
/** Root: ROOT[0] index ("3", mostly empty) ROOT[1] radicand ROOT[2]; the layout draws hook and bar over the radicand by hand. May nest. */
export const ROOT = ['\u0007', '\u001d', '\u001e'] as const;
/** Start and end of circled text; the layout draws a ring around it by hand. */
export const CIRC = ['\u0014', '\u0015'] as const;
/** Start and end of boxed text (\boxed{…}, final results); the layout draws a box around it by hand. */
export const BOX = ['\u0016', '\u0017'] as const;
/** Indents a list line one step (nested bullets); the layout moves the line right. */
export const INDENT = '\u0018';
/** Start and end of a whole mind map, one token (see mindmap.ts). */
export const MAP = ['\u0019', '\u001A'] as const;
/** Put before an arrow character: a long / very long shaft. */
export const ARROW = ['\u0001', '\u001f'] as const;
/** The label of an arrow with a condition (->[Kat]), written small above the shaft; its spaces are SP. */
export const LABEL = ['\u001b', '\u001c'] as const;

/** Separators inside an encoded mind map (mindmap.ts): after the bullet, between branches, between a branch's lines. */
export const MAP_SEP = { field: '\uF720', branch: '\uF721', item: '\uF722' } as const;
/** Ends a study card's question line / each of its answer lines (cards.ts). */
export const CARD = ['\uF701', '\uF702'] as const;
/** Ends each line of a boxed note (cards.ts). */
export const NOTE = '\uF703';
/** Cornell notes (cards.ts): ends a cue line / a notes line / a summary line. */
export const CORNELL = ['\uF704', '\uF705', '\uF706'] as const;
/** x^{n+1}: while latex() works, the braces of a super/subscript are these, so the fraction/root rules skip them. */
export const TEX_BRACE = ['\uF710', '\uF711'] as const;
/** Start and end of an encoded function graph, one token on its own line (plot.ts). */
export const PLOT = ['\uF730', '\uF731'] as const;
/** \{1, 2\}: literal braces while latex() works, so the group rules leave them alone; turned back at the end. */
export const LIT_BRACE = ['\uF712', '\uF713'] as const;
/** A fenced code block, kept away from the Markdown rules until the end (clean.ts): CODE[0] index CODE[1]. */
export const CODE = ['\uF714', '\uF715'] as const;

const ALL: Record<string, string> = {
  'EMPH[0]': EMPH[0], 'EMPH[1]': EMPH[1], 'MARK[0]': MARK[0], 'MARK[1]': MARK[1], HEAD,
  'STRUCT[0]': STRUCT[0], 'STRUCT[1]': STRUCT[1], SP, 'FRAC[0]': FRAC[0], 'FRAC[1]': FRAC[1], 'FRAC[2]': FRAC[2],
  'ROOT[0]': ROOT[0], 'ROOT[1]': ROOT[1], 'ROOT[2]': ROOT[2],
  'CIRC[0]': CIRC[0], 'CIRC[1]': CIRC[1], 'BOX[0]': BOX[0], 'BOX[1]': BOX[1], INDENT, 'MAP[0]': MAP[0], 'MAP[1]': MAP[1],
  'ARROW[0]': ARROW[0], 'ARROW[1]': ARROW[1], 'LABEL[0]': LABEL[0], 'LABEL[1]': LABEL[1],
  'MAP_SEP.field': MAP_SEP.field, 'MAP_SEP.branch': MAP_SEP.branch, 'MAP_SEP.item': MAP_SEP.item,
  'CARD[0]': CARD[0], 'CARD[1]': CARD[1], NOTE,
  'CORNELL[0]': CORNELL[0], 'CORNELL[1]': CORNELL[1], 'CORNELL[2]': CORNELL[2],
  'TEX_BRACE[0]': TEX_BRACE[0], 'TEX_BRACE[1]': TEX_BRACE[1], 'LIT_BRACE[0]': LIT_BRACE[0], 'LIT_BRACE[1]': LIT_BRACE[1], 'PLOT[0]': PLOT[0], 'PLOT[1]': PLOT[1],
  'CODE[0]': CODE[0], 'CODE[1]': CODE[1],
};

/** Throws when a marker is used twice or sits outside the two ranges above (runs once, when this file loads). */
export function checkMarkers(all: Record<string, string> = ALL): void {
  const seen = new Map<string, string>();
  for (const [name, ch] of Object.entries(all)) {
    const code = ch.codePointAt(0)!, hex = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    const c0 = code >= 0x01 && code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    if (ch.length !== 1 || !(c0 || (code >= 0xf700 && code <= 0xf7ff))) {
      throw new Error(`markers: ${name} (${hex}) is outside U+0001–U+001F (not tab, line breaks) and U+F700–U+F7FF`);
    }
    const other = seen.get(ch);
    if (other) throw new Error(`markers: ${name} and ${other} are both ${hex}`);
    seen.set(ch, name);
  }
}
checkMarkers();

/** What clean() throws out of incoming text first: all control characters except tab and line break, and the private markers. */
export const INCOMING_CONTROL = /[\u0000-\u0008\u000B-\u001F\uF700-\uF7FF]/g;
