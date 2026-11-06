import { connectionModel, makeConnector, type Connector, type Library } from '../connectors/connect';
import type { Anchor, GlyphMeta } from '../glyphstore/types';
import { MM, XH } from '../template/layout';
import { CIRC, EMPH, HEAD, MARK, STRUCT } from './clean';
import { BOX, flatFrac } from './latex';
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
function inkX(g: GlyphMeta, m: Mat): [number, number] {
  let l = Infinity, r = -Infinity;
  BANDS.forEach((b, i) => {
    const y = g.baseline + b, L = g.prof?.l[i], R = g.prof?.r[i];
    if (L != null) l = Math.min(l, m[0] * L + m[2] * y + m[4]);
    if (R != null) r = Math.max(r, m[0] * R + m[2] * y + m[4]);
  });
  if (l > r) { const xs = [[0, 0], [g.w, 0], [0, g.h], [g.w, g.h]].map(([x, y]) => tf(m, x, y)[0]); return [Math.min(...xs), Math.max(...xs)]; }
  return [l, r];
}

/** Split a word into the largest available samples: whole word > word part (up to 5 letters, e.g. "keit") > pair > single letter. */
export function segment(word: string, lib: Library): string[] {
  const out: string[] = [];
  for (const run of word.match(/\p{L}+|[^\p{L}]/gu) ?? []) {
    const chars = [...run];
    if (chars.length > 1 && lib.has(run)) { out.push(run); continue; }
    for (let i = 0; i < chars.length;) {
      const len = [5, 4, 3, 2].find((n) => i + n <= chars.length && lib.has(chars.slice(i, i + n).join('')));
      if (len) { out.push(chars.slice(i, i + len).join('')); i += len; }
      else out.push(chars[i++]);
    }
  }
  return out;
}

interface WordItem { g: GlyphMeta; m: Mat; join: boolean; from?: Anchor; to?: Anchor }
/** Fraction bar from x0 to x1 at height y (mm, relative to the word's baseline). */
interface Bar { x0: number; x1: number; y: number }

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

export function layout(text: string, lib: Library, s: Settings): { pages: Page[]; missing: Set<string> } {
  const rand = mulberry32(s.seed);
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

    for (const key of segment(word, lib)) {
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
      const join = !!(letters && exitA && entryA && (s.cursive || rand() < Math.min(1, pConnect(prev!.last, first) * (1 + 0.25 * h))));
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
        const punct = !/\p{L}|\p{N}/u.test(first);
        const gap = prev ? Math.max(0.04 * xh, (0.16 - 0.06 * h) * xh * (punct ? 0.6 : 1) * (1 + gauss() * 0.25 * sig)) : 0;
        const tuck = prev ? opticalShift(prev.g, prev.m, g, base) : null;
        const own = prev && s.letterGap != null ? Math.max(0.03 * xh, s.letterGap * (1 - 0.3 * h) * xh * (punct ? 0.6 : 1) * (1 + gauss() * 0.2 * sig)) : gap;
        tx = tuck === null ? cursor + gap - left : Math.max(tuck + own, cursor - left - 0.6 * xh);
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
    for (const b of w.bars) into.bars.push({ x0: b.x0 + dx, x1: b.x1 + dx, y: b.y + dy });
    into.inkL = Math.min(into.inkL, w.inkL + dx); into.inkR = Math.max(into.inkR, w.inkR + dx);
  };
  const empty = (): Laid => ({ items: [], missing: [], inkL: Infinity, inkR: -Infinity, bars: [] });

  /** Several words (separated by \u0010) on one baseline, a bit closer than normal words. */
  function layoutRun(text: string, size: number): Laid {
    const out = empty();
    let x = 0;
    for (const w of text.split('\u0010').filter(Boolean)) {
      const wd = layoutWord(w, size);
      put(out, wd, x - wd.inkL, 0);
      x = out.inkR + 0.5 * xh * size;
    }
    if (!Number.isFinite(out.inkL)) { out.inkL = 0; out.inkR = 0; }
    return out;
  }

  /** Numerator over denominator, smaller, centred over a pen-stroke fraction bar at mid x-height; `tail` (",") follows. */
  function layoutFrac(num: string, den: string, tail: string, size: number): Laid {
    const f = 0.8 * size, n = layoutRun(num, f), d = layoutRun(den, f);
    const over = 0.15 * xh, W = Math.max(n.inkR - n.inkL, d.inkR - d.inkL, 0.6 * xh) + 2 * over;
    const bar = -0.45 * xh * size;
    const out = empty();
    put(out, n, (W - (n.inkR - n.inkL)) / 2 - n.inkL, bar - 0.3 * xh * size);
    put(out, d, (W - (d.inkR - d.inkL)) / 2 - d.inkL, bar + 0.3 * xh * size + 1.3 * xh * f); // digits are ~1.3 x-heights tall
    out.bars.push({ x0: 0, x1: W, y: bar });
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
  const newLine = (first = false) => {
    closeUnderline(); closeMark(); closeRing();
    if (!first) accentLine();
    rec = null;
    if (!first) y += s.lineH * (1 + Math.max(0, lineDown));
    lineDown = 0;
    if (first || y > s.pageH - s.margin) newPage();
    from = { g: page!.glyphs.length, c: page!.connectors.length, m: page!.missing.length, k: page!.marks.length };
    // Writing gets a little looser towards the end of a page, and its size wanders slowly from line to line.
    sig = sig0 * (1 + 0.35 * Math.max(0, (y - s.margin) / (s.pageH - 2 * s.margin)));
    lineSize = 0.7 * lineSize + 0.3 + gauss() * 0.012 * sig;
    // Nobody starts every line at the same spot: the left edge wanders a little; the right edge ends where the next word no longer fits, sometimes earlier.
    marginWalk = 0.6 * marginWalk + gauss() * 0.7 * sig;
    lineStart = lineX = Math.max(s.margin - 1, s.margin + 0.6 + marginWalk);
    rightEdge = s.pageW - s.margin - Math.abs(gauss()) * 2.5 * sig;
    slope = gauss() * 0.006 * sig;
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

  // Emphasised words (bold, headings) are underlined: one slightly bowed pen stroke per line, just below the baseline.
  const ws = [...lib.values()].flat().map((g) => g.strokeW).sort((a, b) => a - b);
  const penW = (ws[ws.length >> 1] ?? 5) * s0;
  let under: { x0: number; x1: number } | null = null;
  function closeUnderline() {
    if (!under) return;
    const { x0, x1 } = under, d = x1 - x0, bow = gauss() * 0.04 * xh;
    const y0 = y + drift(x0) + 0.3 * xh, y1 = y + drift(x1) + 0.3 * xh + gauss() * 0.04 * xh;
    page!.connectors.push({ p: [[x0, y0], [x0 + d / 3, y0 + (y1 - y0) / 3 + bow], [x0 + (2 * d) / 3, y0 + (2 * (y1 - y0)) / 3 + bow], [x1, y1]], w0: penW, w1: penW });
    under = null;
  }
  // Circled ((text)) or boxed (\boxed{…}) words: drawn by hand around this line's piece of them.
  let ring: { box: boolean; x0: number; x1: number } | null = null;
  function closeRing() {
    if (!ring) return;
    const { box, x0, x1 } = ring;
    ring = null;
    if (box) {
      const l = x0 - 0.35 * xh, r = x1 + 0.35 * xh, o = 0.15 * xh; // corners overshoot a little, like a quick box
      const top = (x: number) => y + drift(x) - 1.75 * xh, bot = (x: number) => y + drift(x) + 0.7 * xh;
      stroke(l - o, top(l), r + o, top(r));
      stroke(r, top(r) - o, r, bot(r) + o);
      stroke(r + o, bot(r), l - o, bot(l));
      stroke(l, bot(l) + o, l, top(l) - o);
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

  /** A slightly bowed, wobbly pen stroke from (x0, y0) to (x1, y1) in mm. */
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    const j = () => gauss() * 0.03 * xh;
    x0 += j(); y0 += j(); x1 += j(); y1 += j();
    const dx = x1 - x0, dy = y1 - y0, bow = gauss() * 0.025;
    const nx = -dy * bow, ny = dx * bow;
    page!.connectors.push({ p: [[x0, y0], [x0 + dx / 3 + nx, y0 + dy / 3 + ny], [x0 + (2 * dx) / 3 + nx, y0 + (2 * dy) / 3 + ny], [x1, y1]], w0: penW, w1: penW });
  };

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

  newLine(true);
  text.split('\n').forEach((line, li) => {
    if (li > 0) newLine();
    let emph = false, marking = false, ringing = false, boxing = false;
    hang = 0;
    heading = line.startsWith(HEAD);
    const size = heading ? 1.3 : 1; // headings are written a bit bigger
    for (let token of line.split(/\s+/).filter(Boolean)) {
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
      const word = token.replace(/[\u0002-\u0006\u0014-\u0017]/g, '');
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
      const fr = /^\u0011([^\u0012]*)\u0012([^\u0013]*)\u0013([^\u0011]*)$/.exec(word);
      const wd = fr ? layoutFrac(fr[1], fr[2], fr[3], size) : layoutWord(flatFrac(word), size);
      // lineX is where the next word's ink starts
      if (lineX > lineStart && lineX - wd.inkL + wd.inkR > rightEdge) wrap();
      const ox = lineX - wd.inkL;
      const plain = flatFrac(word).replace(/\u0010/g, ' ');
      if (rec) rec.text += ` ${plain}`;
      else page!.lines.push(rec = { text: plain });
      for (const b of wd.bars) stroke(ox + b.x0, y + drift(ox + b.x0) + b.y, ox + b.x1, y + drift(ox + b.x1) + b.y);
      let prevM: Mat | null = null, prevG: GlyphMeta | null = null;
      for (const it of wd.items) {
        const m: Mat = [...it.m];
        m[4] += ox;
        m[5] += y + drift(m[4]);
        if (it.join && prevM && prevG && it.from && it.to) {
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
      if (marking) mark = { x0: mark?.x0 ?? ox + wd.inkL, x1: ox + wd.inkR };
      if (ringing || boxing) ring = { box: boxing, x0: ring?.x0 ?? ox + wd.inkL, x1: ox + wd.inkR };
      close();
      const sentenceEnd = /[.!?]["“”»)]*$/u.test(word) ? 0.3 * xh : 0; // people leave a bit more room after a full stop
      const first = lineX === lineStart;
      lineX = ox + wd.inkR + sentenceEnd + roomAfter +Math.max(0.6 * xh, ((s.wordGap ?? DEFAULT_WORD_GAP) - 0.15 * h) * xh * size * (1 + gauss() * 0.1 * sig));
      // a list item's wrapped lines start under its text, not under the bullet
      if (first && /^(?:[•\-–*]|\d{1,2}[.)])$/.test(word)) hang = lineX - lineStart;
    }
  });
  closeUnderline(); closeMark(); closeRing(); accentLine();
  return { pages, missing: missingSet };
}
