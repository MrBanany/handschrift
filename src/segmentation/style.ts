import { lum, type Raster } from './register';

/** One text line measured on a page (mm). */
export interface LineMeasure { page: number; baseline: number; xh: number; gaps: number[] }
/** Writing habits learned from free text: sizes in mm, gaps in x-heights. */
export interface TextStyle { xh: number; lineH: number; wordGap: number; letterGap: number; lines: number }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

/**
 * Find handwritten lines on a page: rows with ink form bands, the densest part of a band is the
 * x-height zone, and empty columns inside that zone are the gaps between letters and words.
 * Light ruled or dotted paper lines are ignored by the ink threshold.
 */
export function measureLines(img: Raster, pxPerMm: number, page = 0): LineMeasure[] {
  const { width: W, height: H, data } = img;
  const ink = new Uint8Array(W * H);
  const rows = new Float64Array(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (lum(data, (y * W + x) * 4) < 150) { ink[y * W + x] = 1; rows[y]++; }
  }
  // A row that is mostly ink is a printed rule or a drawing edge, not writing.
  for (let y = 0; y < H; y++) if (rows[y] > 0.6 * W) rows[y] = 0;

  const bands: [number, number][] = [];
  const close = Math.round(0.8 * pxPerMm);
  let start = -1, lastOn = -1e9;
  for (let y = 0; y <= H; y++) {
    const on = y < H && rows[y] >= 2;
    if (on) { if (y - lastOn > close) { if (start >= 0) bands.push([start, lastOn]); start = y; } lastOn = y; }
  }
  if (start >= 0) bands.push([start, lastOn]);

  const out: LineMeasure[] = [];
  for (const [y0, y1] of bands) {
    if (y1 - y0 < 1.2 * pxPerMm) continue;
    let peak = 0;
    for (let y = y0; y <= y1; y++) peak = Math.max(peak, rows[y]);
    let top = y1, bottom = y0;
    for (let y = y0; y <= y1; y++) if (rows[y] >= 0.45 * peak) { top = Math.min(top, y); bottom = y; }
    const xh = (bottom - top + 1) / pxPerMm;
    if (xh < 0.8 || xh > 15) continue;

    const used: boolean[] = [];
    for (let x = 0; x < W; x++) {
      let u = false;
      for (let y = top; y <= bottom && !u; y++) u = ink[y * W + x] === 1;
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

export function summarize(lines: LineMeasure[]): TextStyle | null {
  if (lines.length < 3) return null;
  const xh = median(lines.map((l) => l.xh));
  const pitches: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const d = lines[i].baseline - lines[i - 1].baseline;
    if (lines[i].page === lines[i - 1].page && d > 1.5 * xh && d < 10 * xh) pitches.push(d);
  }
  const split = splitGaps(lines.flatMap((l) => l.gaps.map((g) => g / l.xh)));
  if (!pitches.length || !split) return null;
  return {
    xh, lineH: median(pitches),
    wordGap: Math.min(3, Math.max(0.4, split.word)),
    letterGap: Math.min(0.8, Math.max(0.03, split.letter)),
    lines: lines.length,
  };
}
