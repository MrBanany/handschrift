/**
 * Study-sheet blocks from a pasted AI answer (see docs/lernzettel.md):
 *
 *   Karteikarte: Was ist die Glykolyse?        a fold card: question left, answer right of a middle line
 *   Antwort: Abbau von Glucose zu Pyruvat.
 *
 *   Merke: Ohne Sauerstoff nur 2 ATP.          a boxed note
 *
 * markBlocks() only puts a marker at the end of each line that belongs to a block; the text itself goes through all the
 * normal clean() rules (fractions, bold, arrows work inside). layout() writes the marked lines into a frame.
 */

/** Ends a card's question line / each of its answer lines. Private-use characters: the C0 controls are taken (clean.ts, latex.ts, mindmap.ts). */
export const CARD = ['', ''] as const;
/** Ends each line of a boxed note. */
export const NOTE = '';

const B = '(?:\\*\\*|__)?', PRE = '^[ \\t]*(?:[-*+•][ \\t]+)?(?:#{1,6}[ \\t]*)?';
const Q = new RegExp(`${PRE}${B}(?:Karteikarte|Karte|Frage)(?:[ \\t]*\\d+)?[ \\t]*[:：]${B}[ \\t]*(.*)$`, 'i');
const A = new RegExp(`${PRE}${B}Antwort[ \\t]*[:：]${B}[ \\t]*(.*)$`, 'i');
const N = new RegExp(`^[ \\t]*${B}(Merke|Merksatz|Definition)[ \\t]*[:：]${B}[ \\t]*(.*)$`, 'i');
/** A block's following lines end at an empty line, the next block, a heading or a mind map. */
const ends = (l?: string) => l === undefined || !l.trim() || Q.test(l) || N.test(l) || /^[ \t]*(?:#|Mind-?\s?map\b)/i.test(l);

export function markBlocks(text: string): string {
  const lines = text.split('\n'), out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const q = Q.exec(lines[i]), n = N.exec(lines[i]);
    let j = i + 1;
    if (q && !q[1].trim() && Q.exec(lines[j] ?? '')?.[1].trim()) continue; // "Karteikarte 3:" above its "Frage: …" line
    if (q?.[1].trim()) {
      if (lines[j] !== undefined && !lines[j].trim()) j++; // one empty line between question and answer is fine
      const a = A.exec(lines[j] ?? '');
      if (a) {
        out.push(`${q[1].trim()} ${CARD[0]}`);
        if (a[1].trim()) out.push(`${a[1].trim()} ${CARD[1]}`);
        for (j++; !ends(lines[j]); j++) out.push(`${lines[j].trimEnd()} ${CARD[1]}`);
        i = j - 1;
        continue;
      }
    } else if (n) {
      out.push(`**${n[1]}:** ${n[2].trim()} ${NOTE}`);
      for (; !ends(lines[j]); j++) out.push(`${lines[j].trimEnd()} ${NOTE}`);
      i = j - 1;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}
