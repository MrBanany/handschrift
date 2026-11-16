import { connectionModel, makeConnector, type Connector, type Library } from '../connectors/connect';
import type { Anchor, GlyphMeta } from '../glyphstore/types';
import { MM, XH } from '../template/layout';
import { SUB, SUB_LETTERS, SUP, SUP_LETTERS } from './clean';
import { withoutWideGaps } from './gaps';
import { flat as flatFrac } from './latex';
import { decodeDiagram, diagramAsLines, planDiagram, type DiagramPlan } from './diagram';
import { ARROW, BOX, CARD, CIRC, CORNELL, DIAGRAM, EMPH, FRAC, HEAD, INDENT, MAP, MARK, NOTE, ROOT, SP, STRUCT } from './markers';
import { decodeMap, mapAsList, planMindmap, type MapPlan, type MapText } from './mindmap';
import { decodePlot, parsePlot, planPlot, type PlotPlan } from './plot';
import { molecule, type Molecule } from './structure';

/** Gap between words (x-heights, ink to ink) when none was learned. */
export const DEFAULT_WORD_GAP = 1.1;

export interface Settings {
  xh: number; // x-height on the page (mm)
  lineH: number; // line spacing (mm)
  margin: number; // mm
  pageW: number; pageH: number; // mm
  hasty: number; // 0 = tidy, 1 = hasty
  seed: number;
  letterGap?: number | null; // learned gap between letters (x-heights), see glyphstore/optimize
  wordGap?: number | null; // learned gap between words (x-heights), see segmentation/style
  cursive?: boolean; // joined-up writing: letters inside a word are always joined
  bridges?: boolean; // false: the letters bring their own joins (a joined-up font), draw no extra bridge strokes
}

/** Canvas-order affine: x' = a x + c y + e, y' = b x + d y + f. Glyph px -> page mm. */
export type Mat = [number, number, number, number, number, number];
export interface Placed { g: GlyphMeta; m: Mat; accent?: boolean } // accent: written in the heading colour
export interface Missing { ch: string; x: number; y: number; w: number; h: number }
/** A written line as plain text (alt text of the preview). */
export interface Line { text: string }
/** Highlighter stroke behind text: from (x0, y0) to (x1, y1) along its middle, h tall (mm). */
export interface Mark { x0: number; y0: number; x1: number; y1: number; h: number }
export interface Page { glyphs: Placed[]; connectors: Connector[]; missing: Missing[]; lines: Line[]; marks: Mark[] }

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tf = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const dir = (m: Mat, a: Anchor): [number, number] => {
  const x = m[0] * a.dx + m[2] * a.dy, y = m[1] * a.dx + m[3] * a.dy, l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const scaleOf = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/** Left/right edge of the actual ink (mm), not the slanted bitmap box, so word gaps look even. */
export function inkX(g: GlyphMeta, m: Mat): [number, number] {
  let l = Infinity, r = -Infinity;
  BANDS.forEach((b, i) => {
    const y = g.baseline + b, L = g.prof?.l[i], R = g.prof?.r[i];
    if (L != null) l = Math.min(l, m[0] * L + m[2] * y + m[4]);
    if (R != null) r = Math.max(r, m[0] * R + m[2] * y + m[4]);
  });
  if (l > r) { const xs = [[0, 0], [g.w, 0], [0, g.h], [g.w, g.h]].map(([x, y]) => tf(m, x, y)[0]); return [Math.min(...xs), Math.max(...xs)]; }
  return [l, r];
}

/** Top and bottom of the actual ink (mm), from the profile bands; the bitmap box otherwise. */
type Pt = [number, number];
/** How a line pulled straight by hand is off: tilt (degrees, spread), ends that run over or stop short and their sideways move at most (x-heights), bow (share of its length). */
interface Feel { tilt: number; end: number; maxOff: number; bow: number }
/** Underlines, frames, boxes, fraction bars, arrow heads: only a hair off. */
const FINE: Feel = { tilt: 0.25, end: 0.08, maxOff: 0.12, bow: 0 };
/** Arrows and lines of a diagram, a graph's axes. */
const LINE: Feel = { tilt: 0.6, end: 0.12, maxOff: 0.35, bow: 0.006 };
/** Mind-map branches: drawn more freely, a slight bow and their own angle. */
const FREE: Feel = { tilt: 1.5, end: 0.15, maxOff: 0.7, bow: 0.035 };
/** How far a box drawn around text reaches below its last baseline, in x-heights: clear of the descenders (see diagram.ts boxBottom). */
const BOX_DOWN = 1;

export function inkY(g: GlyphMeta, m: Mat): [number, number] {
  const rows = BANDS.map((b, i) => (g.prof?.l[i] != null ? b : null)).filter((b): b is number => b !== null);
  const [t, u] = rows.length ? [g.baseline + rows[0] - BAND / 2, g.baseline + rows.at(-1)! + BAND / 2] : [0, g.h];
  return [m[3] * t + m[5], m[3] * u + m[5]];
}

/**
 * Split a word into the largest available samples: whole word > word part (up to 5 letters, e.g. "keit") > pair > single letter.
 * rand: then a multi-letter sample is sometimes passed over for the single letters (when those all exist), so one written
 * "st" does not stand in for every s-t of the text. Kept more often the more variants of it there are.
 */
export function segment(word: string, lib: Library, rand?: () => number): string[] {
  const out: string[] = [];
  const use = (key: string) => lib.has(key) && (!rand || ![...key].every((c) => lib.has(c)) || rand() < Math.min(0.8, 0.4 + 0.15 * lib.get(key)!.length));
  for (const run of word.match(/\p{L}+|[^\p{L}]/gu) ?? []) {
    const chars = [...run];
    if (chars.length > 1 && use(run)) { out.push(run); continue; }
    for (let i = 0; i < chars.length;) {
      const len = [5, 4, 3, 2].find((n) => i + n <= chars.length && n < chars.length && use(chars.slice(i, i + n).join('')));
      if (len) { out.push(chars.slice(i, i + len).join('')); i += len; }
      else out.push(chars[i++]);
    }
  }
  return out;
}

/** Raised/lowered digits and letters, charges and the prime: small marks next to a letter, see layoutWord. */
const SMALL = new Set([...SUP, ...SUB, ...Object.values(SUP_LETTERS), ...Object.values(SUB_LETTERS), '⁺', '⁻', "'", '′']);

interface WordItem { g: GlyphMeta; m: Mat; join: boolean; from?: Anchor; to?: Anchor }
/** Pen stroke of a formula (fraction bar, root hook and bar) from (x0, y0) to (x1, y1), mm relative to the word's baseline. */
interface Bar { x0: number; y0: number; x1: number; y1: number }

/**
 * Splits a formula at the separators that stand outside every fraction and root;
 * without a separator: into plain text and whole fractions / roots (which may hold more inside).
 */
export function topLevel(t: string, sep?: string): string[] {
  const out = [''];
  let depth = 0;
  for (const c of t) {
    const open = c === FRAC[0] || c === ROOT[0], close = c === FRAC[2] || c === ROOT[2];
    if (open && !depth++ && !sep && out.at(-1)) out.push('');
    if (close) depth = Math.max(0, depth - 1);
    if (!depth && c === sep) out.push('');
    else out[out.length - 1] += c;
    if (close && !depth && !sep) out.push('');
  }
  return out;
}

const isLetter = (c: string) => /\p{L}/u.test(c);

/**
 * Joined-up writing without a detected entry/exit stroke: join at the ink nearest the baseline,
 * on the right ('r', leaving) or left ('l', arriving), pen moving up and to the right.
 */
function inkAnchor(g: GlyphMeta, side: 'l' | 'r'): Anchor | null {
  const xs = g.prof?.[side];
  if (!xs) return null;
  // bands inside the x-height zone, the one closest to the baseline first
  const order = BANDS.map((b, i) => [b, i] as const).filter(([b]) => b < 0 && b > -XH * MM).sort((a, b) => b[0] - a[0]);
  for (const [b, i] of order) {
    const x = xs[i];
    if (x != null) return { x, y: g.baseline + b, dx: 0.85, dy: -0.5, w: g.strokeW };
  }
  return null;
}

/** Band centres of GlyphMeta.prof, relative to the baseline in glyph px (see segmentation/analyze profiles). */
export const BAND = (XH * MM) * 0.35;
export const BANDS = Array.from({ length: 10 }, (_, i) => -2.6 * XH * MM + (i + 0.5) * BAND);

export function profile(alpha: Uint8Array, w: number, h: number, baseline: number): NonNullable<GlyphMeta['prof']> {
  const l: (number | null)[] = BANDS.map(() => null), r: (number | null)[] = BANDS.map(() => null);
  for (let y = 0; y < h; y++) {
    const i = Math.floor((y - baseline + 2.6 * XH * MM) / BAND);
    if (i < 0 || i >= BANDS.length) continue;
    for (let x = 0; x < w; x++) if (alpha[y * w + x] >= 128) {
      l[i] = Math.min(l[i] ?? x, x);
      r[i] = Math.max(r[i] ?? x, x);
    }
  }
  return { l, r };
}

/**
 * Smallest x shift of the next glyph so its ink clears the previous glyph's ink band by band,
 * like real letters fitting together ("T" + "e" tucks under the bar). null when profiles are missing.
 */
function opticalShift(pg: GlyphMeta, pm: Mat, g: GlyphMeta, m: Mat): number | null {
  if (!pg.prof || !g.prof) return null;
  let need = -Infinity;
  pg.prof.r.forEach((R, i) => {
    if (R === null) return;
    const pr = pm[0] * R + pm[2] * (pg.baseline + BANDS[i]) + pm[4];
    for (let j = Math.max(0, i - 1); j <= Math.min(BANDS.length - 1, i + 1); j++) {
      const L = g.prof!.l[j];
      if (L !== null) need = Math.max(need, pr - (m[0] * L + m[2] * (g.baseline + BANDS[j]) + m[4]));
    }
  });
  return need === -Infinity ? null : need;
}

/**
 * The same placed letter written with another variant: same spot on the baseline, same slant and size.
 * shortcut: the following letters do not move, so a much wider variant can touch its neighbour; re-run the layout per word if that bothers.
 */
export function swapVariant(p: Placed, g: GlyphMeta): Placed {
  const [a, b, c, d, e, f] = p.m, r = (g.scale ?? 1) / (p.g.scale ?? 1);
  const x0 = c * p.g.baseline + e, y0 = d * p.g.baseline + f; // left end of the baseline on the page
  return { ...p, g, m: [a * r, b * r, c * r, d * r, x0 - c * r * g.baseline, y0 - d * r * g.baseline] };
}

/** Index of the letter whose box contains (x, y) mm, or -1. */
/** Index of the glyph nearest to (x, y) in mm, or -1 if none is within `reach` mm (a finger is not precise). */
export function glyphAt(page: Page, x: number, y: number, reach = 3): number {
  let best = -1, bestD = reach;
  page.glyphs.forEach(({ g, m }, i) => {
    const xs: number[] = [], ys: number[] = [];
    for (const [u, v] of [[0, 0], [g.w, 0], [0, g.h], [g.w, g.h]]) { const [px, py] = tf(m, u, v); xs.push(px); ys.push(py); }
    const d = Math.hypot(Math.max(Math.min(...xs) - x, 0, x - Math.max(...xs)), Math.max(Math.min(...ys) - y, 0, y - Math.max(...ys)));
    if (d <= bestD) { best = i; bestD = d; }
  });
  return best;
}

export function layout(text: string, library: Library, s: Settings): { pages: Page[]; missing: Set<string> } {
  const lib = withoutWideGaps(library); // pairs written with a hole in them would read as a gap inside the word
  const rand = mulberry32(s.seed);
  const splitRand = mulberry32(s.seed ^ 0x2f6b); // own stream: which word parts get used does not shift every other random choice
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const h = s.hasty, sig0 = 0.6 + 1.4 * h, xh = s.xh;
  let sig = sig0, lineSize = 1; // both change per line, see newLine
  const s0 = xh / (XH * MM); // glyph px -> mm
  const pConnect = connectionModel(lib);
  const lastUsed = new Map<string, string>();
  const missingSet = new Set<string>();

  const pick = (key: string): GlyphMeta => {
    const all = lib.get(key)!;
    const prev = lastUsed.get(key);
    const pool = all.length > 1 ? all.filter((v) => v.src !== prev) : all; // never the same sample twice in a row
    const g = pool[Math.floor(rand() * pool.length)];
    lastUsed.set(key, g.src);
    return g;
  };

  function layoutWord(word: string, size = 1) {
    const items: WordItem[] = [], missing: Missing[] = [];
    const wordSize = size * lineSize + gauss() * 0.02 * sig, wordSlant = gauss() * 0.02 * sig + 0.06 * h;
    let cursor = 0, walk = gauss() * 0.04 * xh * sig;
    let prev: { g: GlyphMeta; m: Mat; right: number; inkR: number; last: string } | null = null;

    for (const key of segment(word, lib, splitRand)) {
      if (!lib.has(key)) {
        const w = 0.7 * xh;
        missing.push({ ch: key, x: cursor + (prev ? 0.15 * xh : 0), y: -1.1 * xh, w, h: 1.4 * xh });
        missingSet.add(key);
        cursor += w + (prev ? 0.15 * xh : 0);
        prev = null;
        continue;
      }
      const g = pick(key);
      const k = s0 * (g.scale ?? 1) * wordSize * (1 + gauss() * 0.025 * sig);
      const sl = wordSlant + gauss() * 0.02 * sig;
      const rot = gauss() * 0.012 * sig;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      // L = Rotate * Shear * Scale; shear leans the top to the right
      const kx = k * (1 + gauss() * 0.03 * sig); // a letter is never exactly as wide as last time
      const a = cs * kx, b = sn * kx, c = (-sl * cs - sn) * k, d = (-sl * sn + cs) * k;
      walk = 0.55 * walk + gauss() * 0.03 * xh * sig;
      const base: Mat = [a, b, c, d, -c * g.baseline, -d * g.baseline];
      const xs = [[0, 0], [g.w, 0], [0, g.h], [g.w, g.h]].map(([x, y]) => tf(base, x, y)[0]);
      const left = Math.min(...xs), right = Math.max(...xs);

      const first = [...key][0];
      const letters = !!prev && isLetter(prev.last) && isLetter(first);
      // Joined-up writing: join where the ink meets the baseline zone; detected stroke ends often sit inside the letter.
      const exitA = prev && (s.cursive ? inkAnchor(prev.g, 'r') ?? prev.g.exit : prev.g.exit);
      const entryA = s.cursive ? inkAnchor(g, 'l') ?? g.entry : g.entry;
      // A stroke end found down in a descender (f, g, j) or up at an ascender would give a long slanted bridge, not a join.
      const near = (an: Anchor, gl: GlyphMeta) => an.y - gl.baseline < 0.35 * XH * MM && gl.baseline - an.y < 1.3 * XH * MM;
      const join = !!(letters && exitA && entryA && near(exitA, prev!.g) && near(entryA, g)
        && (s.cursive || rand() < Math.min(1, pConnect(prev!.last, first) * (1 + 0.25 * h))));
      let tx: number;
      if (join) {
        const ex = tf(prev!.m, exitA!.x, exitA!.y);
        const en = tf(base, entryA!.x, entryA!.y);
        // Joined-up letters bring their own lead-in and lead-out strokes: a longer bridge would read as a hyphen.
        const gap = s.cursive ? 0.03 * xh + 0.15 * Math.abs(en[1] + walk - ex[1])
          : Math.max(0.05 * xh, (0.18 - 0.05 * h) * xh * (1 + gauss() * 0.2 * sig)) + 0.25 * Math.abs(en[1] + walk - ex[1]);
        // Overlap limit from the ink, not the bitmap: word parts sit in wide boxes with empty space on the right.
        tx = Math.max(ex[0] + gap - en[0], prev!.inkR - 0.35 * xh - inkX(g, base)[0]);
        // Joined-up: the letters touch at the join, but a loop must not run over the previous letter's ink.
        const tuck = s.cursive ? opticalShift(prev!.g, prev!.m, g, base) : null;
        if (tuck !== null) tx = Math.max(tx, tuck - 0.1 * xh);
      } else {
        // full stops and commas hug the word; a colon keeps a little air (its dots would touch the letter before it)
        const pf = /^[:;]/.test(first) ? 1.5 : /\p{L}|\p{N}/u.test(first) ? 1 : 0.6;
        const gap = prev ? Math.max(0.04 * xh, (0.16 - 0.06 * h) * xh * pf * (1 + gauss() * 0.25 * sig)) : 0;
        const tuck = prev ? opticalShift(prev.g, prev.m, g, base) : null;
        const own = prev && s.letterGap != null ? Math.max(0.03 * xh, s.letterGap * (1 - 0.3 * h) * xh * pf * (1 + gauss() * 0.2 * sig)) : gap;
        tx = tuck === null ? cursor + gap - left : Math.max(tuck + own, cursor - left - 0.6 * xh);
        // Raised and lowered marks (², ₄, ⁺, the prime) and commas keep clear of the ink next to them: an index and an exponent
        // stand side by side (SO₄²⁻), a plus does not sit on the letter, nothing tucks under a comma or a raised mark.
        const clear = !prev ? 0 : SMALL.has(first) && SMALL.has(prev.last) ? 0.04 : SMALL.has(first) || SMALL.has(prev.last) ? 0.12 : /^[,.;]/.test(first) ? 0.08 : 0;
        if (clear) tx = Math.max(tx, prev!.inkR + clear * xh - inkX(g, base)[0]);
      }
      const m: Mat = [a, b, c, d, base[4] + tx, base[5] + walk];
      items.push({ g, m, join, from: join ? exitA! : undefined, to: join ? entryA! : undefined });
      cursor = Math.max(cursor, right + tx); // a letter tucked under the previous one must not shrink the word
      prev = { g, m, right: cursor, inkR: inkX(g, m)[1], last: [...key].at(-1)! };
    }
    let inkL = Infinity, inkR = -Infinity;
    for (const it of items) { const [l, r] = inkX(it.g, it.m); inkL = Math.min(inkL, l); inkR = Math.max(inkR, r); }
    for (const ms of missing) { inkL = Math.min(inkL, ms.x); inkR = Math.max(inkR, ms.x + ms.w); }
    return { items, missing, inkL: Number.isFinite(inkL) ? inkL : 0, inkR: Number.isFinite(inkR) ? inkR : cursor, bars: [] as Bar[] };
  }
  type Laid = ReturnType<typeof layoutWord>;

  /** Moves a laid-out word by (dx, dy) mm and adds it to `into`. */
  const put = (into: Laid, w: Laid, dx: number, dy: number) => {
    for (const it of w.items) { const m: Mat = [...it.m]; m[4] += dx; m[5] += dy; into.items.push({ ...it, m }); }
    for (const ms of w.missing) into.missing.push({ ...ms, x: ms.x + dx, y: ms.y + dy });
    for (const b of w.bars) into.bars.push({ x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 + dx, y1: b.y1 + dy });
    into.inkL = Math.min(into.inkL, w.inkL + dx); into.inkR = Math.max(into.inkR, w.inkR + dx);
  };
  const empty = (): Laid => ({ items: [], missing: [], inkL: Infinity, inkR: -Infinity, bars: [] });

  /** Several words (separated by \u0010) on one baseline, a bit closer than normal words; fractions and roots inside them are stacked and drawn, in any depth. */
  function layoutRun(text: string, size: number): Laid {
    const out = empty();
    let x = 0;
    for (const w of topLevel(text, SP).filter(Boolean)) {
      for (const p of topLevel(w).filter(Boolean)) {
        const part = (sep: string) => { const [a = '', ...b] = topLevel(p.slice(1, p.endsWith(FRAC[2]) || p.endsWith(ROOT[2]) ? -1 : undefined), sep); return [a, b.join('')] as const; };
        const wd = p[0] === FRAC[0] ? layoutFrac(...part(FRAC[1]), '', size) : p[0] === ROOT[0] ? layoutRoot(...part(ROOT[1]), size) : layoutWord(p, size);
        put(out, wd, x - wd.inkL, 0);
        x = out.inkR + 0.12 * xh * size;
      }
      x = out.inkR + 0.5 * xh * size;
    }
    if (!Number.isFinite(out.inkL)) { out.inkL = 0; out.inkR = 0; }
    return out;
  }

  /** Top and bottom of a laid-out piece's ink (mm, relative to its baseline); at least a small letter tall. */
  const extentY = (l: Laid, size: number): [number, number] => {
    let t = -xh * size, b = 0;
    for (const it of l.items) { const [a, c] = inkY(it.g, it.m); t = Math.min(t, a); b = Math.max(b, c); }
    for (const s of l.bars) { t = Math.min(t, s.y0, s.y1); b = Math.max(b, s.y0, s.y1); }
    return [t, b];
  };

  /**
   * A root like written by hand: a small tick, down, up, and the bar across the whole radicand, all pen strokes (so they are
   * ink in GoodNotes too); as tall and deep as what stands under it. The index of an n-th root is written small into the hook.
   */
  function layoutRoot(index: string, rad: string, size: number): Laid {
    const xs = xh * size, r = layoutRun(rad, size), ix = index ? layoutRun(index, 0.6 * size) : null;
    const [t, b] = extentY(r, size), top = t - 0.3 * xs, bot = b + 0.05 * xs;
    const ym = bot - Math.min(0.5 * (bot - top), 0.75 * xs); // where the tick starts: half way up, lower on a tall root
    const x0 = ix ? Math.max(0, ix.inkR - ix.inkL - 0.4 * xs) : 0; // a wide index pushes the hook right
    const out = empty();
    put(out, r, x0 + 1.1 * xs - r.inkL, 0);
    const end = Math.max(out.inkR, x0 + 1.6 * xs) + 0.2 * xs;
    if (ix) put(out, ix, x0 + 0.4 * xs - ix.inkR, ym - 0.45 * xs);
    const pts = [[x0 - 0.05 * xs, ym + 0.12 * xs], [x0 + 0.25 * xs, ym - 0.05 * xs], [x0 + 0.5 * xs, bot], [x0 + 0.9 * xs, top], [end, top]];
    for (let i = 0; i + 1 < pts.length; i++) out.bars.push({ x0: pts[i][0], y0: pts[i][1], x1: pts[i + 1][0], y1: pts[i + 1][1] });
    out.inkL = 0; out.inkR = end;
    return out;
  }

  /** Numerator over denominator, smaller, centred over a pen-stroke fraction bar at mid x-height; `tail` (",") follows. */
  function layoutFrac(num: string, den: string, tail: string, size: number): Laid {
    const f = 0.8 * size, n = layoutRun(num, f), d = layoutRun(den, f);
    const over = 0.15 * xh, W = Math.max(n.inkR - n.inkL, d.inkR - d.inkL, 0.6 * xh) + 2 * over;
    const bar = -0.45 * xh * size;
    // whatever reaches below the numerator's baseline or above ~1.3 x-heights in the denominator (a root, tall digits, a g)
    // keeps off the bar: no line through the writing
    const nDown = Math.max(0, extentY(n, f)[1] - 0.1 * xh * f);
    const dUp = Math.max(0, -extentY(d, f)[0] - 1.3 * xh * f);
    const out = empty();
    put(out, n, (W - (n.inkR - n.inkL)) / 2 - n.inkL, bar - 0.3 * xh * size - nDown);
    put(out, d, (W - (d.inkR - d.inkL)) / 2 - d.inkL, bar + 0.3 * xh * size + 1.3 * xh * f + dUp); // digits are ~1.3 x-heights tall
    out.bars.push({ x0: 0, y0: bar, x1: W, y1: bar });
    out.inkL = 0; out.inkR = Math.max(out.inkR, W);
    if (tail) { const t = layoutWord(tail, size); put(out, t, out.inkR + 0.1 * xh - t.inkL, 0); }
    return out;
  }

  const pages: Page[] = [];
  let page: Page, y = 0, lineX = 0, lineStart = 0, slope = 0, amp = 0, phase = 0, lambda = 1;
  let rec: Line | null = null;
  let lineDown = 0; // extra lines a tall structural formula on this line reaches down into
  let from = { g: 0, c: 0, m: 0, k: 0 }; // where this line's ink starts in the page lists
  const newPage = () => { page = { glyphs: [], connectors: [], missing: [], lines: [], marks: [] }; pages.push(page); y = s.margin + s.lineH; };
  let heading = false;
  /** Everything written on this line so far gets the heading colour. */
  const accentLine = () => {
    if (!heading) return;
    for (const g of page!.glyphs.slice(from.g)) g.accent = true;
    for (const c of page!.connectors.slice(from.c)) c.accent = true;
  };
  let marginWalk = 0, rightEdge = s.pageW - s.margin, hang = 0;
  let colL = s.margin, colR = s.pageW - s.margin, inBlock = false; // the column being written: the page, or one side of a card (placeBlock)
  const newLine = (first = false) => {
    closeUnderline(); closeMark(); closeRing();
    if (!first) accentLine();
    rec = null;
    if (!first) y += s.lineH * (1 + Math.max(0, lineDown));
    lineDown = 0;
    if (first || (!inBlock && y > s.pageH - s.margin)) newPage();
    from = { g: page!.glyphs.length, c: page!.connectors.length, m: page!.missing.length, k: page!.marks.length };
    // Writing gets a little looser towards the end of a page, and its size wanders slowly from line to line.
    sig = sig0 * (1 + 0.35 * Math.max(0, (y - s.margin) / (s.pageH - 2 * s.margin)));
    lineSize = 0.7 * lineSize + 0.3 + gauss() * 0.012 * sig;
    // Nobody starts every line at the same spot: the left edge wanders a little; the right edge ends where the next word no longer fits, sometimes earlier.
    // 0.7 mm was too little to see (a parent noticed every line starting at the same spot): about 1.5 mm, never far left of the margin
    marginWalk = 0.5 * marginWalk + gauss() * 1.4 * sig;
    lineStart = lineX = Math.max(colL - 1.2, colL + 1 + marginWalk);
    rightEdge = colR - Math.abs(gauss()) * 2.5 * sig;
    slope = Math.max(-0.003, Math.min(0.003, gauss() * 0.0012 * sig)); // a line may wander, but never visibly lean (0.006 leaned ~1 mm over a line)
    amp = 0.06 * xh * sig * rand();
    phase = rand() * 2 * Math.PI;
    lambda = 60 + 60 * rand();
  };
  /** Moves everything written on this line down by dy (mm), to make room above for a tall formula. */
  const shiftLine = (dy: number) => {
    for (const g of page!.glyphs.slice(from.g)) g.m[5] += dy;
    for (const c of page!.connectors.slice(from.c)) for (const q of c.p) q[1] += dy;
    for (const ms of page!.missing.slice(from.m)) ms.y += dy;
    for (const k of page!.marks.slice(from.k)) { k.y0 += dy; k.y1 += dy; }
    y += dy;
  };
  /** Line break inside a paragraph: list items continue under their text. */
  const wrap = () => { newLine(); lineX = lineStart + hang * (1 + gauss() * 0.05); };
  const drift = (x: number) => slope * (x - lineStart) + amp * Math.sin((2 * Math.PI * x) / lambda + phase);

  // Emphasised words (bold, headings) are underlined: one pen stroke per line, pulled straight, below the letters.
  const ws = [...lib.values()].flat().map((g) => g.strokeW).sort((a, b) => a - b);
  const penW = (ws[ws.length >> 1] ?? 5) * s0;
  let under: { x0: number; x1: number } | null = null;
  function closeUnderline() {
    if (!under) return;
    const { x0, x1 } = under;
    underline(x0, x1, (x) => y + drift(x)); // along the line's own drift, so it stays under the words
    under = null;
  }
  /**
   * An underline from x0 to x1 below the baseline base(x): just under the letters, or under the deepest descender (g, y, p)
   * in that stretch. One that would then reach the next line's letters stays up and leaves a gap around each descender:
   * a line never runs through the writing.
   */
  function underline(x0: number, x1: number, base: (x: number) => number) {
    const desc: [number, number][] = [];
    let low = 0.3 * xh, deep = low; // under the other letters / under the descenders too (room for the line's lean included)
    for (const p of page!.glyphs) {
      const [t, u] = inkY(p.g, p.m), [l, r] = inkX(p.g, p.m), b = base((l + r) / 2);
      if (r < x0 || l > x1 || t > b || u < b - 0.5 * xh) continue; // only letters of this line
      if (u < b + 0.45 * xh) { low = Math.max(low, u - b + 0.25 * xh); continue; }
      desc.push([l, r]);
      deep = Math.max(deep, u - b + 0.25 * xh);
    }
    deep = Math.max(deep, low);
    if (deep <= s.lineH - 2.1 * xh) { pulled(x0, base(x0) + deep, x1, base(x1) + deep, FINE); return; }
    let from = x0;
    for (const [l, r] of desc.sort((a, b) => a[0] - b[0])) {
      if (l - 0.3 * xh - from > 0.8 * xh) pulled(from, base(from) + low, l - 0.3 * xh, base(l - 0.3 * xh) + low, FINE);
      from = Math.max(from, r + 0.3 * xh);
    }
    if (x1 - from > 0.8 * xh) pulled(from, base(from) + low, x1, base(x1) + low, FINE);
  }
  // Circled ((text)) or boxed (\boxed{…}) words: drawn by hand around this line's piece of them.
  let ring: { box: boolean; x0: number; x1: number; top: number; bot: number } | null = null;
  function closeRing() {
    if (!ring) return;
    const { box, x0, x1, top: inkTop, bot: inkBot } = ring;
    ring = null;
    if (box) {
      // roomy enough for what is inside (a fraction is taller than a word); corners overshoot a little, like a quick box
      const l = x0 - 0.55 * xh, r = x1 + 0.55 * xh, o = 0.15 * xh;
      const up = Math.min(-1.75 * xh, inkTop - y - 0.4 * xh), down = Math.max(0.7 * xh, inkBot - y + 0.4 * xh);
      // a tall box must not cut through the line above: move this line down a whole line (like a tall molecule)
      const room = y - s.lineH + 0.9 * xh;
      if (y + up < room) shiftLine(Math.ceil((room - y - up) / s.lineH) * s.lineH);
      lineDown = Math.max(lineDown, Math.ceil((down - s.lineH + 1.6 * xh) / s.lineH));
      // pulled straight: about level and plumb (the line's drift taken at the box's middle), corners overshoot a little
      const top = y + drift((l + r) / 2) + up, bot = y + drift((l + r) / 2) + down;
      const oj = () => o * Math.max(0.3, 1 + 0.3 * gauss());
      pulled(l - oj(), top, r + oj(), top, FINE);
      pulled(r, top - oj(), r, bot + oj(), FINE);
      pulled(r + oj(), bot, l - oj(), bot, FINE);
      pulled(l, bot + oj(), l, top - oj(), FINE);
      return;
    }
    // an ellipse in one go, a bit more than once round; it widens slightly so the ends do not meet exactly
    const cx = (x0 + x1) / 2, cy = y + drift(cx) - 0.55 * xh, rx = (x1 - x0) / 2 + 0.6 * xh, ry = 1.35 * xh;
    const t0 = Math.PI * (0.9 + 0.2 * rand()), total = 2 * Math.PI + 0.3 + 0.2 * rand(), n = 5, d = total / n, k = (4 / 3) * Math.tan(d / 4);
    const at = (t: number) => { const sc = 1 + (0.07 * (t - t0)) / total; return [cx + rx * sc * Math.cos(t), cy - ry * sc * Math.sin(t), -rx * sc * Math.sin(t), -ry * sc * Math.cos(t)]; };
    for (let i = 0; i < n; i++) {
      const [ax, ay, adx, ady] = at(t0 + i * d), [bx, by, bdx, bdy] = at(t0 + (i + 1) * d);
      page!.connectors.push({ p: [[ax, ay], [ax + k * adx, ay + k * ady], [bx - k * bdx, by - k * bdy], [bx, by]], w0: penW, w1: penW });
    }
  }
  let mark: { x0: number; x1: number } | null = null;
  function closeMark() {
    if (!mark) return;
    const x0 = mark.x0 - 0.25 * xh, x1 = mark.x1 + 0.25 * xh;
    page!.marks.push({ x0, x1, y0: y + drift(x0) - 0.5 * xh, y1: y + drift(x1) - 0.5 * xh + gauss() * 0.05 * xh, h: 1.5 * xh });
    mark = null;
  }

  /**
   * A line pulled straight by hand (on the iPad the pen snaps it straight): no wobble, but never computer-exact. It leans
   * a little (turned about its middle, the ends move at most maxOff), its ends run over or stop short, a free one bows.
   * into: the end points at something (a box, a text) and only ever stops short of it. Returns where it really ends and its direction.
   */
  function pulled(x0: number, y0: number, x1: number, y1: number, f: Feel, o: { into?: boolean; on?: Page } = {}) {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / len, uy = (y1 - y0) / len, cap = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    const t = cap((gauss() * f.tilt * Math.PI) / 180, Math.min((3 * f.tilt * Math.PI) / 180, Math.atan((f.maxOff * xh) / (len / 2)))), c = Math.cos(t), sn = Math.sin(t);
    const vx = ux * c - uy * sn, vy = ux * sn + uy * c, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const e0 = cap(gauss() * f.end, 2 * f.end) * xh, e1 = cap(gauss() * f.end, 2 * f.end) * xh * (o.into ? 0 : 1) - (o.into ? Math.abs(gauss() * f.end * xh) : 0);
    const a: Pt = [mx - vx * (len / 2 + e0), my - vy * (len / 2 + e0)], b: Pt = [mx + vx * (len / 2 + e1), my + vy * (len / 2 + e1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), bow = cap(gauss() * f.bow, 2 * f.bow) * d, nx = -vy * bow, ny = vx * bow;
    (o.on ?? page!).connectors.push({ p: [a, [a[0] + (b[0] - a[0]) / 3 + nx, a[1] + (b[1] - a[1]) / 3 + ny], [a[0] + (2 * (b[0] - a[0])) / 3 + nx, a[1] + (2 * (b[1] - a[1])) / 3 + ny], b], w0: penW, w1: penW });
    return { x: b[0], y: b[1], ux: vx, uy: vy };
  }
  const rule = (x0: number, y0: number, x1: number, y1: number, on = page!) => pulled(x0, y0, x1, y1, FINE, { on }); // frames: like drawn with a ruler, almost
  /** A slightly bowed, wobbly pen stroke from (x0, y0) to (x1, y1) in mm. */
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    const j = () => gauss() * 0.03 * xh;
    x0 += j(); y0 += j(); x1 += j(); y1 += j();
    const dx = x1 - x0, dy = y1 - y0, bow = gauss() * 0.025;
    const nx = -dy * bow, ny = dx * bow;
    page!.connectors.push({ p: [[x0, y0], [x0 + dx / 3 + nx, y0 + dy / 3 + ny], [x0 + (2 * dx) / 3 + nx, y0 + (2 * dy) / 3 + ny], [x1, y1]], w0: penW, w1: penW });
  };

  /**
   * Arrows (→ ← ⇒ ⇔ ↔ ⇌) are drawn as pen strokes, so each one can have its own length: normal, long (-->) or very long (--->)
   * from clean(), a bit different every time, and as long as its label when one stands above it (->[Kat]).
   * shortcut: the head is two strokes, not the writer's own ">" sample; the label's letters are not joined up.
   */
  const ARROWS = /^(?:\u001b([^\u001c]*)\u001c)?([\u0001\u001f])?([→←⇒⇔↔⇌])$/;
  function drawArrow(am: RegExpExecArray, size: number) {
    const [, label, len, ch] = am, xs = xh * size;
    const lab = label ? layoutRun(label, 0.7 * size) : null;
    const L = Math.max((len === ARROW[1] ? 8 : len === ARROW[0] ? 5.2 : 3) * (0.8 + 0.4 * rand()) * xs, lab ? lab.inkR - lab.inkL + 1.4 * xs : 0);
    if (lineX > lineStart && lineX + L > rightEdge) wrap();
    const x0 = lineX, x1 = x0 + L, ym = (x: number, dy = 0) => y + drift(x) - 0.5 * xs + dy;
    const end = gauss() * 0.05 * xs; // the far end is never at exactly the same height
    const dbl = ch === '⇒' || ch === '⇔';
    /** Two barbs (or just the upper / lower one) leaning back from the tip. */
    const head = (tx: number, d: 1 | -1, dy = 0, only = 0) => {
      const hl = (dbl ? 0.7 : 0.55) * xs * (0.85 + 0.3 * rand()), a = (dbl ? 0.72 : 0.5) + gauss() * 0.05, bx = tx - d * hl * Math.cos(a), t = ym(tx, dy);
      for (const k of only ? [only] : [-1, 1]) stroke(bx, ym(bx, dy) + k * hl * Math.sin(a), tx, t);
    };
    const shaft = (a: number, b: number, dy = 0, tilt = 0) => stroke(a, ym(a, dy), b, ym(b, dy) + tilt);
    if (ch === '⇌') { shaft(x0, x1, -0.2 * xs, end); shaft(x1, x0, 0.2 * xs, -end); head(x1, 1, -0.2 * xs, -1); head(x0, -1, 0.2 * xs, 1); }
    else if (dbl) {
      const r = ch === '⇔' ? x0 + 0.3 * xs : x0;
      shaft(r, x1 - 0.3 * xs, -0.2 * xs, end); shaft(r, x1 - 0.3 * xs, 0.2 * xs, end);
      head(x1, 1, end); if (ch === '⇔') head(x0, -1);
    } else {
      shaft(x0, x1, 0, end);
      if (ch !== '←') head(x1, 1, end);
      if (ch !== '→') head(x0, -1);
    }
    if (lab) for (const it of lab.items) {
      const m: Mat = [...it.m];
      m[4] += x0 + (L - (lab.inkR - lab.inkL)) / 2 - lab.inkL;
      m[5] += y + drift(m[4]) - 0.75 * xs;
      page!.glyphs.push({ g: it.g, m });
    }
    if (rec) rec.text += ` ${ch}`;
    else page!.lines.push(rec = { text: ch });
    lineX = x1 + Math.max(0.6 * xh, ((s.wordGap ?? DEFAULT_WORD_GAP) - 0.15 * h) * xs * (1 + gauss() * 0.1 * sig));
  }

  /**
   * Structural formula inside the line (reactions: "[[Ethanol]] + 3 [[Sauerstoff]] → …"): bonds as pen strokes,
   * atom letters in the writer's hand, centred on the x-height. A tall molecule pushes the line down and keeps the
   * next line away.
   */
  function molGeom(mol: Molecule) {
    const xs = mol.atoms.map((a) => a.x), minX = Math.min(...xs), maxX = Math.max(...xs);
    const full = mol.atoms.some((a) => a.element === 'H'); // every H written: needs longer bonds to fit the letters
    const B = Math.min((full ? 3.2 : 2.6) * xh, (s.pageW - 2 * s.margin - 2 * xh) / Math.max(1, maxX - minX)); // bond length (mm)
    // how far each label sticks out left/right of its atom ("HO" runs left, "OH" right; capitals ~1.1 xh wide)
    const ext = mol.atoms.map((a) => {
      const w = 1.1 * xh * [...a.label].length, half = Math.min(0.4 * xh, w / 2);
      if (!a.label) return [0, 0];
      return a.label.length > a.element.length && a.dir === 'left' ? [w - half, half] : a.label.length > a.element.length && a.dir === 'right' ? [half, w - half] : [w / 2, w / 2];
    });
    const left = Math.min(...mol.atoms.map((a, i) => (a.x - minX) * B - ext[i][0]));
    const right = Math.max(...mol.atoms.map((a, i) => (a.x - minX) * B + ext[i][1]));
    const padL = -left;
    return { minX, B, padL, width: Math.max(xh, right - left) };
  }

  function placeMolecule(mol: Molecule, x0: number) {
    const ys = mol.atoms.map((a) => a.y);
    const { minX, B, padL } = molGeom(mol);
    // ink extent relative to the atom positions: letters reach ~0.8 xh above and ~0.7 xh below their atom
    const top = Math.min(...mol.atoms.map((a, i) => ys[i] * B - (a.label ? 0.8 * xh : 0)));
    const bot = Math.max(...mol.atoms.map((a, i) => ys[i] * B + (a.label ? 0.7 * xh : 0)));
    const room = y - s.lineH + 0.9 * xh; // below the previous line's descenders
    const up = Math.ceil((room - (y - 0.5 * xh - (bot - top) / 2)) / s.lineH);
    if (up > 0) shiftLine(up * s.lineH); // shortcut: may run past the page bottom for huge molecules, fine for school sizes
    const oy = y - 0.5 * xh - (top + bot) / 2, ox = x0 + padL - minX * B;
    lineDown = Math.max(lineDown, Math.ceil((oy + bot - (y + s.lineH - 1.6 * xh)) / s.lineH));
    const P = mol.atoms.map((a) => [ox + a.x * B, oy + a.y * B] as const);
    for (const b of mol.bonds) {
      let [x0, y0] = P[b.a], [x1, y1] = P[b.b];
      const len = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      // bonds stop at an oval around each letter (capitals are taller than wide)
      const gap = (i: number) => (mol.atoms[i].label ? xh / Math.hypot(ux / 0.65, uy / 1.05) : 0);
      x0 += ux * gap(b.a); y0 += uy * gap(b.a); x1 -= ux * gap(b.b); y1 -= uy * gap(b.b);
      const d = 0.13 * B, nx = -uy * d, ny = ux * d;
      if (b.order === 2 && b.inner) {
        // ring double bond: the second line sits inside the ring and is a bit shorter
        const cx = ox + b.inner.x * B, cy = oy + b.inner.y * B, side = Math.sign(nx * (cx - x0) + ny * (cy - y0)) || 1;
        stroke(x0, y0, x1, y1);
        stroke(x0 + ux * 0.15 * len + side * nx * 1.4, y0 + uy * 0.15 * len + side * ny * 1.4, x1 - ux * 0.15 * len + side * nx * 1.4, y1 - uy * 0.15 * len + side * ny * 1.4);
      } else if (b.order === 2) {
        stroke(x0 + nx, y0 + ny, x1 + nx, y1 + ny); stroke(x0 - nx, y0 - ny, x1 - nx, y1 - ny);
      } else if (b.order === 3) {
        stroke(x0, y0, x1, y1);
        stroke(x0 + nx * 1.4, y0 + ny * 1.4, x1 + nx * 1.4, y1 + ny * 1.4); stroke(x0 - nx * 1.4, y0 - ny * 1.4, x1 - nx * 1.4, y1 - ny * 1.4);
      } else stroke(x0, y0, x1, y1);
    }
    for (const r of mol.rings) {
      // aromatic ring: a circle in four pieces, like drawn in one go
      const cx = ox + r.x * B, cy = oy + r.y * B, R = r.r * B * (1 + gauss() * 0.04), k = 0.5523 * R, t0 = rand() * Math.PI * 2;
      for (let q = 0; q < 4; q++) {
        const a0 = t0 + (q * Math.PI) / 2, a1 = a0 + Math.PI / 2;
        const p0: [number, number] = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], p3: [number, number] = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
        page!.connectors.push({ p: [p0, [p0[0] - k * Math.sin(a0), p0[1] + k * Math.cos(a0)], [p3[0] + k * Math.sin(a1), p3[1] - k * Math.cos(a1)], p3], w0: penW, w1: penW });
      }
    }
    mol.atoms.forEach((a, i) => {
      if (!a.label) return;
      const wd = layoutWord(a.label);
      // the element letter sits on the atom; H's run off to the side smiles-drawer chose
      const half = Math.min(0.4 * xh, (wd.inkR - wd.inkL) / 2);
      const dx = a.dir === 'right' && a.label.length > a.element.length ? P[i][0] - half - wd.inkL
        : a.dir === 'left' && a.label.length > a.element.length ? P[i][0] + half - wd.inkR
        : P[i][0] - (wd.inkL + wd.inkR) / 2;
      const dy = P[i][1] + 0.65 * xh; // capitals are about 1.3 x-heights tall: their middle on the atom
      for (const it of wd.items) { const m: Mat = [...it.m]; m[4] += dx; m[5] += dy; page!.glyphs.push({ g: it.g, m }); }
      for (const ms of wd.missing) page!.missing.push({ ...ms, x: ms.x + dx, y: ms.y + dy });
      // free electron pairs: a short dash just outside the letter, across the direction it points to
      for (const t of a.lone ?? []) {
        const c = Math.cos(t), sn = Math.sin(t), r = xh / Math.hypot(c / 0.75, sn / 1.15), l = 0.32 * xh;
        const mx = P[i][0] + c * r, my = P[i][1] - 0.1 * xh + sn * r;
        stroke(mx - sn * l, my + c * l, mx + sn * l, my - c * l);
      }
    });
  }

  /** A word wider than a whole line (a long compound, a link) is broken with a hyphen, like by hand. */
  const maxW = () => 0.85 * (colR - colL); // room to spare: the real pass picks other variants and joins than the measuring one
  const strip = (x: string) => x.replace(/[\u0001-\u0006\u0014-\u0018\u001b\u001c\u001f]/g, '');
  const width = (x: string) => { const d = layoutWord(strip(x)); return d.inkR - d.inkL; };
  const fit = (tok: string): string[] => {
    if (tok.startsWith(STRUCT[0]) || tok.includes('\u001c') || tok.includes('\u0011') || tok.includes(ROOT[0]) || strip(tok).length < 20 * (colR - colL) / (s.pageW - 2 * s.margin) || width(tok) <= maxW()) return [tok];
    let lo = 1, hi = tok.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (width(tok.slice(0, mid) + '-') <= maxW()) lo = mid; else hi = mid - 1; }
    return [tok.slice(0, lo) + '-', ...fit(tok.slice(lo))];
  };

  // Mind map (mindmap.ts plans it, this writes it): texts on line rows, the topic boxed, pen strokes out to the branches.
  const plans = new Map<string, MapPlan | null>();
  const wordGapMm = (size: number) => Math.max(0.6 * xh, (s.wordGap ?? DEFAULT_WORD_GAP) * xh * size);
  const wordW = (w: string, size: number) => { const d = layoutWord(flatFrac(strip(w)), size); return d.inkR - d.inkL; };
  const words = (text: string) => text.split(' ').filter(Boolean);
  // a little generous: the real pass picks other letters and joins than the measuring one
  const measure = (text: string, size: number) => 1.08 * (words(text).reduce((a, w) => a + wordW(w, size), 0) + 1.1 * Math.max(0, words(text).length - 1) * wordGapMm(size));
  const planOpts = () => ({ width: s.pageW - 2 * s.margin, xh, lineH: s.lineH, maxRows: Math.floor((s.pageH - 2 * s.margin) / s.lineH) - 2, wordGap: s.wordGap ?? DEFAULT_WORD_GAP, measure });
  const mapPlan = (token: string): MapPlan | null => {
    if (plans.has(token)) return plans.get(token)!;
    const t = decodeMap(token);
    const plan = t && planMindmap(t, planOpts());
    plans.set(token, plan);
    return plan;
  };
  const diaPlans = new Map<string, DiagramPlan | null>();
  const diaPlan = (token: string): DiagramPlan | null => {
    if (!diaPlans.has(token)) { const d = decodeDiagram(token); diaPlans.set(token, d && planDiagram(d, planOpts())); }
    return diaPlans.get(token)!;
  };
  /** Lines of the text, a mind map or diagram that does not fit on a page as an indented list (a line of arrows) instead. */
  const expandMaps = (src: string) => src.split('\n').flatMap((line) => {
    if (line.startsWith(DIAGRAM[0])) {
      const d = decodeDiagram(line);
      return d && !diaPlan(line) ? diagramAsLines(d, HEAD, EMPH, INDENT) : d ? [line] : [];
    }
    if (!line.startsWith(MAP[0])) return [line];
    const t = decodeMap(line);
    return t && !mapPlan(line) ? mapAsList(t, HEAD, EMPH, INDENT) : t ? [line] : [];
  });
  /** Not enough room below on this page for `rows` lines: start on the next one (unless we are at the top already). */
  const roomFor = (rows: number) => { if (y + rows * s.lineH > s.pageH - s.margin && y > s.margin + 1.5 * s.lineH) { lineDown = 0; y = s.pageH; newLine(); } };
  /** Texts of a mind map or diagram, each on its line row; X is the left edge, Y(row) a row's baseline. */
  function writeTexts(texts: MapText[], X: number, Y: (row: number) => number) {
    for (const t of texts) {
      const wds = t.text.split(' ').filter(Boolean).map((w) => layoutWord(flatFrac(strip(w)), t.size));
      const gaps = wds.map(() => wordGapMm(t.size) * (1 + gauss() * 0.1 * sig));
      // a text in a box sits in its middle by the letters really written (they come out wider or narrower than measured)
      const width = wds.reduce((a, wd, i) => a + wd.inkR - wd.inkL + (i ? gaps[i - 1] : 0), 0);
      let x = X + (t.centre === undefined ? t.x : t.centre - width / 2);
      for (const [i, wd] of wds.entries()) {
        const ox = x - wd.inkL, yb = Y(t.row);
        let prevM: Mat | null = null;
        for (const it of wd.items) {
          const m: Mat = [...it.m];
          m[4] += ox; m[5] += yb;
          if (it.join && prevM && it.from && it.to && s.bridges !== false) page!.connectors.push(makeConnector(tf(prevM, it.from.x, it.from.y), dir(prevM, it.from), tf(m, it.to.x, it.to.y), dir(m, it.to), it.from.w * scaleOf(prevM), it.to.w * scaleOf(m), xh));
          page!.glyphs.push({ g: it.g, m });
          prevM = m;
        }
        for (const ms of wd.missing) page!.missing.push({ ...ms, x: ms.x + ox, y: ms.y + yb });
        x = ox + wd.inkR + gaps[i];
      }
    }
  }
  /** A box around text rows, four strokes that overshoot the corners a little (diagram.ts boxTop/boxBottom know its size). */
  function drawBox(box: MapPlan['box'], X: number, Y: (row: number) => number) {
    const k = box.size, o = 0.15 * xh;
    let l = X + box.x0, r = X + box.x1;
    let top = Y(box.row0) - 2.1 * xh * k, bot = Y(box.row1) + BOX_DOWN * xh * k;
    // tall ascenders, deep descenders or a line written wider than measured: the box grows around the ink, never through it
    for (const p of page!.glyphs) {
      const [gt, gb] = inkY(p.g, p.m), [gl, gr] = inkX(p.g, p.m), cx = (gl + gr) / 2, cy = (gt + gb) / 2;
      if (cx > l && cx < r && cy > top && cy < bot) { top = Math.min(top, gt - 0.3 * xh); bot = Math.max(bot, gb + 0.25 * xh); l = Math.min(l, gl - 0.3 * xh); r = Math.max(r, gr + 0.3 * xh); }
    }
    pulled(l - o, top, r + o, top, FINE); pulled(r, top - o, r, bot + o, FINE); pulled(r + o, bot, l - o, bot, FINE); pulled(l, bot + o, l, top - o, FINE);
  }
  /** An arrow head at (bx, by) for a shaft running in direction (ux, uy): two barbs leaning back from the tip. */
  function barbs(bx: number, by: number, ux: number, uy: number) {
    for (const k of [-1, 1]) {
      const ang = 0.45 + gauss() * 0.05, hl = 0.7 * xh * (0.85 + 0.3 * rand()), c = Math.cos(ang), sn = Math.sin(ang);
      pulled(bx - hl * (ux * c - k * uy * sn), by - hl * (k * ux * sn + uy * c), bx, by, FINE);
    }
  }
  function placeMap(p: MapPlan) {
    roomFor(p.rows);
    const X = s.margin, Y = (row: number) => y + row * s.lineH;
    writeTexts(p.texts, X, Y);
    for (const u of p.underlines) underline(u.x0 + X, u.x1 + X, () => Y(u.row));
    drawBox(p.box, X, Y);
    for (const [x0, r0, x1, r1] of p.links) pulled(X + x0, Y(r0) - 0.5 * xh, X + x1, Y(r1) - 0.55 * xh, FREE, { into: true });
    page!.lines.push({ text: p.texts.map((t) => t.text).join(' / ') });
    lineDown = Math.max(lineDown, p.rows); // the next line starts below the map
  }
  // Diagram (diagram.ts plans it): boxed texts on line rows, arrows and lines between them as pen strokes.
  function placeDiagram(p: DiagramPlan) {
    roomFor(p.rows);
    const X = s.margin, Y = (row: number) => y + row * s.lineH;
    writeTexts(p.texts, X, Y);
    for (const b of p.boxes) drawBox(b, X, Y);
    for (const k of p.strokes) {
      const e = pulled(X + k.x0, Y(k.y0), X + k.x1, Y(k.y1), LINE, { into: true }); // never into the box it points at
      if (k.head) barbs(e.x, e.y, e.ux, e.uy);
    }
    page!.lines.push({ text: p.texts.map((t) => t.text).join(' / ') });
    lineDown = Math.max(lineDown, p.rows);
  }

  // Function graph (plot.ts plans it, this draws it): axes, ticks and curves as pen strokes, numbers in the writer's own digits.
  function placePlot(p: PlotPlan) {
    const top = () => y - s.lineH + 0.6 * xh; // just below the previous line's descenders
    if (top() + p.height > s.pageH - s.margin && y > s.margin + 1.5 * s.lineH) { lineDown = 0; y = s.pageH; newLine(); }
    const X = s.margin + Math.max(0, (s.pageW - 2 * s.margin - p.width) / 2), Y = top();
    for (const [a, b] of p.axes) {
      const e = pulled(X + a[0], Y + a[1], X + b[0], Y + b[1], LINE);
      barbs(e.x, e.y, e.ux, e.uy);
    }
    for (const [a, b] of p.ticks) pulled(X + a[0], Y + a[1], X + b[0], Y + b[1], FINE);
    for (const c of p.curves) {
      // a hand does not follow the curve exactly: the pen wanders a little around it
      let wob = 0;
      const q = c.map(([px, py], i): [number, number] => { wob = 0.7 * wob + gauss() * 0.035 * xh; return [X + px, Y + py + (i && i < c.length - 1 ? wob : 0)]; });
      // shortcut: one pen stroke per piece between two points (the GoodNotes eraser takes the curve piece by piece); merge them into one InkStroke if that bothers
      for (let i = 0; i + 1 < q.length; i++) {
        const p0 = q[Math.max(0, i - 1)], p1 = q[i], p2 = q[i + 1], p3 = q[Math.min(q.length - 1, i + 2)];
        page!.connectors.push({ p: [p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2], w0: penW, w1: penW });
      }
    }
    for (const l of p.labels) {
      const wd = layoutWord(l.text, l.size);
      const dx = X + l.x - (l.align === 'left' ? wd.inkL : l.align === 'right' ? wd.inkR : (wd.inkL + wd.inkR) / 2), dy = Y + l.y;
      for (const it of wd.items) { const m: Mat = [...it.m]; m[4] += dx; m[5] += dy; page!.glyphs.push({ g: it.g, m }); }
      for (const ms of wd.missing) page!.missing.push({ ...ms, x: ms.x + dx, y: ms.y + dy });
    }
    page!.lines.push({ text: p.text });
    lineDown = Math.max(lineDown, p.rows - 1); // the next line starts below the graph
  }

  /** Writes one line of the text from lineX on (newLine() has put the pen there). */
  const writeLine = (line: string) => {
    if (line.startsWith(MAP[0])) { placeMap(mapPlan(line)!); return; }
    if (line.startsWith(DIAGRAM[0])) { placeDiagram(diaPlan(line)!); return; }
    const plotSpec = decodePlot(line);
    if (plotSpec !== null) {
      const ps = parsePlot(plotSpec);
      const p = ps && planPlot(ps, { width: s.pageW - 2 * s.margin, xh, lineH: s.lineH, maxRows: Math.floor((s.pageH - 2 * s.margin) / s.lineH) - 2 });
      if (p) { placePlot(p); return; }
      line = `plot: ${plotSpec}`; // not a formula the app can draw: just write it
    }
    let emph = false, marking = false, ringing = false, boxing = false;
    const indent = line.length - line.replace(new RegExp(`^${INDENT}+`), '').length; // steps of a nested list item
    lineX += indent * 2 * xh;
    hang = indent * 2 * xh;
    heading = line.startsWith(HEAD);
    const size = heading ? 1.3 : 1; // headings are written a bit bigger
    for (let token of line.split(/\s+/).filter(Boolean).flatMap(fit)) {
      if (token.startsWith(STRUCT[0]) && token.endsWith(STRUCT[1])) { // clean() puts spaces around it
        const spec = token.slice(1, -1).replace(/\u0010/g, ' '), mol = molecule(spec);
        if (mol) {
          const g = molGeom(mol);
          if (lineX > lineStart && lineX + g.width > rightEdge) wrap();
          placeMolecule(mol, lineX);
          if (rec) rec.text += ` ${spec}`;
          else page!.lines.push(rec = { text: spec });
          lineX += g.width + Math.max(0.6 * xh, (s.wordGap ?? DEFAULT_WORD_GAP) * xh);
          continue;
        }
        token = spec; // unknown name or broken SMILES: just write it
      }
      const am = ARROWS.exec(token);
      if (am) { drawArrow(am, size); continue; }
      const word = token.replace(/[\u0001-\u0006\u0014-\u0018\u001b\u001c\u001f]/g, '');
      if (token.includes(EMPH[0])) emph = true;
      if (token.includes(MARK[0])) marking = true;
      if (token.includes(CIRC[0])) ringing = true;
      if (token.includes(BOX[0])) boxing = true;
      const close = () => {
        if (token.includes(EMPH[1])) { closeUnderline(); emph = false; }
        if (token.includes(MARK[1])) { closeMark(); marking = false; }
        if (token.includes(CIRC[1]) || token.includes(BOX[1])) { closeRing(); ringing = boxing = false; }
      };
      // a ring or box needs room on both sides, or it runs into the neighbouring words
      const roomAfter = token.includes(CIRC[1]) || token.includes(BOX[1]) ? 0.5 * xh : 0;
      if (!word) { close(); lineX += roomAfter; continue; }
      if ((token.includes(CIRC[0]) || token.includes(BOX[0])) && lineX > lineStart) lineX += 0.5 * xh;
      const first = lineX === lineStart + hang;
      // no two bullets look alike (a bit bigger or smaller, higher or lower), but they stand in one column: the line's wandering
      // left edge does not move them, only a hair of their own
      const bullet = first && /^(?:[•\-–*]|\d{1,2}[.)])$/.test(word);
      if (bullet) lineX = colL + 0.6 + (rand() - 0.5) * 0.3;
      const fr = /^\u0011([^\u0012]*)\u0012([^\u0013]*)\u0013([^\u0011]*)$/.exec(word);
      const wd = word.includes(ROOT[0]) ? layoutRun(word, size) : fr ? layoutFrac(fr[1], fr[2], fr[3], size) : layoutWord(flatFrac(word), bullet ? size * (0.85 + 0.3 * rand()) : size);
      const lift = bullet ? (rand() - 0.5) * 0.2 * xh : 0;
      // lineX is where the next word's ink starts
      if (lineX > lineStart && lineX - wd.inkL + wd.inkR > rightEdge) wrap();
      const ox = lineX - wd.inkL;
      const plain = flatFrac(word).replace(/\u0010/g, ' ');
      if (rec) rec.text += ` ${plain}`;
      else page!.lines.push(rec = { text: plain });
      for (const b of wd.bars) pulled(ox + b.x0, y + drift(ox + b.x0) + b.y0, ox + b.x1, y + drift(ox + b.x1) + b.y1, FINE); // fraction bars
      let prevM: Mat | null = null, prevG: GlyphMeta | null = null;
      for (const it of wd.items) {
        const m: Mat = [...it.m];
        m[4] += ox;
        m[5] += y + drift(m[4]) + lift;
        if (it.join && prevM && prevG && it.from && it.to && s.bridges !== false) {
          page!.connectors.push(makeConnector(
            tf(prevM, it.from.x, it.from.y), dir(prevM, it.from),
            tf(m, it.to.x, it.to.y), dir(m, it.to),
            it.from.w * scaleOf(prevM), it.to.w * scaleOf(m), xh,
          ));
        }
        page!.glyphs.push({ g: it.g, m });
        prevM = m; prevG = it.g;
      }
      for (const ms of wd.missing) page!.missing.push({ ...ms, x: ms.x + ox, y: ms.y + y + drift(ms.x + ox) });
      if (emph) under = { x0: under?.x0 ?? ox + wd.inkL, x1: ox + wd.inkR };
      if (marking) {
        // the highlighter runs from the first to the last letter: a comma, full stop or bracket at the edge stays plain
        let l = Infinity, r = -Infinity;
        if (!wd.missing.length) for (const it of wd.items) if (!/^[.,;:!?()"„“”»«]+$/.test(it.g.key)) { const [a, b] = inkX(it.g, it.m); l = Math.min(l, a); r = Math.max(r, b); }
        if (l > r) { l = wd.inkL; r = wd.inkR; }
        mark = { x0: mark?.x0 ?? ox + l, x1: ox + r };
      }
      if (ringing || boxing) {
        let top = ring?.top ?? Infinity, bot = ring?.bot ?? -Infinity;
        for (const p of wd.items.length ? page!.glyphs.slice(-wd.items.length) : []) { const [a, b] = inkY(p.g, p.m); top = Math.min(top, a); bot = Math.max(bot, b); }
        ring = { box: boxing, x0: ring?.x0 ?? ox + wd.inkL, x1: ox + wd.inkR, top, bot };
      }
      close();
      // people leave a bit more room after a full stop, and some after a comma: its ink is low and small, the next word would look glued on
      const sentenceEnd = /[.!?]["“”»)]*$/u.test(word) ? 0.3 * xh : /[,;:]["“”»)]*$/u.test(word) ? 0.2 * xh : 0;
      lineX = ox + wd.inkR + sentenceEnd + roomAfter +Math.max(0.6 * xh, ((s.wordGap ?? DEFAULT_WORD_GAP) - 0.15 * h) * xh * size * (1 + gauss() * 0.1 * sig));
      // a list item's wrapped lines start under its text, not under the bullet
      if (bullet) hang = lineX - lineStart;
    }
  };

  // Flash cards and note boxes (cards.ts marks their lines): the lines are written into columns inside a ruled frame.
  // A block is never split over two pages: one that does not fit moves to the next page as a whole.
  // One taller than a whole page is written as plain lines instead.
  /** split: where the first of two columns ends (share of the width). Without a frame (Cornell rows) the block tiles with the next one; returns its extent then, null if it became plain lines. */
  function placeBlock(cols: string[][], gap: boolean, split = 0.5, frame = true) {
    const L = s.lineH, l = s.margin, r = s.pageW - s.margin, pad = 1.2 * xh, xs = cols.length > 1 ? [l, l + split * (r - l), r] : [l, r];
    const yStart = y;
    if (gap && y > s.margin + L) y += L; // a free line between the text above and the frame
    let y0 = y, end = y0 + (frame && cols.length > 1 ? L : 0); // a card is at least two lines tall
    const P = page!, at = { g: P.glyphs.length, c: P.connectors.length, m: P.missing.length, l: P.lines.length, k: P.marks.length };
    inBlock = true;
    cols.forEach((lines, c) => {
      colL = xs[c] + (frame || c ? pad : 0); colR = xs[c + 1] - (frame || c < cols.length - 1 ? pad : 0); y = y0 - L; lineDown = 0;
      for (const line of lines) { newLine(); writeLine(line); }
      closeUnderline(); closeMark(); closeRing(); accentLine();
      end = Math.max(end, y + lineDown * L);
    });
    inBlock = false; colL = l; colR = r; heading = false;
    if (end - y0 > s.pageH - 2 * s.margin - 2 * L) {
      P.glyphs.length = at.g; P.connectors.length = at.c; P.missing.length = at.m; P.lines.length = at.l; P.marks.length = at.k;
      y = yStart - L; lineDown = 0;
      for (const line of cols.flat()) { newLine(); writeLine(line); }
      return null;
    }
    if (end > s.pageH - s.margin && y0 > s.margin + L + 0.01) {
      const g = P.glyphs.splice(at.g), c = P.connectors.splice(at.c), m = P.missing.splice(at.m), ln = P.lines.splice(at.l), k = P.marks.splice(at.k);
      newPage();
      const dy = y - y0;
      for (const x of g) x.m[5] += dy;
      for (const x of c) for (const q of x.p) q[1] += dy;
      for (const x of m) x.y += dy;
      for (const x of k) { x.y0 += dy; x.y1 += dy; }
      page!.glyphs.push(...g); page!.connectors.push(...c); page!.missing.push(...m); page!.lines.push(...ln); page!.marks.push(...k);
      y0 += dy; end += dy;
    }
    y = end; rec = null;
    from = { g: page!.glyphs.length, c: page!.connectors.length, m: page!.missing.length, k: page!.marks.length };
    if (!frame) { lineDown = 0; return { x: xs[1], top: y0 - 0.75 * L, bot: end + 0.25 * L }; }
    const top = y0 - Math.max(0.8 * L, 2.1 * xh), bot = end + 0.45 * L;
    rule(l, top, r, top); rule(r, top, r, bot); rule(r, bot, l, bot); rule(l, bot, l, top);
    if (cols.length > 1) rule(xs[1], top, xs[1], bot); // the fold line of a card
    lineDown = 1; // the next line keeps a line's distance from the frame
    return null;
  }

  const lines = expandMaps(text);
  newLine(true);
  for (let i = 0, afterBlock = false; i < lines.length; i++) {
    const line = lines[i], kind = line.at(-1), body = (x: string) => x.slice(0, -1).trimEnd();
    if (afterBlock && !line) { afterBlock = false; continue; } // the frame already keeps its distance
    const gap = i > 0 && !afterBlock && !!lines[i - 1];
    if (i > 0) newLine();
    /** The following lines that end with k (an empty line between them does not end the block). */
    const take = (k: string) => {
      const out: string[] = [];
      for (; lines[i]?.endsWith(k) || (out.length && lines[i] === '' && lines[i + 1]?.endsWith(k)); i++) if (lines[i]) out.push(body(lines[i]));
      i--;
      return out;
    };
    afterBlock = kind === CARD[0] || kind === NOTE;
    if (kind === CARD[0]) { i++; placeBlock([[body(line)], take(CARD[1])], gap); }
    else if (kind === NOTE) placeBlock([take(NOTE)], gap);
    else if (kind === CORNELL[0] || kind === CORNELL[1]) {
      // Cornell notes: rows of cue | notes, one pen line between the columns on every page, the summary below a line across
      let seg = null as { x: number; top: number; bot: number; on: Page } | null;
      const close = () => { if (seg) rule(seg.x, seg.top, seg.x, seg.bot, seg.on); seg = null; };
      for (let first = true; ; first = false) {
        const cue = lines[i].endsWith(CORNELL[0]) ? [body(lines[i++])] : [];
        const b = placeBlock([cue, take(CORNELL[1])], first && gap, 0.3, false);
        if (!b || seg?.on !== page!) close();
        if (b) seg = { x: b.x, top: seg?.top ?? b.top, bot: b.bot, on: page! };
        if (!lines[i + 1]?.endsWith(CORNELL[0]) && !lines[i + 1]?.endsWith(CORNELL[1])) break;
        i++; newLine();
      }
      if (lines[i + 1]?.endsWith(CORNELL[2])) {
        i++; newLine(); newLine();
        const b = placeBlock([take(CORNELL[2])], false, 1, false);
        if (b) { rule(s.margin, b.top, s.pageW - s.margin, b.top); if (seg?.on === page!) seg.bot = b.top; }
      }
      close();
    }
    else writeLine(kind === CARD[1] || kind === CORNELL[2] ? body(line) : line); // an answer that lost its question is just text
  }
  closeUnderline(); closeMark(); closeRing(); accentLine();
  return { pages, missing: missingSet };
}
