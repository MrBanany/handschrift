import { lum, type Raster } from './register';

/** One text line measured on a page (mm). */
export interface LineMeasure { page: number; baseline: number; xh: number; gaps: number[] }
/** Writing habits learned from free text: sizes in mm, gaps in x-heights (left out when they can't be told apart). */
export interface TextStyle { xh: number; lineH: number; wordGap?: number; letterGap?: number; lines: number; pages?: number }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

/**
 * Find handwritten lines on a page. Ascenders and descenders usually bridge neighbouring lines, so a line is found
 * by its x-height zone, which is several times denser than the rows around it. Empty columns inside that zone are
 * the gaps between letters and words. Ruled, squared or dotted paper is ignored.
 */
export function measureLines(img: Raster, pxPerMm: number, page = 0): LineMeasure[] {
  const { width: W, height: H, data } = img, N = W * H;
  // Paper is the most common brightness. Ink clearly differs from it, so light pens and dark paper work too,
  // while light rulings and dots don't count.
  const L = new Uint8Array(N), hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) { L[i] = lum(data, i * 4); hist[L[i]]++; }
  let paper = 0;
  for (let v = 1; v < 256; v++) if (hist[v] > hist[paper]) paper = v;
  const ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) ink[i] = Math.abs(L[i] - paper) > 75 ? 1 : 0;
  // Rows or columns that are mostly ink are printed rulings, margins or frames, not writing.
  const rows = new Float64Array(H), cols = new Float64Array(W);
  for (let i = 0; i < N; i++) if (ink[i]) { rows[(i / W) | 0]++; cols[i % W]++; }
  for (let y = 0; y < H; y++) if (rows[y] > 0.6 * W) ink.fill(0, y * W, (y + 1) * W);
  for (let x = 0; x < W; x++) if (cols[x] > 0.6 * H) for (let i = x; i < N; i += W) ink[i] = 0;
  rows.fill(0);
  for (let i = 0; i < N; i++) rows[(i / W) | 0] += ink[i];

  // Row density smoothed over ~0.5 mm; ref is a row in the x-height zone of a well filled line.
  const r = Math.max(1, Math.round(0.25 * pxPerMm)), sm = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) s += rows[k];
    sm[y] = s / (2 * r + 1);
  }
  const filled = [...sm].filter((v) => v >= 1).sort((a, b) => a - b);
  if (!filled.length) return [];
  const ref = filled[Math.floor(0.9 * (filled.length - 1))], dense = 0.35 * ref;
  const dip = Math.round(0.6 * pxPerMm); // thin mid-letter rows don't split a zone, the space between lines does

  const out: LineMeasure[] = [];
  for (let y = 0; y < H; y++) {
    if (sm[y] < dense) continue;
    let y1 = y, pk = y;
    for (let k = y + 1; k < H && k - y1 <= dip; k++) if (sm[k] >= dense) { y1 = k; if (sm[k] > sm[pk]) pk = k; }
    // The line's own x-height zone: rows at least 45 % as dense as its peak (also for lines lighter than ref).
    const lo = 0.45 * sm[pk];
    let top = pk, bottom = pk;
    for (let k = y; k <= y1; k++) if (sm[k] >= lo) { top = Math.min(top, k); bottom = Math.max(bottom, k); }
    while (top > 0 && sm[top - 1] >= lo) top--;
    while (bottom + 1 < H && sm[bottom + 1] >= lo) bottom++;
    y = Math.max(y1, bottom);
    const xh = (bottom - top + 1) / pxPerMm;
    if (xh < 0.8 || xh > 15) continue;

    const used: boolean[] = [];
    for (let x = 0; x < W; x++) {
      let u = false;
      for (let k = top; k <= bottom && !u; k++) u = ink[k * W + x] === 1;
      used.push(u);
    }
    const first = used.indexOf(true), last = used.lastIndexOf(true);
    const gaps: number[] = [];
    let run = 0;
    for (let x = first; x <= last; x++) {
      if (!used[x]) run++;
      else { if (run) gaps.push(run / pxPerMm); run = 0; }
    }
    out.push({ page, baseline: (bottom + 1) / pxPerMm, xh, gaps });
  }
  return out;
}

/** Split gaps into letter gaps and word gaps (Otsu threshold on the 1-D values). */
export function splitGaps(gs: number[]): { letter: number; word: number } | null {
  const g = [...gs].sort((a, b) => a - b);
  if (g.length < 6) return null;
  let best = -1, cut = 0;
  const total = g.reduce((a, b) => a + b, 0);
  let sum = 0;
  for (let i = 1; i < g.length; i++) {
    sum += g[i - 1];
    const m1 = sum / i, m2 = (total - sum) / (g.length - i);
    const v = i * (g.length - i) * (m1 - m2) ** 2;
    if (v > best) { best = v; cut = i; }
  }
  const letter = median(g.slice(0, cut)), word = median(g.slice(cut));
  return word > 1.8 * letter ? { letter, word } : null;
}

/** Size and line spacing need 3 lines; the gaps are added when letter and word gaps are clearly different. */
export function summarize(lines: LineMeasure[]): TextStyle | null {
  if (lines.length < 3) return null;
  const xh = median(lines.map((l) => l.xh));
  const ds: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const d = lines[i].baseline - lines[i - 1].baseline;
    if (lines[i].page === lines[i - 1].page && d > 1.5 * xh && d < 10 * xh) ds.push(d);
  }
  if (!ds.length) return null;
  // Average over all steps; an empty line in between counts as two.
  const unit = median(ds);
  let span = 0, steps = 0;
  for (const d of ds) { const k = Math.round(d / unit); if (k >= 1 && k <= 3) { span += d; steps += k; } }
  const split = splitGaps(lines.flatMap((l) => l.gaps.map((g) => g / l.xh)));
  return {
    xh, lineH: span / steps, lines: lines.length,
    ...(split && { wordGap: Math.min(3, Math.max(0.4, split.word)), letterGap: Math.min(0.8, Math.max(0.03, split.letter)) }),
  };
}
