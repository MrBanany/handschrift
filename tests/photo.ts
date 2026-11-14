// Helpers to turn a clean synthetic template page into "phone photo" style hard cases (no DOM needed).
import { TEMPLATE_PAGES } from '../src/template/layout';
import type { Raster } from '../src/segmentation/register';
import { blankPage, writeU } from './synthetic';

/** A template page with the first n boxes written in. */
export function filledPage(page = 0, n = 40, boxes = TEMPLATE_PAGES[page].slice(0, n)): Raster {
  const p = blankPage(page);
  boxes.forEach((b, i) => writeU(p, b, (i % 3) * 0.3));
  return p.img;
}

/** Output pixel -> source pixel via a 3x3 homography (row-major), bilinear sampling; outside the source is `bg`. */
export function warp(src: Raster, W: number, H: number, Hm: number[], bg = 255): Raster {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const w = Hm[6] * x + Hm[7] * y + Hm[8];
    const u = (Hm[0] * x + Hm[1] * y + Hm[2]) / w, v = (Hm[3] * x + Hm[4] * y + Hm[5]) / w;
    const o = (y * W + x) * 4;
    out[o + 3] = 255;
    if (u < 0 || v < 0 || u >= src.width - 1 || v >= src.height - 1) { out[o] = out[o + 1] = out[o + 2] = bg; continue; }
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    for (let c = 0; c < 3; c++) {
      const g = (xx: number, yy: number) => src.data[(yy * src.width + xx) * 4 + c];
      out[o + c] = g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
    }
  }
  return { data: out, width: W, height: H };
}

/** Rotate by `deg` about the centre, scale by s, shift by (tx, ty) px (homography out -> in). */
export function rotation(deg: number, W: number, H: number, s = 1, tx = 0, ty = 0): number[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a) / s, n = Math.sin(a) / s, cx = W / 2, cy = H / 2;
  const px = cx + tx, py = cy + ty;
  return [c, n, cx - c * px - n * py, -n, c, cy + n * px - c * py, 0, 0, 1];
}

/** Multiply every pixel by f(x, y) with x, y in 0..1 (uneven light). */
export function shade(img: Raster, f: (x: number, y: number) => number): Raster {
  const d = new Uint8ClampedArray(img.data);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) for (let c = 0; c < 3; c++) d[(y * img.width + x) * 4 + c] *= f(x / img.width, y / img.height);
  return { ...img, data: d };
}
