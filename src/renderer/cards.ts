/**
 * Study-sheet blocks from a pasted AI answer (see docs/lernzettel.md):
 *
 *   Karteikarte: Was ist die Glykolyse?        a fold card: question left, answer right of a middle line
 *   Antwort: Abbau von Glucose zu Pyruvat.
 *
 *   Merke: Ohne Sauerstoff nur 2 ATP.          a boxed note
 *
 *   Cornell: Zellatmung                        Cornell notes: cue column left, notes right,
 *   Glykolyse | im Zytoplasma, 2 ATP           the summary below a line
 *   Zusammenfassung: Glucose wird abgebaut.
 *
 * markBlocks() only puts a marker at the end of each line that belongs to a block; the text itself goes through all the
 * normal clean() rules (fractions, bold, arrows work inside). layout() writes the marked lines into a frame.
 */

/** Ends a card's question line / each of its answer lines. Private-use characters: the C0 controls are taken (clean.ts, latex.ts, mindmap.ts). */
export const CARD = ['\uf701', '\uf702'] as const;
/** Ends each line of a boxed note. */
export const NOTE = '\uf703';
/** Cornell notes: ends a cue / a line of its notes / a line of the summary. */
export const CORNELL = ['\uf704', '\uf705', '\uf706'] as const;

const B = '(?:\\*\\*|__)?', PRE = '^[ \\t]*(?:[-*+•][ \\t]+)?(?:#{1,6}[ \\t]*)?';
const Q = new RegExp(`${PRE}${B}(?:Karteikarte|Karte|Frage)(?:[ \\t]*\\d+)?[ \\t]*[:：]${B}[ \\t]*(.*)$`, 'i');
const A = new RegExp(`${PRE}${B}Antwort[ \\t]*[:：]${B}[ \\t]*(.*)$`, 'i');
const N = new RegExp(`^[ \\t]*${B}(Merke|Merksatz|Definition)[ \\t]*[:：]${B}[ \\t]*(.*)$`, 'i');
const C = new RegExp(`${PRE}${B}Cornell(?:-Notizen)?[ \\t]*[:：]${B}[ \\t]*(.*)$`, 'i');
const S = new RegExp(`${PRE}${B}Zusammenfassung[ \\t]*[:：]${B}[ \\t]*(.*)$`, 'i');
/** A block's following lines end at an empty line, the next block, a heading or a mind map. */
const ends = (l?: string) => l === undefined || !l.trim() || Q.test(l) || N.test(l) || C.test(l) || /^[ \t]*(?:#|Mind-?\s?map\b)/i.test(l);
const LIST = /^[ \t]*(?:[-*+•]|\d{1,2}[.)])[ \t]/;

export function markBlocks(text: string): string {
  const lines = text.split('\n'), out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const q = Q.exec(lines[i]), n = N.exec(lines[i]), c = C.exec(lines[i]);
    let j = i + 1;
    if (c) {
      if (c[1].trim()) out.push(`## ${c[1].trim()}`);
      for (let rows = 0; j < lines.length && !S.test(lines[j]); j++) {
        const t = lines[j].trim().replace(/^\||\|$/g, '').trim(), k = t.indexOf('|');
        if (!t) { if (lines[j + 1]?.includes('|') || S.test(lines[j + 1] ?? '')) continue; break; } // an empty line between rows is fine
        if (ends(lines[j]) || (k < 0 && !rows)) break;
        if (/^[\s|:-]+$/.test(t)) continue; // the divider row of a Markdown table
        const cue = t.slice(0, k).trim(), note = t.slice(k + 1).trim();
        if (k < 0) out.push(`${lines[j].trimEnd()} ${CORNELL[1]}`); // a further line of the notes
        else if (!rows && /^(?:Stichw|Cue|Frage)/i.test(cue) && /^Notiz/i.test(note)) continue; // a table's header row
        else { if (cue) out.push(`${cue} ${CORNELL[0]}`); if (note) out.push(`${note} ${CORNELL[1]}`); rows++; }
      }
      const sum = S.exec(lines[j] ?? '');
      if (sum) {
        out.push(`**Zusammenfassung:** ${sum[1].trim()} ${CORNELL[2]}`);
        for (j++; !ends(lines[j]); j++) out.push(`${lines[j].trimEnd()} ${CORNELL[2]}`);
      }
      i = j - 1;
      continue;
    }
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
      for (; !ends(lines[j]) && !LIST.test(lines[j]); j++) out.push(`${lines[j].trimEnd()} ${NOTE}`); // the box is the paragraph, not the list after it
      i = j - 1;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}
