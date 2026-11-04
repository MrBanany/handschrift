import type { Anchor } from '../glyphstore/types';
import { MM, XH } from '../template/layout';

/** 8-connected components of a binary mask. */
export function components(bin: Uint8Array, w: number, h: number) {
  const labels = new Int32Array(w * h).fill(-1);
  const comps: { size: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!bin[s] || labels[s] >= 0) continue;
    const c = { size: 0, x0: w, x1: 0, y0: h, y1: 0 };
    const id = comps.push(c) - 1;
    labels[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w;
      c.size++;
      c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.y0 = Math.min(c.y0, y); c.y1 = Math.max(c.y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (bin[q] && labels[q] < 0) { labels[q] = id; stack.push(q); }
      }
    }
  }
  return { labels, comps };
}

/** Zhang-Suen thinning. Returns a 1-px skeleton mask. */
export function zhangSuen(bin: Uint8Array, w: number, h: number): Uint8Array {
  const img = Uint8Array.from(bin);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const del: number[] = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!img[y * w + x]) continue;
        const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const b = p.reduce((s, v) => s + v, 0);
        if (b < 2 || b > 6) continue;
        let a = 0;
        for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) a++;
        if (a !== 1) continue;
        // p[0]=N p[2]=E p[4]=S p[6]=W
        if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
        del.push(y * w + x);
      }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
    }
  }
  return img;
}

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

function neighbours(sk: Uint8Array, w: number, h: number, x: number, y: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [dx, dy] of N8) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h && sk[ny * w + nx]) out.push([nx, ny]);
  }
  return out;
}

/** Walk along the skeleton from an endpoint. Stops at a real junction or after max steps. */
function trace(sk: Uint8Array, w: number, h: number, start: [number, number], max: number) {
  const path: [number, number][] = [start];
  const seen = new Set([start[1] * w + start[0]]);
  let junction = false;
  while (path.length < max) {
    const [x, y] = path[path.length - 1];
    const next = neighbours(sk, w, h, x, y).filter(([nx, ny]) => !seen.has(ny * w + nx));
    if (!next.length) break;
    // Several candidates that touch each other are just a staircase, not a fork.
    if (next.some((a) => next.some((b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) > 1))) { junction = true; break; }
    const step = next.find(([nx, ny]) => nx === x || ny === y) ?? next[0]; // prefer 4-neighbour
    for (const [nx, ny] of next) seen.add(ny * w + nx);
    path.push(step);
  }
  return { path, junction };
}

function localWidth(alpha: Uint8Array, w: number, h: number, x: number, y: number, nx: number, ny: number) {
  let n = 1;
  for (const s of [1, -1]) {
    for (let t = 0.5; t < 40; t += 0.5) {
      const px = Math.round(x + s * nx * t), py = Math.round(y + s * ny * t);
      if (px < 0 || py < 0 || px >= w || py >= h || alpha[py * w + px] < 128) break;
      n += 0.5;
    }
  }
  return n;
}

export interface Analysis { entry: Anchor | null; exit: Anchor | null; strokeW: number; connected: boolean }

/** Find entry/exit strokes via skeleton endpoints, mean stroke width and whether the ink is one joined stroke. */
export function analyze(alpha: Uint8Array, w: number, h: number, baseline: number): Analysis {
  const bin = alpha.map((a) => (a >= 128 ? 1 : 0));
  let ink = 0;
  for (const a of alpha) ink += a / 255;
  const sk = zhangSuen(bin, w, h);
  let skLen = 0;
  for (const v of sk) skLen += v;
  const strokeW = skLen ? Math.max(1, ink / skLen) : 1;

  // Prune short spurs that thinning leaves at stroke corners.
  const spur = Math.max(6, Math.round(1.2 * strokeW));
  const endpoints = () => {
    const out: [number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (sk[y * w + x] && neighbours(sk, w, h, x, y).length === 1) out.push([x, y]);
    }
    return out;
  };
  for (const e of endpoints()) {
    const { path, junction } = trace(sk, w, h, e, spur);
    if (junction && path.length < spur) for (const [x, y] of path) sk[y * w + x] = 0;
  }

  const xh = XH * MM;
  const cands = endpoints().map((e) => {
    const { path } = trace(sk, w, h, e, 16);
    const inner = path.slice(Math.min(6, path.length - 1));
    const ix = inner.reduce((s, p) => s + p[0], 0) / inner.length;
    const iy = inner.reduce((s, p) => s + p[1], 0) / inner.length;
    const len = Math.hypot(e[0] - ix, e[1] - iy) || 1;
    const out = { dx: (e[0] - ix) / len, dy: (e[1] - iy) / len }; // pen arriving at the endpoint
    const q = path[Math.min(3, path.length - 1)];
    const lw = Math.min(2 * strokeW, localWidth(alpha, w, h, q[0], q[1], -out.dy, out.dx));
    return { x: e[0], y: e[1], out, w: lw };
  }).filter((c) => c.y > baseline - 1.4 * xh && c.y < baseline + 0.4 * xh);

  let exit: Anchor | null = null, entry: Anchor | null = null, best = -Infinity, bestIn = -Infinity;
  for (const c of cands) {
    const rel = c.x / Math.max(1, w - 1);
    const sOut = c.x + 0.25 * c.y, sIn = -c.x + 0.25 * c.y;
    if (rel >= 0.55 && c.out.dx > -0.3 && sOut > best) {
      best = sOut;
      exit = { x: c.x, y: c.y, dx: c.out.dx, dy: c.out.dy, w: c.w };
    }
    // At the entry the pen moves into the glyph, i.e. opposite to the trace direction.
    if (rel <= 0.45 && -c.out.dx > -0.3 && sIn > bestIn) {
      bestIn = sIn;
      entry = { x: c.x, y: c.y, dx: -c.out.dx, dy: -c.out.dy, w: c.w };
    }
  }

  const { comps } = components(bin, w, h);
  const big = comps.filter((c) => c.size > 0.02 * ink);
  const widest = big.reduce((m, c) => Math.max(m, c.x1 - c.x0 + 1), 0);
  return { entry, exit, strokeW, connected: widest >= 0.8 * w };
}
