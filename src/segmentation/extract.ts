import type { Variant } from '../glyphstore/types';
import { GUIDES, MM, TEMPLATE_PAGES, decodePageCode, TEMPLATE_VERSION, type Box } from '../template/layout';
import { analyze, components } from './analyze';
import { apply, lum, readPageCode, register, type Affine, type Raster } from './register';

const INSET = 0.8; // mm, keeps the printed box border out of the crop
const PAD = 2; // px around the trimmed ink

/** Ink opacity from luminance: guides (lum > 185) vanish, dark pen strokes become opaque. */
const inkAlpha = (l: number) => Math.max(0, Math.min(255, ((180 - l) / 100) * 255));

export function extractBox(img: Raster, T: Affine, box: Box): Variant | null {
  const W = Math.round((box.w - 2 * INSET) * MM), H = Math.round((box.h - 2 * INSET) * MM);
  const a = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [u, v] = apply(T, box.x + INSET + (i + 0.5) / MM, box.y + INSET + (j + 0.5) / MM);
    const x = Math.round(u), y = Math.round(v);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
    a[j * W + i] = inkAlpha(lum(img.data, (y * img.width + x) * 4));
  }

  // Drop specks (compression noise, stray dots far smaller than an i-dot).
  const { labels, comps } = components(a.map((v) => (v > 40 ? 1 : 0)), W, H);
  for (let p = 0; p < a.length; p++) if (labels[p] >= 0 && comps[labels[p]].size < 8) a[p] = 0;

  let x0 = W, x1 = -1, y0 = H, y1 = -1, solid = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = a[j * W + i];
    if (v >= 128) solid++;
    if (v > 40) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
  }
  if (solid < 25) return null; // box left empty

  x0 = Math.max(0, x0 - PAD); y0 = Math.max(0, y0 - PAD);
  x1 = Math.min(W - 1, x1 + PAD); y1 = Math.min(H - 1, y1 + PAD);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const alpha = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) alpha.set(a.subarray((j + y0) * W + x0, (j + y0) * W + x0 + w), j * w);

  const baseline = (GUIDES.base - INSET) * MM - y0;
  return { src: box.id, key: box.key, w, h, alpha, baseline, ...analyze(alpha, w, h, baseline) };
}

/** Register a page, identify it by its code and cut out every filled box. */
export function extractPage(img: Raster): { page: number; variants: Variant[] } {
  const T = register(img);
  const { version, page } = decodePageCode(readPageCode(img, T));
  if (version !== TEMPLATE_VERSION || !TEMPLATE_PAGES[page]) {
    throw new Error('Seitenkennung unbekannt – bitte die aktuelle Vorlage aus der App verwenden.');
  }
  const variants: Variant[] = [];
  for (const box of TEMPLATE_PAGES[page]) {
    const v = extractBox(img, T, box);
    if (v) variants.push(v);
  }
  return { page, variants };
}
