import { CODE_BITS, CODE_SIZE, MARKS, MARK_SIZE, PAGE, TEMPLATE_PAGES, TEMPLATE_VERSION, decodePageCode } from '../template/layout';
import { components } from './analyze';

/** Plain RGBA raster (ImageData-compatible, also usable in tests without a DOM). */
export interface Raster { data: Uint8ClampedArray; width: number; height: number }

/** Affine map template-mm -> image-px: u = a x + b y + c, v = d x + e y + f */
export type Affine = [number, number, number, number, number, number];

export const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** An affine (6 numbers) or, for tilted phone photos, a projective map (9 numbers, row-major 3x3). */
export type Transform = number[];

export function apply(T: Transform, x: number, y: number): [number, number] {
  if (T.length === 9) {
    const w = T[6] * x + T[7] * y + T[8];
    return [(T[0] * x + T[1] * y + T[2]) / w, (T[3] * x + T[4] * y + T[5]) / w];
  }
  return [T[0] * x + T[1] * y + T[2], T[3] * x + T[4] * y + T[5]];
}

const BLOCK = 128;

/**
 * Even out the light: divide by the paper level, estimated per 128 px block (the 90th brightness percentile, so pen
 * strokes and the black corner marks don't count). Dark or unevenly lit photos then read like a clean scan; without this
 * the fixed ink threshold turned shadows and guide lines into "handwriting". Returns a grey RGBA copy.
 */
export function flatten(img: Raster): Raster {
  const { width: W, height: H, data } = img;
  const bw = Math.ceil(W / BLOCK), bh = Math.ceil(H / BLOCK), paper = new Float32Array(bw * bh), hist = new Uint32Array(256);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    hist.fill(0);
    let n = 0;
    for (let y = by * BLOCK; y < Math.min(H, (by + 1) * BLOCK); y += 3) for (let x = bx * BLOCK; x < Math.min(W, (bx + 1) * BLOCK); x += 3) { hist[lum(data, (y * W + x) * 4) | 0]++; n++; }
    let acc = 0, level = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= 0.9 * n) { level = v; break; } }
    paper[by * bw + bx] = Math.max(level, 40);
  }
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(bh - 1, Math.max(0, y / BLOCK - 0.5)), y0 = Math.floor(fy), y1 = Math.min(bh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(bw - 1, Math.max(0, x / BLOCK - 0.5)), x0 = Math.floor(fx), x1 = Math.min(bw - 1, x0 + 1), tx = fx - x0;
      const b = (paper[y0 * bw + x0] * (1 - tx) + paper[y0 * bw + x1] * tx) * (1 - ty) + (paper[y1 * bw + x0] * (1 - tx) + paper[y1 * bw + x1] * tx) * ty;
      const o = (y * W + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = (lum(data, o) * 255) / b;
      out[o + 3] = 255;
    }
  }
  return { data: out, width: W, height: H };
}

function markCentroid(img: Raster, ex: number, ey: number, r: number): [number, number] | null {
  let sx = 0, sy = 0, n = 0;
  const x0 = Math.max(0, Math.round(ex - r)), x1 = Math.min(img.width, Math.round(ex + r));
  const y0 = Math.max(0, Math.round(ey - r)), y1 = Math.min(img.height, Math.round(ey + r));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (lum(img.data, (y * img.width + x) * 4) < 100) { sx += x; sy += y; n++; }
  }
  const scale = img.width / PAGE.w;
  return n > 0.4 * (MARK_SIZE * scale) ** 2 ? [sx / n, sy / n] : null;
}

/** Least-squares affine fit from point pairs (template mm -> image px). */
export function fitAffine(src: [number, number][], dst: [number, number][]): Affine {
  // Normal equations for [x y 1] * [a b c]^T = u (and same for v).
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const bu = [0, 0, 0], bv = [0, 0, 0];
  src.forEach(([x, y], i) => {
    const r = [x, y, 1];
    for (let j = 0; j < 3; j++) {
      for (let k = 0; k < 3; k++) M[j][k] += r[j] * r[k];
      bu[j] += r[j] * dst[i][0];
      bv[j] += r[j] * dst[i][1];
    }
  });
  const solve = (b: number[]) => {
    const A = M.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < 3; r++) if (r !== c) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k];
      }
    }
    return A.map((row, i) => row[3] / A[i][i]);
  };
  const [a, b, c] = solve(bu), [d, e, f] = solve(bv);
  return [a, b, c, d, e, f];
}

/** Exact projective map through four point pairs (template mm -> image px). */
export function fitHomography(src: [number, number][], dst: [number, number][]): Transform {
  const A = src.flatMap(([x, y], i) => {
    const [u, v] = dst[i];
    return [[x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]];
  });
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) if (r !== c) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...A.map((row, i) => row[8] / row[i]), 1];
}

/**
 * The four black corner squares, found anywhere in the picture (so a tilted photo, or a page with table around it, works):
 * square-ish dark blobs of about the same size, then the extreme ones towards each corner. Clockwise from top left, or null.
 */
function findCorners(flat: Raster): [number, number][] | null {
  const w = flat.width >> 1, h = flat.height >> 1, bin = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bin[y * w + x] = lum(flat.data, (2 * y * flat.width + 2 * x) * 4) < 100 ? 1 : 0;
  const e = (MARK_SIZE * (flat.width / PAGE.w)) / 2; // expected side at half resolution if the page fills the picture
  const sq: { x: number; y: number; side: number }[] = [];
  for (const c of components(bin, w, h).comps) {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, side = Math.max(bw, bh);
    if (side < 0.35 * e || side > 2.2 * e || Math.max(bw, bh) / Math.min(bw, bh) > 1.5 || c.size < 0.5 * bw * bh) continue;
    sq.push({ x: c.x0 + c.x1 + 1, y: c.y0 + c.y1 + 1, side }); // centre in full-resolution px
  }
  // The marks are the biggest squares (the page code squares are half as big): the largest size class with at least 4 members.
  // Perspective makes near marks bigger than far ones, hence the wide band.
  let group: typeof sq = [];
  for (const a of [...sq].sort((p, q) => q.side - p.side)) {
    const g = sq.filter((b) => b.side >= 0.62 * a.side && b.side <= 1.1 * a.side);
    if (g.length >= 4) { group = g; break; }
  }
  if (group.length < 4) return null;
  const pick = (f: (p: { x: number; y: number }) => number) => group.reduce((m, p) => (f(p) < f(m) ? p : m));
  const four = [pick((p) => p.x + p.y), pick((p) => -(p.x - p.y)), pick((p) => -(p.x + p.y)), pick((p) => p.x - p.y)]; // TL, TR, BR, BL
  if (new Set(four).size < 4) return null;
  return four.map((p) => [p.x, p.y]);
}

const MARK_ORDER: [number, number][] = [MARKS[0], MARKS[1], MARKS[3], MARKS[2]]; // clockwise from top left
const maxResidualMm = (T: Transform, src: [number, number][], dst: [number, number][], pxPerMm: number) =>
  Math.max(...src.map(([x, y], i) => Math.hypot(...(apply(T, x, y).map((v, k) => v - dst[i][k]) as [number, number])) / pxPerMm));

const UNKNOWN_PAGE = 'Seitenkennung unbekannt – bitte die aktuelle Vorlage aus der App verwenden.';

/**
 * Transform + page for a (flattened) picture. Works on tilted, shrunken and perspective photos, also turned by 90°/180°:
 * the turn is whichever makes the page code valid. Falls back to looking near the expected corners (3 marks are enough).
 */
export function locate(flat: Raster): { T: Transform; page: number } {
  const corners = findCorners(flat);
  if (corners) {
    const pxPerMm = Math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]) / (MARKS[1][0] - MARKS[0][0]);
    for (let turn = 0; turn < 4; turn++) {
      const dst = corners.map((_, i) => corners[(i + turn) % 4]);
      let T: Transform = fitAffine(MARK_ORDER, dst);
      if (maxResidualMm(T, MARK_ORDER, dst, pxPerMm) > 0.4) T = fitHomography(MARK_ORDER, dst); // perspective
      const { version, page } = decodePageCode(readPageCode(flat, T));
      if (version === TEMPLATE_VERSION && TEMPLATE_PAGES[page]) return { T, page };
    }
    throw new Error(UNKNOWN_PAGE);
  }
  const T = register(flat);
  const { version, page } = decodePageCode(readPageCode(flat, T));
  if (version !== TEMPLATE_VERSION || !TEMPLATE_PAGES[page]) throw new Error(UNKNOWN_PAGE);
  return { T, page };
}

/**
 * Find the four corner marks near where they should be and return the template->image transform.
 * shortcut: affine only (no perspective) — fine for GoodNotes exports and flat scans, upgrade to a homography if phone photos are needed.
 */
export function register(img: Raster): Affine {
  const s = img.width / PAGE.w;
  const found: [number, number][] = [], src: [number, number][] = [];
  for (const [mx, my] of MARKS) {
    const c = markCentroid(img, mx * s, my * s, 15 * s);
    if (c) { found.push(c); src.push([mx, my]); }
  }
  if (found.length < 3) throw new Error('Passermarken nicht gefunden – ist das eine Seite der Vorlage? Bei Fotos müssen alle vier schwarzen Ecken zu sehen sein.');
  return fitAffine(src, found);
}

export function readPageCode(img: Raster, T: Transform): number {
  let code = 0;
  CODE_BITS.forEach(([cx, cy], i) => {
    let dark = 0, n = 0;
    const h = CODE_SIZE * 0.3;
    for (let dy = -h; dy <= h; dy += 0.2) for (let dx = -h; dx <= h; dx += 0.2) {
      const [u, v] = apply(T, cx + dx, cy + dy);
      const x = Math.round(u), y = Math.round(v);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      n++;
      if (lum(img.data, (y * img.width + x) * 4) < 100) dark++;
    }
    if (n && dark / n > 0.5) code |= 1 << i;
  });
  return code;
}

