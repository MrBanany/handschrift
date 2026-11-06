import { MM, XH } from '../template/layout';
import { SUB, SUB_LETTERS, SUP, SUP_LETTERS } from '../renderer/clean';
import type { Variant } from './types';

type Pt = [number, number];
const X = XH * MM; // one x-height in glyph px

const ring = (cx: number, cy: number, r: number): Pt[] =>
  Array.from({ length: 13 }, (_, i): Pt => [cx + r * Math.cos((i / 12) * 2 * Math.PI), cy + r * Math.sin((i / 12) * 2 * Math.PI)]);

const wave = (y: number): Pt[] => Array.from({ length: 9 }, (_, i): Pt => [i * 0.11, y - 0.09 * Math.sin((i / 4) * Math.PI)]);
const infinity = Array.from({ length: 25 }, (_, i): Pt => {
  const t = (i / 24) * 2 * Math.PI, d = 1 + Math.sin(t) ** 2;
  return [0.75 + (0.75 * Math.cos(t)) / d, -0.5 + (0.9 * Math.sin(t) * Math.cos(t)) / d];
});

/**
 * Symbols as pen strokes in x-heights from the left end of the baseline (negative y = up); a stroke with a single
 * point is a dot. They stand in for symbols the writer hasn't filled in yet, and the template draws its grey
 * trace-over shapes from them where Helvetica has no such character.
 */
export const SYMBOLS: Record<string, Pt[][]> = {
  '→': [[[0, -0.5], [1.6, -0.5]], [[1.22, -0.85], [1.6, -0.5], [1.22, -0.15]]],
  '←': [[[1.6, -0.5], [0, -0.5]], [[0.38, -0.85], [0, -0.5], [0.38, -0.15]]],
  '↑': [[[0.4, 0], [0.4, -1.5]], [[0.05, -1.15], [0.4, -1.5], [0.75, -1.15]]],
  '↓': [[[0.4, -1.5], [0.4, 0]], [[0.05, -0.35], [0.4, 0], [0.75, -0.35]]],
  '⇒': [[[0, -0.7], [1.3, -0.7]], [[0, -0.3], [1.3, -0.3]], [[1.1, -0.95], [1.6, -0.5], [1.1, -0.05]]],
  '⇔': [[[0.35, -0.7], [1.45, -0.7]], [[0.35, -0.3], [1.45, -0.3]], [[1.3, -0.95], [1.8, -0.5], [1.3, -0.05]], [[0.5, -0.95], [0, -0.5], [0.5, -0.05]]],
  '⇌': [[[0, -0.65], [1.6, -0.65], [1.25, -0.92]], [[1.6, -0.35], [0, -0.35], [0.35, -0.08]]],
  '±': [[[0, -0.62], [0.9, -0.62]], [[0.45, -1.05], [0.45, -0.2]], [[0, 0], [0.9, 0]]],
  '÷': [[[0, -0.5], [0.9, -0.5]], [[0.45, -0.88]], [[0.45, -0.12]]],
  '·': [[[0.2, -0.5]]],
  '↔': [[[0, -0.5], [1.8, -0.5]], [[1.42, -0.85], [1.8, -0.5], [1.42, -0.15]], [[0.38, -0.85], [0, -0.5], [0.38, -0.15]]],
  '>': [[[0.1, -0.85], [0.8, -0.45], [0.1, -0.05]]],
  '<': [[[0.8, -0.85], [0.1, -0.45], [0.8, -0.05]]],
  '≤': [[[0.8, -1.05], [0.1, -0.7], [0.8, -0.35]], [[0.1, -0.08], [0.8, -0.08]]],
  '≥': [[[0.1, -1.05], [0.8, -0.7], [0.1, -0.35]], [[0.1, -0.08], [0.8, -0.08]]],
  '+': [[[0, -0.5], [0.9, -0.5]], [[0.45, -0.95], [0.45, -0.05]]],
  '=': [[[0, -0.7], [0.9, -0.7]], [[0, -0.3], [0.9, -0.3]]],
  '≠': [[[0, -0.7], [0.9, -0.7]], [[0, -0.3], [0.9, -0.3]], [[0.65, -1], [0.25, 0]]],
  '≈': [wave(-0.68), wave(-0.32)],
  '~': [wave(-0.5)],
  '×': [[[0.1, -0.85], [0.75, -0.15]], [[0.75, -0.85], [0.1, -0.15]]],
  '√': [[[0, -0.55], [0.18, -0.65], [0.45, 0], [0.8, -1.5], [1.5, -1.5]]],
  'π': [[[0, -0.95], [1, -1.02]], [[0.3, -1], [0.25, 0]], [[0.72, -1.01], [0.75, -0.12], [0.88, 0]]],
  'Δ': [[[0, 0], [0.55, -1.45], [1.1, 0], [0, 0]]],
  '∞': [infinity],
  '*': [[[0.4, -1.6], [0.4, -0.9]], [[0.1, -1.42], [0.7, -1.08]], [[0.1, -1.08], [0.7, -1.42]]],
  '✓': [[[0, -0.6], [0.4, 0], [1.3, -1.65]]],
  '✗': [[[0.05, -1.4], [1.05, 0.02]], [[1, -1.45], [0.05, 0]]], // taller than an x, like ✓
  '°': [ring(0.3, -1.6, 0.22)],
  '•': [[[0.25, -0.5]]],
  '[': [[[0.55, -1.6], [0.2, -1.6], [0.2, 0.35], [0.55, 0.35]]],
  ']': [[[0.05, -1.6], [0.4, -1.6], [0.4, 0.35], [0.05, 0.35]]],
  '|': [[[0.25, -1.6], [0.25, 0.4]]],
  '_': [[[0, 0.25], [0.9, 0.25]]],
  '§': [[[0.7, -1.45], [0.4, -1.55], [0.15, -1.35], [0.3, -1.05], [0.65, -0.85], [0.7, -0.5], [0.45, -0.35]], [[0.3, -1.05], [0.1, -0.8], [0.25, -0.5], [0.6, -0.3], [0.65, 0], [0.35, 0.12], [0.05, 0]]],
  '#': [[[0.4, -1.25], [0.22, 0]], [[0.85, -1.25], [0.67, 0]], [[0.05, -0.85], [1, -0.85]], [[0, -0.4], [0.95, -0.4]]],
  '∫': [[[0.75, -1.65], [0.55, -1.75], [0.42, -1.4], [0.35, 0.25], [0.22, 0.55], [0.02, 0.45]]],
  'Σ': [[[0.95, -1.45], [0.05, -1.45], [0.6, -0.72], [0.05, 0], [0.95, 0]]],
  // Greek letters, the way they are usually handwritten at school
  'α': [[[0.95, -1], [0.72, -0.35], [0.5, -0.02], [0.2, 0], [0.02, -0.42], [0.2, -0.9], [0.5, -0.95], [0.75, -0.5], [1, 0]]],
  'β': [[[0.15, 0.6], [0.15, -1.2], [0.35, -1.55], [0.65, -1.5], [0.7, -1.15], [0.35, -0.85], [0.75, -0.65], [0.8, -0.2], [0.5, 0], [0.15, -0.1]]],
  'γ': [[[0, -0.95], [0.45, 0], [0.38, 0.6]], [[0.85, -0.95], [0.45, 0]]],
  'δ': [[[0.75, -1.45], [0.35, -1.5], [0.3, -1.2], [0.7, -0.85], [0.85, -0.4], [0.6, 0], [0.2, -0.05], [0.1, -0.45], [0.4, -0.85]]],
  'λ': [[[0.1, -1.5], [0.9, 0]], [[0.5, -0.8], [0.05, 0]]],
  'μ': [[[0.1, 0.55], [0.1, -0.95]], [[0.1, -0.4], [0.3, -0.02], [0.65, -0.1], [0.75, -0.95]], [[0.75, -0.95], [0.75, -0.15], [0.9, 0]]],
  'σ': [[[1, -0.95], [0.45, -0.95], [0.1, -0.65], [0.15, -0.1], [0.5, 0], [0.8, -0.35], [0.7, -0.85]]],
  'ω': [[[0.1, -0.9], [0.05, -0.35], [0.25, 0], [0.5, -0.3], [0.5, -0.55], [0.5, -0.3], [0.75, 0], [0.95, -0.35], [0.9, -0.9]]],
  'θ': [[[0.45, -1.5], [0.1, -1.2], [0.05, -0.4], [0.4, 0], [0.75, -0.35], [0.8, -1.15], [0.45, -1.5]], [[0.08, -0.75], [0.78, -0.75]]],
  'φ': [[[0.5, -1.4], [0.5, 0.5]], [[0.5, -0.95], [0.15, -0.8], [0.1, -0.25], [0.5, -0.05], [0.9, -0.25], [0.88, -0.8], [0.5, -0.95]]],
  'ρ': [[[0.15, 0.55], [0.15, -0.5], [0.35, -0.9], [0.7, -0.85], [0.85, -0.45], [0.65, -0.05], [0.3, -0.05], [0.15, -0.25]]],
  'Ω': [[[0.05, 0], [0.4, 0], [0.4, -0.3], [0.15, -0.7], [0.2, -1.25], [0.6, -1.5], [1, -1.25], [1.05, -0.7], [0.8, -0.3], [0.8, 0], [1.15, 0]]],
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
  // Exponents and indices not filled in: the writer's own digits, smaller, raised (x²) or lowered (CO₂).
  // Charges (Na⁺, SO₄²⁻) the same way from + and -, own or drawn.
  // + and - are only x-height tall to begin with, so they shrink less
  const small: [string, string, number, string, number][] = [
    ...[...SUP].map((ch, d) => [ch, String(d), 0.8, 'sup', 0.6] as [string, string, number, string, number]),
    ...[...SUB].map((ch, d) => [ch, String(d), -0.25, 'sub', 0.6] as [string, string, number, string, number]),
    ['⁺', '+', 0.75, 'sup', 0.8], ['⁻', '-', 0.75, 'sup', 0.8],
    ...Object.entries(SUP_LETTERS).map(([l, ch]) => [ch, l, 0.85, 'sup', 0.65] as [string, string, number, string, number]),
    ...Object.entries(SUB_LETTERS).map(([l, ch]) => [ch, l, -0.25, 'sub', 0.65] as [string, string, number, string, number]),
  ];
  const all = [...have, ...out];
  for (const [ch, from, lift, tag, f] of small) {
    if (keys.has(ch)) continue;
    for (const v of all) {
      const k = (v.scale ?? 1) * f;
      if (v.key === from) out.push({ ...v, src: `${tag}:${v.src}`, key: ch, scale: k, baseline: v.baseline + (lift * X) / k, entry: null, exit: null });
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
