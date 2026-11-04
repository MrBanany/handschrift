import type { GlyphMeta } from '../glyphstore/types';

export type Library = Map<string, GlyphMeta[]>;
type Pt = [number, number];

const isLetter = (c: string) => /\p{L}/u.test(c);
const isUpper = (c: string) => isLetter(c) && c === c.toUpperCase() && c !== c.toLowerCase();

/**
 * Probability that the writer joins letter a to letter b, learned from the pair samples:
 * exact pair -> average of "a joins onwards" and "b is joined into" -> overall rate.
 */
export function connectionModel(lib: Library) {
  const pair = new Map<string, [number, number]>(), first = new Map<string, [number, number]>(), second = new Map<string, [number, number]>();
  let gc = 0, gn = 0;
  const add = (m: Map<string, [number, number]>, k: string, c: number) => {
    const s = m.get(k) ?? [0, 0];
    s[0] += c; s[1]++; m.set(k, s);
  };
  for (const [key, vs] of lib) {
    if ([...key].length !== 2 || ![...key].every(isLetter)) continue;
    for (const v of vs) {
      if (v.connected === undefined) continue;
      const c = v.connected ? 1 : 0;
      add(pair, key, c); add(first, key[0], c); add(second, key[1], c);
      gc += c; gn++;
    }
  }
  const rate = (s?: [number, number]) => (s && s[1] ? s[0] / s[1] : undefined);
  const global = gn ? gc / gn : 0.6;

  return (a: string, b: string): number => {
    if (!isLetter(a) || !isLetter(b)) return 0;
    const exact = rate(pair.get(a + b));
    if (exact !== undefined) return exact;
    const parts = [rate(first.get(a.toLowerCase())), rate(second.get(b))].filter((x): x is number => x !== undefined);
    let p = parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : global;
    // shortcut: capitals have no pair samples; assume they are joined less often. Add capital pairs to the template if this feels wrong.
    if (isUpper(a)) p *= 0.4;
    if (isUpper(b)) p *= 0.3;
    return p;
  };
}

export interface Connector { p: [Pt, Pt, Pt, Pt]; w0: number; w1: number }

/**
 * Cubic Bézier from an exit stroke into the next entry stroke, tangent-continuous on both
 * ends so the pen path flows through without a kink.
 */
export function makeConnector(p0: Pt, d0: Pt, p3: Pt, d3: Pt, w0: number, w1: number, xh: number): Connector {
  const dist = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
  const k = Math.min(0.8 * xh, Math.max(0.12 * xh, 0.42 * dist));
  return {
    p: [p0, [p0[0] + d0[0] * k, p0[1] + d0[1] * k], [p3[0] - d3[0] * k, p3[1] - d3[1] * k], p3],
    w0, w1,
  };
}

/** Points along the connector with their stroke radius; the middle runs a little thinner, like a fast pen. */
export function sampleConnector(c: Connector, step: number): { x: number; y: number; r: number }[] {
  const [a, b, d, e] = c.p;
  const approx = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(d[0] - b[0], d[1] - b[1]) + Math.hypot(e[0] - d[0], e[1] - d[1]);
  const n = Math.max(2, Math.ceil(approx / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * d[0] + t * t * t * e[0];
    const y = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * d[1] + t * t * t * e[1];
    const w = (c.w0 * u + c.w1 * t) * (1 - 0.18 * Math.sin(Math.PI * t));
    out.push({ x, y, r: w / 2 });
  }
  return out;
}
