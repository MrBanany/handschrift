import { MM, XH } from '../template/layout';
import type { Variant } from './types';

type Pt = [number, number];
const X = XH * MM; // one x-height in glyph px

const ring = (cx: number, cy: number, r: number): Pt[] =>
  Array.from({ length: 13 }, (_, i): Pt => [cx + r * Math.cos((i / 12) * 2 * Math.PI), cy + r * Math.sin((i / 12) * 2 * Math.PI)]);

/**
 * Symbols that AI answers use but the template doesn't ask for, as pen strokes in x-heights from the left end of
 * the baseline (negative y = up). A stroke with a single point is a dot.
 */
const SYMBOLS: Record<string, Pt[][]> = {
  '→': [[[0, -0.5], [1.6, -0.5]], [[1.22, -0.85], [1.6, -0.5], [1.22, -0.15]]],
  '←': [[[1.6, -0.5], [0, -0.5]], [[0.38, -0.85], [0, -0.5], [0.38, -0.15]]],
  '>': [[[0.1, -0.85], [0.8, -0.45], [0.1, -0.05]]],
  '<': [[[0.8, -0.85], [0.1, -0.45], [0.8, -0.05]]],
  '+': [[[0, -0.5], [0.9, -0.5]], [[0.45, -0.95], [0.45, -0.05]]],
  '=': [[[0, -0.7], [0.9, -0.7]], [[0, -0.3], [0.9, -0.3]]],
  '×': [[[0.1, -0.85], [0.75, -0.15]], [[0.75, -0.85], [0.1, -0.15]]],
  '*': [[[0.4, -1.6], [0.4, -0.9]], [[0.1, -1.42], [0.7, -1.08]], [[0.1, -1.08], [0.7, -1.42]]],
  '✓': [[[0, -0.6], [0.4, 0], [1.3, -1.65]]],
  '°': [ring(0.3, -1.6, 0.22)],
  '•': [[[0.25, -0.5]]],
};

/** Hand-drawn variants of the symbols a set lacks, in the set's own stroke width, each one a little different. */
export function symbolVariants(have: Variant[], n = 3): Variant[] {
  const keys = new Set(have.map((v) => v.key));
  const ws = have.map((v) => v.strokeW).sort((a, b) => a - b);
  const pen = (ws.length ? ws[ws.length >> 1] : 5) / 2; // radius, px
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1; // -1..1, same symbols every time
  const out: Variant[] = [];
  for (const [key, strokes] of Object.entries(SYMBOLS)) {
    if (keys.has(key)) continue;
    const xs = strokes.flat().map((p) => p[0]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    for (let i = 0; i < n; i++) {
      const rot = rand() * 0.03, sc = 1 + rand() * 0.06;
      // Jittered points; every segment bows a little, like a quick pen stroke.
      const lines = strokes.map((s) => {
        const pts = s.map(([x, y]): Pt => [x + rand() * 0.04, y + rand() * 0.04]);
        const curve: Pt[] = [pts[0]];
        for (let k = 1; k < pts.length; k++) {
          const [ax, ay] = pts[k - 1], [bx, by] = pts[k], bow = rand() * 0.06;
          for (let t = 0.25; t <= 1; t += 0.25) {
            const b = 4 * t * (1 - t) * bow;
            curve.push([ax + (bx - ax) * t - (by - ay) * b, ay + (by - ay) * t + (bx - ax) * b]);
          }
        }
        // Tilt and size around the symbol's middle, so it stays at its height on the line.
        const cs = Math.cos(rot) * sc, sn = Math.sin(rot) * sc;
        return curve.map(([x, y]): Pt => [(cx + (x - cx) * cs - (y + 0.5) * sn) * X, (-0.5 + (x - cx) * sn + (y + 0.5) * cs) * X]);
      });
      out.push(rasterize(`sym:${key}:${i}`, key, lines, pen));
    }
  }
  return out;
}

function rasterize(src: string, key: string, lines: Pt[][], pen: number): Variant {
  const dot = Math.max(1.8 * pen, 0.14 * X), pad = Math.ceil(dot) + 2;
  const all = lines.flat();
  const x0 = Math.floor(Math.min(...all.map((p) => p[0]))) - pad, y0 = Math.floor(Math.min(...all.map((p) => p[1]))) - pad;
  const w = Math.ceil(Math.max(...all.map((p) => p[0]))) + pad - x0, h = Math.ceil(Math.max(...all.map((p) => p[1]))) + pad - y0;
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = x + x0 + 0.5, py = y + y0 + 0.5;
    let a = 0;
    for (const l of lines) {
      if (l.length === 1) { a = Math.max(a, dot + 0.5 - Math.hypot(px - l[0][0], py - l[0][1])); continue; }
      for (let k = 1; k < l.length; k++) {
        const [ax, ay] = l[k - 1], [bx, by] = l[k], dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        a = Math.max(a, pen + 0.5 - Math.hypot(px - ax - t * dx, py - ay - t * dy));
      }
    }
    alpha[y * w + x] = Math.round(Math.min(1, Math.max(0, a)) * 255);
  }
  return { src, key, w, h, baseline: -y0, entry: null, exit: null, strokeW: 2 * pen, alpha };
}
