/**
 * Hand-drawn function graphs from a pasted AI answer:
 *
 *   [[plot: x^2 - 1, -3..3]]              one function, x from -3 to 3
 *   [[plot: sin(x); cos(x), -pi..pi]]     several functions, separated by ";"
 *   [[plot: 1/x, -4..4, -5..5]]           a second range is the y range (chosen automatically otherwise)
 *
 * clean() cuts such a block out and hands it to layout() as ONE token on its own line (PLOT markers, no whitespace
 * inside); this file parses it, evaluates the formulas (no eval) and plans every stroke and label in mm.
 * Drawing is done by layout() (it owns the handwriting and the pen strokes).
 */

import { PLOT } from './markers';

export { PLOT } from './markers'; // the codes live in markers.ts
const BLOCK = /\[\[\s*plot\s*:\s*([^\]\n]+)\]\]/gi;

/** Replaces every [[plot: …]] by put(spec); put returns the text to leave in its place. */
export const extractPlots = (text: string, put: (spec: string) => string) => text.replace(BLOCK, (_, spec: string) => put(spec.trim()));
/** One whitespace-free token for the layout. */
export const encodePlot = (spec: string) => PLOT[0] + spec.replace(/\s+/g, '') + PLOT[1];
/** The spec inside a token, or null if it is not a plot token. */
export const decodePlot = (token: string) => (token.startsWith(PLOT[0]) && token.endsWith(PLOT[1]) ? token.slice(1, -1) : null);

// ---------- formulas ----------

export type Fn = (x: number) => number;
const FUNCS: Record<string, (v: number) => number> = {
  sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, abs: Math.abs, ln: Math.log, lg: Math.log10, log: Math.log10,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const NAMES = [...Object.keys(FUNCS), 'pi', 'e', 'x'].sort((a, b) => b.length - a.length); // longest first: "exp" before "e"

/** What AIs write besides the plain form: LaTeX (\frac{1}{x}, \cdot, \sin), x², π, a decimal comma, "f(x) = …". */
const normal = (src: string) => {
  let s = src.toLowerCase().replace(/\s+/g, '').replace(/\$|\\left|\\right|\\,|\\!/g, '');
  for (let i = 0; i < 4; i++) s = s.replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))');
  return s
    .replace(/\\(?:cdot|times)|[·×⋅]/g, '*').replace(/\\/g, '').replace(/[−–]/g, '-').replace(/[÷:]/g, '/')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/π/g, 'pi').replace(/√/g, 'sqrt')
    .replace(/[{[]/g, '(').replace(/[}\]]/g, ')').replace(/(\d),(?=\d)/g, '$1.')
    .replace(/^(?:[a-z]\(x\)|y)=/, '');
};

/**
 * A formula in x as a function, or null if it is not one. Recursive descent, nothing is ever executed as code:
 * + - * / ^, brackets, |x|, sin cos tan exp ln lg log sqrt abs (with brackets), pi, e, implicit products ("2x", "3(x+1)", "x sin(x)").
 */
export function compile(src: string): Fn | null {
  const s = normal(src);
  let i = 0, bars = 0;
  const eat = (c: string) => (s[i] === c ? (i++, true) : false);
  const need = (c: string) => { if (!eat(c)) throw new SyntaxError(c); };
  const name = () => NAMES.find((n) => s.startsWith(n, i));
  const startsFactor = () => i < s.length && (/[\d.(]/.test(s[i]) || (s[i] === '|' && !bars) || !!name());

  const expr = (): Fn => {
    let f = term();
    for (;;) {
      const a = f;
      if (eat('+')) { const b = term(); f = (x) => a(x) + b(x); }
      else if (eat('-')) { const b = term(); f = (x) => a(x) - b(x); }
      else return f;
    }
  };
  const term = (): Fn => {
    let f = unary();
    for (;;) {
      const a = f;
      if (eat('*')) { const b = unary(); f = (x) => a(x) * b(x); }
      else if (eat('/')) { const b = unary(); f = (x) => a(x) / b(x); }
      else if (startsFactor()) { const b = power(); f = (x) => a(x) * b(x); } // 2x, 3(x+1)
      else return f;
    }
  };
  const unary = (): Fn => {
    if (eat('-')) { const a = unary(); return (x) => -a(x); }
    if (eat('+')) return unary();
    return power();
  };
  const power = (): Fn => {
    const a = primary();
    if (!eat('^')) return a;
    const b = unary(); // right-associative, and 2^-x works
    return (x) => Math.pow(a(x), b(x));
  };
  const primary = (): Fn => {
    const num = /^(?:\d+\.?\d*|\.\d+)/.exec(s.slice(i));
    if (num) { i += num[0].length; const v = Number(num[0]); return () => v; }
    if (eat('(')) { const a = expr(); need(')'); return a; }
    if (!bars && eat('|')) { bars++; const a = expr(); need('|'); bars--; return (x) => Math.abs(a(x)); }
    const n = name();
    if (!n) throw new SyntaxError(s.slice(i));
    i += n.length;
    if (n === 'x') return (x) => x;
    if (n in CONSTS) return () => CONSTS[n];
    need('('); // sin(x), never "sin x": what the argument is would be a guess
    const a = expr(), fn = FUNCS[n];
    need(')');
    return (x) => fn(a(x));
  };

  try {
    const f = expr();
    return i === s.length && s.length ? f : null;
  } catch { return null; }
}

export interface PlotSpec { fns: string[]; x: [number, number]; y?: [number, number] }

const MAX_FNS = 4, MAX_ABS = 1e6;
const RANGE = /,([^,;]+?)\.\.([^,;]+)$/;

/** "x^2-1; 2x, -3..3" -> formulas and ranges; null if a range is not a number or upside down. Without a range x runs from -5 to 5. */
export function parsePlot(spec: string): PlotSpec | null {
  let rest = spec.replace(/\s+/g, '');
  const ranges: [number, number][] = [];
  for (let m = RANGE.exec(rest); m && ranges.length < 2; m = RANGE.exec(rest)) {
    const a = compile(m[1])?.(NaN), b = compile(m[2])?.(NaN); // "-pi..pi" is fine: a formula without x (with x it is NaN)
    if (a === undefined || b === undefined || !(a < b) || Math.abs(a) > MAX_ABS || Math.abs(b) > MAX_ABS) return null;
    ranges.unshift([a, b]);
    rest = rest.slice(0, m.index);
  }
  const fns = rest.split(';').filter(Boolean);
  if (!fns.length || fns.length > MAX_FNS) return null;
  return { fns, x: ranges[0] ?? [-5, 5], ...(ranges[1] ? { y: ranges[1] } : {}) };
}

// ---------- plan ----------

type Pt = [number, number];
export interface PlotLabel { x: number; y: number; text: string; size: number; align: 'left' | 'center' | 'right' } // y: baseline
export interface PlotPlan {
  width: number; height: number; // mm; everything below is relative to the top left corner, y down
  rows: number; // lines of the page the plot takes up
  axes: [Pt, Pt][]; // from -> to, an arrow head at "to"
  ticks: [Pt, Pt][];
  labels: PlotLabel[];
  curves: Pt[][]; // one polyline per unbroken piece of a function
  text: string; // alt text
}
export interface PlotOpts { width: number; xh: number; lineH: number; maxRows: number }

const SAMPLES = 400, LABEL = 0.65;
/** Smallest "round" step (1, 2, 5 × 10^k) that gives at most `max` steps over `span`. */
const niceStep = (span: number, max: number) => {
  const raw = span / Math.max(1, max), pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((v) => v >= raw * (1 - 1e-9))!;
};
const fmt = (v: number) => String(Number(v.toPrecision(6)) || 0).replace('.', ',');
/** Rough ink width of a tick label (mm): digits are about 0.75 x-heights wide. Only used to keep labels apart. */
export const labelWidth = (text: string, xh: number) => [...text].length * 0.75 * xh * LABEL;
/** Rough ink box of a label (mm): left, top, right, bottom. */
export const labelBox = (l: PlotLabel, xh: number): [number, number, number, number] => {
  const w = labelWidth(l.text, xh) * (l.size / LABEL), x0 = l.align === 'left' ? l.x : l.align === 'right' ? l.x - w : l.x - w / 2;
  return [x0, l.y - 1.3 * xh * l.size, x0 + w, l.y];
};

/**
 * True if f jumps between a and b (a pole, a step): halving the interval towards the bigger difference does not
 * make the difference shrink, as it would for a steep but unbroken curve.
 */
function jumps(f: Fn, a: number, b: number): boolean {
  let fa = f(a), fb = f(b);
  const d0 = Math.abs(fb - fa);
  for (let i = 0; i < 12; i++) {
    const m = (a + b) / 2, fm = f(m);
    if (!Number.isFinite(fm)) return true;
    if (Math.abs(fm - fa) > Math.abs(fb - fm)) { b = m; fb = fm; } else { a = m; fa = fm; }
  }
  return Math.abs(fb - fa) > 0.3 * d0;
}

/**
 * Where everything goes: axes through 0 (at the edge if 0 is outside the range), ticks at round numbers with their
 * labels, the curves cut at poles and jumps and clipped to the visible y range. One unit is as long on both axes when
 * that gives a sensible height, otherwise the height is limited. null if a formula cannot be read or nothing is visible.
 */
export function planPlot(spec: PlotSpec, o: PlotOpts): PlotPlan | null {
  const fns = spec.fns.map(compile);
  if (!fns.length || fns.some((f) => !f)) return null;
  const { xh } = o, [a, b] = spec.x, fs = fns as Fn[];
  const xs = Array.from({ length: SAMPLES + 1 }, (_, i) => a + ((b - a) * i) / SAMPLES);

  // y range: everything, unless a few values run away (poles): then what most of the curve needs, plus half of that again
  let lo: number, hi: number;
  if (spec.y) [lo, hi] = spec.y;
  else {
    const ys = fs.flatMap((f) => xs.map(f)).filter(Number.isFinite).sort((p, q) => p - q);
    if (!ys.length) return null;
    const q = (t: number) => ys[Math.round(t * (ys.length - 1))], spread = q(0.9) - q(0.1);
    lo = ys[0]; hi = ys.at(-1)!;
    if (hi - lo > 12 * spread) { lo = Math.max(lo, q(0.1) - 0.5 * spread); hi = Math.min(hi, q(0.9) + 0.5 * spread); }
    lo = Math.min(lo, 0); hi = Math.max(hi, 0); // the x axis is always in the picture
    if (!(hi - lo > 1e-9)) { lo -= 1; hi += 1; }
    const step = niceStep(hi - lo, 6);
    lo = Math.floor(lo / step + 1e-9) * step; hi = Math.ceil(hi / step - 1e-9) * step;
  }
  if (!(hi > lo) || Math.abs(lo) > MAX_ABS || Math.abs(hi) > MAX_ABS) return null;

  // size: room around the drawing area for the arrow tips and the labels of an axis at the edge
  const padL = 2.6 * xh, padR = 2 * xh, padT = 1.6 * xh, padB = 1.8 * xh;
  let iw = Math.min(o.width, 40 * xh) - padL - padR;
  const maxIh = Math.min(o.maxRows, 14) * o.lineH - padT - padB, minIh = Math.min(maxIh, 4 * o.lineH);
  if (iw < 8 * xh || maxIh < 3 * xh) return null;
  let ih = ((hi - lo) * iw) / (b - a); // same unit on both axes
  if (ih > maxIh && (maxIh * (b - a)) / (hi - lo) >= 0.45 * iw) { iw = (maxIh * (b - a)) / (hi - lo); ih = maxIh; } // narrower, still true to scale
  ih = Math.min(maxIh, Math.max(minIh, ih));
  const width = iw + padL + padR, rows = Math.ceil((ih + padT + padB) / o.lineH), height = ih + padT + padB;
  const X = (v: number) => padL + ((v - a) / (b - a)) * iw, Y = (v: number) => padT + ((hi - v) / (hi - lo)) * ih;

  const ax = Math.min(b, Math.max(a, 0)), ay = Math.min(hi, Math.max(lo, 0)); // where the axes cross
  const over = 0.5 * xh, tip = 1.3 * xh;
  const axes: [Pt, Pt][] = [[[X(a) - over, Y(ay)], [X(b) + tip, Y(ay)]], [[X(ax), Y(lo) + over], [X(ax), Y(hi) - tip]]];

  // nums: for every tick its number, where it normally stands first, then the places to try if a curve runs through it
  const ticks: [Pt, Pt][] = [], labels: PlotLabel[] = [], nums: PlotLabel[][] = [], t = 0.35 * xh;
  const sx = niceStep(b - a, iw / (3.4 * xh)), sy = niceStep(hi - lo, ih / (2.4 * xh));
  for (let k = Math.ceil(a / sx - 1e-9); k * sx <= b + 1e-9 * sx; k++) {
    const v = k * sx;
    if (Math.abs(v - ax) < 1e-9 * sx) continue; // no tick on the other axis
    ticks.push([[X(v), Y(ay) - t], [X(v), Y(ay) + t]]);
    const num = { text: fmt(v), size: LABEL }, below = Y(ay) + 0.55 * xh + 1.3 * xh * LABEL;
    // below the tick; else above the axis (a full x-height: the hand-drawn axis bows); else below, beside the tick (a curve crossing the axis here takes both middle places)
    nums.push([{ ...num, x: X(v), y: below, align: 'center' }, { ...num, x: X(v), y: Y(ay) - xh, align: 'center' },
      { ...num, x: X(v) + 0.3 * xh, y: below, align: 'left' }, { ...num, x: X(v) - 0.3 * xh, y: below, align: 'right' }]);
  }
  for (let k = Math.ceil(lo / sy - 1e-9); k * sy <= hi + 1e-9 * sy; k++) {
    const v = k * sy;
    if (Math.abs(v - ay) < 1e-9 * sy) continue;
    ticks.push([[X(ax) - t, Y(v)], [X(ax) + t, Y(v)]]);
    const num = { text: fmt(v), size: LABEL, y: Y(v) + 0.65 * xh * LABEL };
    nums.push([{ ...num, x: X(ax) - 0.6 * xh, align: 'right' }, { ...num, x: X(ax) + 0.6 * xh, align: 'left' }]); // left of the axis, else right of it
  }
  // axis names: "x" above the right arrow tip, "y" right of the upper one (the numbers stand below and left)
  labels.push({ x: X(b) + 0.9 * xh, y: Y(ay) - 0.5 * xh, text: 'x', size: 0.8, align: 'center' });
  labels.push({ x: X(ax) + 0.6 * xh, y: Y(hi) - 0.5 * xh, text: 'y', size: 0.8, align: 'left' });

  // curves: cut where the function is undefined or jumps, clipped a little outside the y range
  const m = (0.6 * xh * (hi - lo)) / ih, cLo = lo - m, cHi = hi + m;
  const inside = (v: number) => v >= cLo && v <= cHi;
  const curves: Pt[][] = [];
  for (const f of fs) {
    let run: Pt[] = [];
    const end = () => { if (run.length > 1) curves.push(thin(run, 2.2)); run = []; };
    /** The point where the segment p -> q crosses the clip edge nearest to the outside point `out`. */
    const cross = (p: Pt, q: Pt, out: number): Pt => { const e = out > cHi ? cHi : cLo, k = (e - p[1]) / (q[1] - p[1]); return [p[0] + k * (q[0] - p[0]), e]; };
    let prev: Pt | null = null;
    for (const x of xs) {
      const cur: Pt = [x, f(x)];
      if (!Number.isFinite(cur[1])) { end(); prev = null; continue; }
      const far = prev && Math.abs(cur[1] - prev[1]) > 0.25 * (hi - lo);
      if (prev && far && jumps(f, prev[0], cur[0])) { end(); prev = null; }
      if (!prev) { if (inside(cur[1])) run.push(cur); }
      else if (inside(prev[1]) && inside(cur[1])) run.push(cur);
      else if (inside(prev[1])) { run.push(cross(prev, cur, cur[1])); end(); }
      else if (inside(cur[1])) { run = [cross(prev, cur, prev[1]), cur]; }
      else if ((prev[1] > cHi) !== (cur[1] > cHi)) { run = [cross(prev, cur, prev[1]), cross(prev, cur, cur[1])]; end(); } // straight through the picture
      prev = cur;
    }
    end();
  }
  if (!curves.length) return null;
  /** Drops points closer than `mm` to the last kept one (first and last stay): fewer, longer pen strokes. */
  function thin(run: Pt[], mm: number): Pt[] {
    const pts = run.map(([x, y]): Pt => [X(x), Y(y)]), out = [pts[0]];
    for (const p of pts.slice(1, -1)) if (Math.hypot(p[0] - out.at(-1)![0], p[1] - out.at(-1)![1]) >= mm) out.push(p);
    out.push(pts.at(-1)!);
    return out;
  }
  // A number the curve would run through moves to its next place; if none is free it is left out (the tick stays).
  const pad = 0.25 * xh;
  const free = (l: PlotLabel) => {
    const [x0, y0, x1, y1] = labelBox(l, xh);
    if (x0 < 0 || y0 < 0 || x1 > width || y1 > height) return false;
    if (labels.some((o) => { const [a0, b0, a1, b1] = labelBox(o, xh); return x0 < a1 && a0 < x1 && y0 < b1 && b0 < y1; })) return false;
    return !curves.some((c) => c.some((q, i) => {
      if (!i) return false;
      const p0 = c[i - 1], n = Math.ceil(Math.hypot(q[0] - p0[0], q[1] - p0[1]) / pad); // walk along the piece in steps of `pad`
      for (let k = 0; k <= n; k++) {
        const px = p0[0] + ((q[0] - p0[0]) * k) / n, py = p0[1] + ((q[1] - p0[1]) * k) / n;
        if (px > x0 - pad && px < x1 + pad && py > y0 - pad && py < y1 + pad) return true;
      }
      return false;
    }));
  };
  const moved: PlotLabel[][] = [];
  for (const places of nums) { if (free(places[0])) labels.push(places[0]); else moved.push(places); } // first every number that can stay
  for (const places of moved) { const l = places.slice(1).find(free); if (l) labels.push(l); }
  return { width, height, rows, axes, ticks, labels, curves, text: `Graph: ${spec.fns.join('; ')}` };
}
