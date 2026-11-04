import { CODE_BITS, CODE_SIZE, MARKS, MARK_SIZE, PAGE } from '../template/layout';

/** Plain RGBA raster (ImageData-compatible, also usable in tests without a DOM). */
export interface Raster { data: Uint8ClampedArray; width: number; height: number }

/** Affine map template-mm -> image-px: u = a x + b y + c, v = d x + e y + f */
export type Affine = [number, number, number, number, number, number];

export const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export function apply(T: Affine, x: number, y: number): [number, number] {
  return [T[0] * x + T[1] * y + T[2], T[3] * x + T[4] * y + T[5]];
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

/**
 * Find the four corner marks and return the template->image transform.
 * shortcut: affine only (no perspective) — fine for GoodNotes exports and flat scans, upgrade to a homography if phone photos are needed.
 */
export function register(img: Raster): Affine {
  const s = img.width / PAGE.w;
  const found: [number, number][] = [], src: [number, number][] = [];
  for (const [mx, my] of MARKS) {
    const c = markCentroid(img, mx * s, my * s, 15 * s);
    if (c) { found.push(c); src.push([mx, my]); }
  }
  if (found.length < 3) throw new Error('Passermarken nicht gefunden – ist das eine Seite der Vorlage?');
  return fitAffine(src, found);
}

export function readPageCode(img: Raster, T: Affine): number {
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

