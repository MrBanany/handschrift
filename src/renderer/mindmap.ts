/**
 * Mind map from a pasted AI answer:
 *
 *   Mindmap: Zellatmung
 *   - Glykolyse
 *     - Zytoplasma
 *   - Citratzyklus
 *
 * clean() cuts such a block out and hands it to layout() as ONE token (MAP markers, no whitespace inside); this file
 * parses it, encodes it, and plans where everything goes. Drawing is done by layout() (it owns the handwriting).
 */

import { MAP, MAP_SEP, SP } from './markers';

export { MAP } from './markers'; // the codes live in markers.ts
const { field: F, branch: B, item: I } = MAP_SEP;

export interface MapTree { bullet: string; topic: string; branches: { title: string; items: string[] }[] }

const HEADER = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?Mind-?\s?map(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?(.*?)(?:\*\*|__)?\s*$/i;
const ITEM = /^([ \t]*)(?:[-*+•●▪◦]|\d{1,2}[.)])[ \t]+(.*\S)[ \t]*$/;

/**
 * Replaces every "Mindmap: topic" line plus the list below it by put(tree); put returns the text to leave in its place.
 * First-level list items are the branches, deeper ones their sub-points.
 */
export function extractMindmaps(text: string, put: (tree: Omit<MapTree, 'bullet'>) => string): string {
  const lines = text.split('\n'), out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = HEADER.exec(lines[i]);
    if (!head || !head[1].trim() || !ITEM.test(lines[i + 1] ?? '')) { out.push(lines[i]); continue; }
    const tree = { topic: head[1].trim(), branches: [] as MapTree['branches'] };
    let base = -1;
    for (i++; i < lines.length; i++) {
      const it = ITEM.exec(lines[i]);
      if (!it) break;
      const indent = it[1].replace(/\t/g, '  ').length, node = it[2].replace(/\*\*|__/g, '').trim();
      if (base < 0) base = indent;
      if (indent <= base || !tree.branches.length) tree.branches.push({ title: node, items: [] });
      else tree.branches.at(-1)!.items.push(node);
    }
    i--; // the loop's own i++ moves on to the line after the list
    out.push('', put(tree), '');
  }
  return out.join('\n');
}

/** One whitespace-free token for the layout (spaces become protected spaces). */
export function encodeMap(t: MapTree): string {
  const s = (x: string) => x.replace(/\s+/g, SP);
  return MAP[0] + [t.bullet, s(t.topic)].join(F) + t.branches.map((b) => B + [b.title, ...b.items].map(s).join(I)).join('') + MAP[1];
}

export function decodeMap(token: string): MapTree | null {
  if (!token.startsWith(MAP[0]) || !token.endsWith(MAP[1])) return null;
  const s = (x: string) => x.replace(new RegExp(SP, 'g'), ' ');
  const [bullet, rest] = token.slice(1, -1).split(F);
  const [topic, ...branches] = (rest ?? '').split(B);
  if (topic === undefined || !branches.length) return null;
  return { bullet: bullet || '-', topic: s(topic), branches: branches.map((b) => { const [title, ...items] = b.split(I); return { title: s(title), items: items.map(s) }; }) };
}

/** Plain lines for a map that does not fit on a page: heading, then the branches with their sub-points indented. */
export function mapAsList(t: MapTree, head: string, emph: readonly [string, string], indent: string): string[] {
  return [head + emph[0] + t.topic + emph[1], ...t.branches.flatMap((b) => [`${t.bullet} ${b.title}`, ...b.items.map((x) => `${indent}${x}`)])];
}

export interface MapText { x: number; row: number; size: number; text: string }
export interface MapPlan {
  rows: number; // baseline rows 1..rows are used (row r = r lines below the line the map starts on)
  texts: MapText[]; // x: where the ink starts, mm from the left edge of the map; size: relative to normal writing
  underlines: { x0: number; x1: number; row: number }[]; // under a branch title
  box: { x0: number; x1: number; row0: number; row1: number; size: number }; // around the topic's text rows
  /** Pen strokes from the box to a branch: [x0, row0, x1, row1], rows measured at the middle of the x-height. */
  links: [number, number, number, number][];
  width: number; // mm the whole map spans
}

export interface PlanOpts {
  width: number; xh: number; maxRows: number; wordGap: number;
  /** Ink width (mm) of a line of text at a relative size, a little generous (the real pass picks other letters). */
  measure: (text: string, size: number) => number;
}

const TOPIC = 1.3, TITLE = 1.12;

/**
 * Topic in a box in the middle, branches stacked left and right of it (the first half clockwise from the top right,
 * the rest back up the left side), their sub-points listed under them. Every text sits on its own line grid row, so
 * nothing can overlap. null if it does not fit (more than 8 branches, a word wider than its column, too tall).
 */
export function planMindmap(t: MapTree, o: PlanOpts): MapPlan | null {
  const n = t.branches.length;
  if (!n || n > 8) return null;
  const { xh, measure } = o;

  /** Greedy line breaking; null when one word alone is too wide. `first` / `rest` are the line widths. */
  const wrap = (text: string, first: number, rest: number, size: number): string[] | null => {
    const lines: string[] = [];
    let cur = '';
    for (const w of text.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${w}` : w, room = lines.length ? rest : first;
      if (measure(next, size) <= room) cur = next;
      else if (!cur) return null;
      else { lines.push(cur); cur = w; if (measure(w, size) > rest) return null; }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const pad = 0.9 * xh * TOPIC, gapMin = 0.07 * o.width;
  const topicLines = wrap(t.topic, 0.34 * o.width - 2 * pad, 0.34 * o.width - 2 * pad, TOPIC);
  if (!topicLines || topicLines.length > 3) return null;
  const cw = Math.max(...topicLines.map((l) => measure(l, TOPIC))) + 2 * pad;
  const sw = (o.width - cw - 2 * gapMin) / 2; // widest a side column may be
  if (sw < 24 * (xh / 2.6)) return null;

  // one block per branch: lines of text with their indent, in rows
  const bulletW = measure(t.bullet, 1) + 0.5 * xh, itemX = 1.2 * xh;
  const blocks = t.branches.map((b) => {
    const title = wrap(b.title, sw, sw, TITLE);
    const items = b.items.map((x) => wrap(x, sw - itemX, sw - itemX - bulletW, 1));
    if (!title || items.some((l) => !l)) return null;
    const lines: MapText[] = title.map((text, i) => ({ x: 0, row: i, size: TITLE, text }));
    let r = title.length;
    for (const it of items as string[][]) it.forEach((text, i) => lines.push({ x: itemX + (i ? bulletW : 0), row: r++, size: 1, text }));
    const w = Math.max(...lines.map((l) => l.x + measure(l.text, l.size)));
    return { lines, rows: r, w, titleRows: title.length };
  });
  if (blocks.some((b) => !b)) return null;
  const bs = blocks as NonNullable<(typeof blocks)[number]>[];

  const right = bs.slice(0, Math.ceil(n / 2)), left = bs.slice(Math.ceil(n / 2)).reverse(); // left side read upwards: last branch at the top
  const stack = (side: typeof bs) => { let r = 1; return side.map((b) => { const at = r; r += b.rows + 1; return at; }); };
  let rr = stack(right), lr = stack(left);
  const sideRows = (side: typeof bs, at: number[]) => (side.length ? at.at(-1)! + side.at(-1)!.rows - 1 : 0);
  const rows = Math.max(sideRows(right, rr), sideRows(left, lr), topicLines.length + 2);
  if (rows > o.maxRows) return null;
  // the shorter side sits in the middle of the taller one, so the topic has branches above and below on both sides
  const centre = (side: typeof bs, at: number[]) => at.map((a) => a + Math.floor((rows - sideRows(side, at)) / 2));
  rr = centre(right, rr); lr = centre(left, lr);

  // horizontal: all columns' real widths, the free space goes into the gaps (not more than a fifth of the width each)
  const rw = Math.max(0, ...right.map((b) => b.w)), lw = Math.max(0, ...left.map((b) => b.w));
  const gap = Math.min(0.2 * o.width, (o.width - lw - cw - rw) / 2);
  if (gap < 0.05 * o.width) return null;
  const total = lw + gap + cw + gap + rw, x0 = (o.width - total) / 2;
  const boxX0 = x0 + lw + gap, boxX1 = boxX0 + cw, rightX = boxX1 + gap;

  const texts: MapText[] = [], underlines: MapPlan['underlines'] = [], links: MapPlan['links'] = [];
  const c0 = 1 + Math.floor((rows - topicLines.length) / 2), mid = c0 + (topicLines.length - 1) / 2;
  topicLines.forEach((text, i) => texts.push({ x: boxX0 + (cw - measure(text, TOPIC)) / 2, row: c0 + i, size: TOPIC, text }));
  const place = (side: typeof bs, at: number[], isRight: boolean) => {
    side.forEach((b, i) => {
      const bx = isRight ? rightX : boxX0 - gap - b.w;
      // on the left every line ends at the block's inner edge, where the stroke arrives: sub-points never stick out past it
      const tx = (l: MapText) => (isRight ? l.x : b.w - measure(l.text, l.size));
      for (const l of b.lines) texts.push({ ...l, x: bx + tx(l), row: at[i] + l.row });
      const last = b.lines[b.titleRows - 1], ux = bx + tx(last);
      underlines.push({ x0: ux, x1: ux + measure(last.text, TITLE), row: at[i] + b.titleRows - 1 });
      // the stroke ends just before the block, level with its title; strokes leave the box side in the order of their
      // blocks (upper block, higher up), so they never cross
      const spread = side.length === 1 ? 0 : (i / (side.length - 1) - 0.5) * 0.6;
      links.push([isRight ? boxX1 : boxX0, mid + spread, isRight ? bx - 0.5 * xh : bx + b.w + 0.5 * xh, at[i]]);
    });
  };
  place(right, rr, true);
  place(left, lr, false);
  return { rows, texts, underlines, box: { x0: boxX0, x1: boxX1, row0: c0, row1: c0 + topicLines.length - 1, size: TOPIC }, links, width: o.width };
}
