// Synthetic template page painter: no real handwriting ever needed for tests.
import { CODE_BITS, CODE_SIZE, GUIDES, MARKS, MARK_SIZE, MM, PAGE, TEMPLATE_PAGES, pageCode, type Box } from '../src/template/layout';
import type { Affine, Raster } from '../src/segmentation/register';

export type Pt = [number, number];

export class Painter {
  img: Raster;
  constructor(public T: Affine = [MM, 0, 0, 0, MM, 0], w = PAGE.w * MM, h = PAGE.h * MM) {
    this.img = { data: new Uint8ClampedArray(w * h * 4).fill(255), width: w, height: h };
  }
  /** Fill every pixel whose template-mm position satisfies pred, inside the mm bbox. */
  fill(x0: number, y0: number, x1: number, y1: number, pred: (x: number, y: number) => boolean, rgb: [number, number, number]) {
    const [a, b, c, d, e, f] = this.T, det = a * e - b * d;
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [a * x + b * y + c, d * x + e * y + f]);
    const us = corners.map((p) => p[0]), vs = corners.map((p) => p[1]);
    for (let v = Math.max(0, Math.floor(Math.min(...vs))); v <= Math.min(this.img.height - 1, Math.ceil(Math.max(...vs))); v++) {
      for (let u = Math.max(0, Math.floor(Math.min(...us))); u <= Math.min(this.img.width - 1, Math.ceil(Math.max(...us))); u++) {
        const du = u - c, dv = v - f;
        const x = (e * du - b * dv) / det, y = (-d * du + a * dv) / det;
        if (pred(x, y)) this.img.data.set(rgb, (v * this.img.width + u) * 4);
      }
    }
  }
  square(cx: number, cy: number, s: number) {
    this.fill(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2, (x, y) => Math.abs(x - cx) <= s / 2 && Math.abs(y - cy) <= s / 2, [0, 0, 0]);
  }
  line(p: Pt, q: Pt, r: number, rgb: [number, number, number] = [20, 20, 30]) {
    const dx = q[0] - p[0], dy = q[1] - p[1], L = dx * dx + dy * dy || 1;
    this.fill(Math.min(p[0], q[0]) - r, Math.min(p[1], q[1]) - r, Math.max(p[0], q[0]) + r, Math.max(p[1], q[1]) + r, (x, y) => {
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / L));
      return Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy) <= r;
    }, rgb);
  }
  polyline(pts: Pt[], r = 0.25) { for (let i = 1; i < pts.length; i++) this.line(pts[i - 1], pts[i], r); }
}

/** A blank template page as it would come back from GoodNotes. */
export function blankPage(page: number, T?: Affine) {
  const p = new Painter(T);
  for (const [x, y] of MARKS) p.square(x, y, MARK_SIZE);
  CODE_BITS.forEach(([x, y], i) => { if (pageCode(page) & (1 << i)) p.square(x, y, CODE_SIZE); });
  for (const b of TEMPLATE_PAGES[page]) {
    p.line([b.x, b.y + GUIDES.base], [b.x + b.w, b.y + GUIDES.base], 0.15, [158, 204, 242]);
    p.line([b.x, b.y + GUIDES.xh], [b.x + b.w, b.y + GUIDES.xh], 0.1, [158, 204, 242]);
    p.line([b.x, b.y], [b.x + b.w, b.y], 0.1, [191, 204, 219]);
  }
  return p;
}

/** Cursive-ish "u": entry stroke from the baseline, two humps, exit stroke to the right. Coordinates relative to the box. */
export function writeU(p: Painter, b: Box, dx = 0) {
  const X = b.x + 3 + dx, B = b.y + GUIDES.base, H = GUIDES.base - GUIDES.xh;
  p.polyline([[X, B - 0.3], [X + 1, B - H], [X + 1.3, B - 0.5], [X + 2.5, B], [X + 3.5, B - H], [X + 3.6, B - 0.4], [X + 4.6, B - 0.8], [X + 5.6, B - 1.6]]);
}
