import { components, zhangSuen } from '../segmentation/analyze';
import type { Variant } from './types';

/** Squared-distance transform (Felzenszwalb): distance in px from every pixel to the nearest `feature` pixel. */
function distTo(feature: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e12, n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n);
  const g = new Float64Array(w * h);
  const line = (len: number) => {
    let k = 0;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < len; q++) {
      let s: number;
      while ((s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])) <= z[k]) k--;
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = feature[y * w + x] ? 0 : INF;
    line(h);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    line(w);
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x]);
  }
  return out;
}

const cache = new WeakMap<Uint8Array, number>();

/**
 * Pen width of a glyph in px: ink area / length of the centre line. Dots (i, ä, : …) are left out, they are no pen stroke;
 * 0 when too little line is left to tell.
 */
export function penWidth(v: Variant): number {
  let t = cache.get(v.alpha);
  if (t !== undefined) return t;
  const { w, h } = v;
  const bin = v.alpha.map((a) => (a >= 128 ? 1 : 0));
  const sk = zhangSuen(bin, w, h);
  const { labels, comps } = components(bin, w, h);
  const len = new Float64Array(comps.length), ink = new Float64Array(comps.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { // faint edge pixels belong to the stroke next to them
    let c = labels[y * w + x];
    for (let dy = -1; dy <= 1 && c < 0; dy++) for (let dx = -1; dx <= 1 && c < 0; dx++) {
      if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h) c = labels[(y + dy) * w + x + dx];
    }
    if (c >= 0) ink[c] += v.alpha[y * w + x] / 255;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!sk[y * w + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && sk[ny * w + nx]) len[labels[y * w + x]] += Math.hypot(dx, dy) / 2;
    }
  }
  let L = 0, A = 0;
  comps.forEach((_, c) => { if (len[c] >= 10) { L += len[c]; A += ink[c]; } });
  t = L >= 12 ? A / L : 0;
  cache.set(v.alpha, t);
  return t;
}

/** Alpha value from a signed distance (> 0 inside the stroke), the edge moved `delta` px outwards. */
const soft = (signed: number, delta: number) => Math.round(255 * Math.max(0, Math.min(1, signed + delta + 0.5)));

/** Signed distance to the edge of a binary mask: > 0 inside, < 0 outside. */
function signedDist(bin: Uint8Array, w: number, h: number): Float32Array {
  const inside = distTo(bin.map((b) => 1 - b), w, h), outside = distTo(bin, w, h);
  return inside.map((d, i) => (bin[i] ? d - 0.5 : 0.5 - outside[i]));
}

/** Fills every background pixel that the outside cannot reach (4-connected). */
function fillHoles(bin: Uint8Array, w: number, h: number) {
  const out = new Uint8Array(w * h), stack: number[] = [];
  const seed = (i: number) => { if (!bin[i] && !out[i]) { out[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!, x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }
  for (let i = 0; i < bin.length; i++) if (!out[i]) bin[i] = 1;
}

const DOT = 16; // px: a separate ink spot no bigger than this (i-dot, full stop, colon) is a dot, not a stroke

/**
 * The same glyph with its strokes `delta` px wider (negative: thinner), edges stay smooth.
 * dotGoal > 0 also makes every dot that diameter (px): written dots are often blobs, three times the pen.
 */
export function widen(v: Variant, delta: number, dotGoal = 0): Variant {
  const { w, h } = v;
  const bin = v.alpha.map((a) => (a >= 128 ? 1 : 0));
  const alpha = Uint8Array.from(v.alpha);
  if (delta) signedDist(bin, w, h).forEach((d, i) => { alpha[i] = soft(d, delta); });
  if (dotGoal > 0) {
    const { labels, comps } = components(bin, w, h);
    comps.forEach((c, id) => {
      const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
      if (bw > DOT || bh > DOT) return;
      const d = Math.max(-(Math.min(bw, bh) - 4) / 2, -3, Math.min(2, (dotGoal - Math.sqrt(bw * bh)) / 2)); // never thinner than 4 px
      if (Math.abs(d) < 0.3) return;
      const x0 = Math.max(0, c.x0 - 4), y0 = Math.max(0, c.y0 - 4), x1 = Math.min(w - 1, c.x1 + 4), y1 = Math.min(h - 1, c.y1 + 4);
      const lw = x1 - x0 + 1, lh = y1 - y0 + 1, local = new Uint8Array(lw * lh);
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) local[y * lw + x] = labels[(y + y0) * w + x + x0] === id ? 1 : 0;
      fillHoles(local, lw, lh); // a hollow dot (a ring) would fall apart when shrunk
      if (local.reduce((n, b) => n + b, 0) < 0.55 * bw * bh) return; // a hook or curl, not a blob: leave it
      const sd = signedDist(local, lw, lh);
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
        const l = labels[(y + y0) * w + x + x0];
        if (l < 0 || l === id) alpha[(y + y0) * w + x + x0] = soft(sd[y * lw + x], d);
      }
    });
  }
  return { ...v, alpha };
}
