/**
 * Simple diagrams the way pupils draw them in their exercise books, from lines an AI writes reliably and that still
 * read fine without the app:
 *
 *   Ablauf: Reiz -> Sinneszelle -> Nerv -> Gehirn          steps in boxes, arrows between them
 *   Kreislauf: Verdunstung -> Wolken -> Regen              the same, plus an arrow from the last step back to the first
 *   Schaubild: Zellorganellen                              the topic boxed on top, lines down to 2–5 boxed sub-points,
 *   - Zellkern                                             their own sub-points listed under them
 *   - Mitochondrien
 *
 * clean() cuts them out (extractDiagrams) and puts back one token per diagram (encodeDiagram), layout() plans it here
 * (planDiagram) and draws it with the writer's letters and pen strokes. One that does not fit is written as text.
 */

import { DIAGRAM, MAP_SEP, SP } from './markers';
import { SHRINK, extractMindmaps, header, mapAsList, wrapText, type MapText, type PlanOpts } from './mindmap';

export { DIAGRAM } from './markers'; // the codes live in markers.ts
const { field: F, branch: B, item: I } = MAP_SEP;
export type DiagramKind = 'ablauf' | 'kreislauf' | 'schaubild';
/** steps: the boxes (for a Schaubild its sub-points under the topic); subs: what is listed under each box. */
export interface Diagram { kind: DiagramKind; bullet: string; topic: string; steps: string[]; subs: string[][] }

const CHAIN = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?(Ablauf|Kreislauf|Zyklus)\b([^:：\n]{0,40}?)(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?(.*?)(?:\*\*|__)?\s*$/i;
const ARROW = /\s*(?:-{1,3}>|={1,3}>|→|⇒|⟶|⟹|➔|➜)\s*/;

/**
 * Replaces every diagram in the text by put(diagram); put returns what to leave in its place. A chain line needs at least
 * one arrow (and no \ce, whose arrows are a reaction's); "Ablauf der Mitose: …" keeps "Ablauf der Mitose" as a title line.
 */
export function extractDiagrams(text: string, put: (d: Omit<Diagram, 'bullet'>) => string): string {
  const chains = text.split('\n').map((line) => {
    const m = CHAIN.exec(line);
    if (!m || line.includes('\\ce')) return line;
    const steps = m[3].split(ARROW).map((x) => x.replace(/\*\*|__/g, '').trim());
    if (steps.length < 2 || steps.length > 12 || steps.some((x) => !x)) return line;
    const kind = /^Ablauf$/i.test(m[1]) ? 'ablauf' : 'kreislauf';
    if (kind === 'kreislauf' && steps.length > 2 && steps.at(-1)!.toLowerCase() === steps[0].toLowerCase()) steps.pop(); // "A -> B -> C -> A"
    const title = m[2].trim() ? `**${m[1]}${m[2].trimEnd()}**\n` : '';
    return `${title}${put({ kind, topic: '', steps, subs: steps.map(() => []) })}`;
  }).join('\n');
  return extractMindmaps(chains, (t) => put({ kind: 'schaubild', topic: t.topic, steps: t.branches.map((b) => b.title), subs: t.branches.map((b) => b.items) }), header(String.raw`Schaubild|Baumschaubild`));
}

/** One whitespace-free token for the layout (spaces become protected spaces). */
export function encodeDiagram(d: Diagram): string {
  const s = (x: string) => x.replace(/\s+/g, SP);
  return DIAGRAM[0] + [d.kind, d.bullet, s(d.topic)].join(F) + d.steps.map((x, i) => B + [x, ...d.subs[i]].map(s).join(I)).join('') + DIAGRAM[1];
}

export function decodeDiagram(token: string): Diagram | null {
  if (!token.startsWith(DIAGRAM[0]) || !token.endsWith(DIAGRAM[1])) return null;
  const s = (x: string) => x.replace(new RegExp(SP, 'g'), ' ');
  const [head, ...boxes] = token.slice(1, -1).split(B);
  const [kind, bullet, topic] = head.split(F);
  if (!['ablauf', 'kreislauf', 'schaubild'].includes(kind) || !boxes.length) return null;
  const parts = boxes.map((b) => b.split(I).map(s));
  return { kind: kind as DiagramKind, bullet: bullet || '-', topic: s(topic ?? ''), steps: parts.map((p) => p[0]), subs: parts.map((p) => p.slice(1)) };
}

/** The diagram as plain lines when it does not fit: "A → B → C", or the Schaubild as a heading with its list. */
export function diagramAsLines(d: Diagram, head: string, emph: readonly [string, string], indent: string): string[] {
  if (d.kind !== 'schaubild') return [[...d.steps, ...(d.kind === 'kreislauf' ? [d.steps[0]] : [])].join(' → ')];
  return mapAsList({ bullet: d.bullet, topic: d.topic, branches: d.steps.map((title, i) => ({ title, items: d.subs[i] })) }, head, emph, indent);
}

export interface DiagramPlan {
  rows: number; // baseline rows 1..rows are used, as in a mind map
  texts: MapText[];
  /** Boxes around text rows; x in mm from the diagram's left edge. layout() draws them like the mind map's topic box. */
  boxes: { x0: number; x1: number; row0: number; row1: number; size: number }[];
  /** Pen strokes, y in rows (row r = its baseline); head: an arrow head at the end. */
  strokes: { x0: number; y0: number; x1: number; y1: number; head: boolean }[];
}

/** Where a box drawn around text rows starts and ends, in rows (as layout() draws it: 2.1 x-heights up, 0.8 down). */
export const boxTop = (row: number, size: number, o: Pick<DiagramOpts, 'xh' | 'lineH'>) => row - (2.1 * o.xh * size) / o.lineH;
export const boxBottom = (row: number, size: number, o: Pick<DiagramOpts, 'xh' | 'lineH'>) => row + (0.8 * o.xh * size) / o.lineH;

export interface DiagramOpts extends PlanOpts { lineH: number }

/** null if it does not fit even at the smallest size (then it is written as text, see diagramAsLines). */
export function planDiagram(d: Diagram, o: DiagramOpts): DiagramPlan | null {
  for (const k of SHRINK) {
    const p = d.kind === 'schaubild' ? planTree(d, o, k) : planChain(d, o, k);
    if (p && p.rows <= o.maxRows) return p;
  }
  return null;
}

type Box = { lines: string[]; w: number };
/** The text of one box, wrapped to at most 3 lines of at most `max` mm (padding included). */
function boxOf(text: string, max: number, k: number, o: DiagramOpts): Box | null {
  const pad = 0.6 * o.xh * k, lines = wrapText(text, max - 2 * pad, max - 2 * pad, k, o.measure);
  if (!lines || lines.length > 3) return null;
  return { lines, w: Math.max(...lines.map((l) => o.measure(l, k))) + 2 * pad };
}

/** The lines of a box, each centred, from row `row` down. */
const boxTexts = (b: Box, x: number, row: number, k: number, o: DiagramOpts): MapText[] =>
  b.lines.map((text, i) => ({ x: x + (b.w - o.measure(text, k)) / 2, row: row + i, size: k, text }));

/**
 * Ablauf / Kreislauf: boxes in a row with arrows between, as many as fit; then on the next row (an empty row between),
 * which starts with an arrow. A single row is centred; a Kreislauf in one row gets its way back below the boxes, one
 * over several rows ends with the first step again.
 */
function planChain(d: Diagram, o: DiagramOpts, k: number): DiagramPlan | null {
  const gap = 3.4 * o.xh * k, a = 0.35 * o.xh * k; // room for an arrow between two boxes; air between arrow and box
  const make = (steps: string[]) => steps.map((x) => boxOf(x, Math.min(0.42 * o.width, o.width - gap), k, o));
  let boxes = make(d.steps);
  if (boxes.some((b) => !b)) return null;
  // greedy: as many boxes per row as fit
  const rowsOf = (bs: Box[]) => {
    const out: { b: Box; x: number }[][] = [];
    let x = 0;
    for (const b of bs) {
      if (out.length && x + gap + b.w <= o.width) { out.at(-1)!.push({ b, x: x + gap }); x += gap + b.w; }
      else { const x0 = out.length ? gap : 0; out.push([{ b, x: x0 }]); x = x0 + b.w; }
    }
    return out;
  };
  let bands = rowsOf(boxes as Box[]);
  const cycle = d.kind === 'kreislauf';
  if (cycle && bands.length > 1) { boxes = make([...d.steps, d.steps[0]]); if (boxes.some((b) => !b)) return null; bands = rowsOf(boxes as Box[]); }

  const texts: MapText[] = [], boxesOut: DiagramPlan['boxes'] = [], strokes: DiagramPlan['strokes'] = [];
  const mid = (row: number) => row - (0.65 * o.xh * k) / o.lineH; // the middle of a one-line box
  let row = 1;
  bands.forEach((band, bi) => {
    const shift = bands.length === 1 ? (o.width - (band.at(-1)!.x + band.at(-1)!.b.w)) / 2 : 0;
    band.forEach(({ b, x }, i) => {
      texts.push(...boxTexts(b, x + shift, row, k, o));
      boxesOut.push({ x0: x + shift, x1: x + shift + b.w, row0: row, row1: row + b.lines.length - 1, size: k });
      if (i || bi) strokes.push({ x0: i ? band[i - 1].x + shift + band[i - 1].b.w + a : 0, y0: mid(row), x1: x + shift - a, y1: mid(row), head: true });
    });
    const last = band.at(-1)!, end = last.x + shift + last.b.w;
    if (bi < bands.length - 1 && end + gap - a <= o.width) strokes.push({ x0: end + a, y0: mid(row), x1: end + gap - a, y1: mid(row), head: false }); // goes on below
    row += Math.max(...band.map(({ b }) => b.lines.length)) + 1;
  });
  let rows = row - 2;
  if (cycle && bands.length === 1) {
    // the way back: down from the last box, along below the row, up into the first box
    const bs = boxesOut, f = bs[0], l = bs.at(-1)!, low = Math.max(...bs.map((b) => boxBottom(b.row1, k, o))) + 0.45;
    const fx = (f.x0 + f.x1) / 2, lx = (l.x0 + l.x1) / 2;
    strokes.push({ x0: lx, y0: boxBottom(l.row1, k, o) + a / o.lineH, x1: lx, y1: low, head: false }, { x0: lx, y0: low, x1: fx, y1: low, head: false },
      { x0: fx, y0: low, x1: fx, y1: boxBottom(f.row1, k, o) + a / o.lineH, head: true });
    rows = Math.max(rows, Math.ceil(low));
  }
  return { rows, texts, boxes: boxesOut, strokes };
}

/** Schaubild: the topic boxed in the middle on top, lines down to its 2–5 sub-points side by side, each one boxed. */
function planTree(d: Diagram, o: DiagramOpts, k: number): DiagramPlan | null {
  const n = d.steps.length;
  if (n < 2 || n > 5) return null;
  const T = 1.15 * k, top = boxOf(d.topic, 0.6 * o.width, T, o);
  if (!top) return null;
  const col = o.width / n, inner = col - 1.2 * o.xh * k; // a column per sub-point, some air between the boxes
  const kids = d.steps.map((x) => boxOf(x, inner, k, o));
  if (kids.some((b) => !b)) return null;
  const bulletW = o.measure(d.bullet, k) + 0.5 * o.xh * k;
  const subs = d.subs.map((items) => items.map((x) => wrapText(x, inner - bulletW, inner - bulletW, k, o.measure)));
  if (subs.some((it) => it.some((l) => !l))) return null;

  const texts: MapText[] = [], boxes: DiagramPlan['boxes'] = [], strokes: DiagramPlan['strokes'] = [];
  const tx = (o.width - top.w) / 2;
  texts.push(...boxTexts(top, tx, 1, T, o));
  boxes.push({ x0: tx, x1: tx + top.w, row0: 1, row1: top.lines.length, size: T });
  const kr = top.lines.length + 2; // an empty row for the lines down
  let rows = kr;
  (kids as Box[]).forEach((b, i) => {
    const bx = i * col + (col - b.w) / 2;
    texts.push(...boxTexts(b, bx, kr, k, o));
    boxes.push({ x0: bx, x1: bx + b.w, row0: kr, row1: kr + b.lines.length - 1, size: k });
    // from the topic's lower edge, spread out in the order of the boxes, so the lines never cross
    const sx = tx + top.w * (n === 1 ? 0.5 : 0.2 + (0.6 * i) / (n - 1));
    strokes.push({ x0: sx, y0: boxBottom(top.lines.length, T, o) + 0.05, x1: bx + b.w / 2, y1: boxTop(kr, k, o) - 0.05, head: false });
    // its sub-points as a list under the box, the block centred under it but inside its column
    const items = subs[i] as string[][], w = Math.max(0, ...items.flatMap((l) => l.map((t, j) => (j ? bulletW : 0) + o.measure(j ? t : `${d.bullet} ${t}`, k))));
    const ix = Math.min(Math.max(i * col, bx + b.w / 2 - w / 2), (i + 1) * col - w);
    let r = kr + b.lines.length;
    for (const l of items) l.forEach((t, j) => texts.push({ x: ix + (j ? bulletW : 0), row: r++, size: k, text: j ? t : `${d.bullet} ${t}` }));
    rows = Math.max(rows, r - 1);
  });
  return { rows, texts, boxes, strokes };
}
