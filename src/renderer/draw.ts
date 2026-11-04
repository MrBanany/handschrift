import { sampleConnector } from '../connectors/connect';
import type { Variant } from '../glyphstore/types';
import type { Page } from './layout';

export type Background = 'blank' | 'lined' | 'grid' | 'transparent';
export interface DrawOpts {
  pxPerMm: number; ink: string; weight: number; background: Background;
  pageW: number; pageH: number; lineH: number; margin: number; crop: boolean;
}

const masks = new Map<string, HTMLCanvasElement>();
function mask(v: Variant): HTMLCanvasElement {
  let c = masks.get(v.src);
  if (!c) {
    c = document.createElement('canvas');
    c.width = v.w; c.height = v.h;
    const img = new ImageData(v.w, v.h);
    for (let i = 0; i < v.alpha.length; i++) img.data[i * 4 + 3] = v.alpha[i];
    c.getContext('2d')!.putImageData(img, 0, 0);
    masks.set(v.src, c);
  }
  return c;
}
export const clearMaskCache = () => masks.clear();

function bounds(page: Page) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const { g, m } of page.glyphs) for (const [x, y] of [[0, 0], [g.w, 0], [0, g.h], [g.w, g.h]]) add(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]);
  for (const ms of page.missing) { add(ms.x, ms.y); add(ms.x + ms.w, ms.y + ms.h); }
  return { x0, y0, x1, y1 };
}

/**
 * All ink (glyph bitmaps + connector strokes) goes into one alpha mask first and is coloured
 * once, so overlapping strokes never darken and joins show no seam.
 */
export function drawPage(page: Page, o: DrawOpts, variant: (src: string) => Variant): HTMLCanvasElement {
  const px = o.pxPerMm;
  let ox = 0, oy = 0, Wmm = o.pageW, Hmm = o.pageH;
  if (o.crop && (page.glyphs.length || page.missing.length)) {
    const b = bounds(page), pad = 3;
    ox = b.x0 - pad; oy = b.y0 - pad; Wmm = b.x1 - b.x0 + 2 * pad; Hmm = b.y1 - b.y0 + 2 * pad;
  }
  const W = Math.max(1, Math.round(Wmm * px)), H = Math.max(1, Math.round(Hmm * px));
  const ink = document.createElement('canvas');
  ink.width = W; ink.height = H;
  const ic = ink.getContext('2d')!;
  ic.imageSmoothingEnabled = true;
  ic.imageSmoothingQuality = 'high';

  const extra = o.weight * 0.05 * px; // thicker pen: stamp the bitmap around a small circle
  const offs: [number, number][] = [[0, 0]];
  if (extra > 0.2) for (let i = 0; i < 8; i++) offs.push([Math.cos((i * Math.PI) / 4) * extra, Math.sin((i * Math.PI) / 4) * extra]);

  for (const { g, m } of page.glyphs) {
    const v = variant(g.src);
    for (const [dx, dy] of offs) {
      ic.setTransform(m[0] * px, m[1] * px, m[2] * px, m[3] * px, (m[4] - ox) * px + dx, (m[5] - oy) * px + dy);
      ic.drawImage(mask(v), 0, 0);
    }
  }
  ic.setTransform(1, 0, 0, 1, 0, 0);
  ic.beginPath();
  for (const c of page.connectors) {
    for (const p of sampleConnector(c, Math.max(0.02, Math.min(c.w0, c.w1) * 0.25))) {
      const x = (p.x - ox) * px, y = (p.y - oy) * px, r = Math.max(0.4, p.r * px + extra);
      ic.moveTo(x + r, y);
      ic.arc(x, y, r, 0, 2 * Math.PI);
    }
  }
  ic.fill();
  ic.globalCompositeOperation = 'source-in';
  ic.fillStyle = o.ink;
  ic.fillRect(0, 0, W, H);

  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const c = out.getContext('2d')!;
  if (o.background !== 'transparent') {
    c.fillStyle = '#fff';
    c.fillRect(0, 0, W, H);
    c.lineWidth = Math.max(1, 0.15 * px);
    c.beginPath();
    if (o.background === 'lined') {
      c.strokeStyle = '#b9cde0';
      for (let y = o.margin + o.lineH; y <= o.pageH - o.margin + 0.01; y += o.lineH) { c.moveTo(0, (y - oy) * px); c.lineTo(W, (y - oy) * px); }
    } else if (o.background === 'grid') {
      // A written line spans two boxes, and every baseline falls on a grid line.
      const cell = o.lineH / 2, first = (from: number, phase: number) => phase + Math.ceil((from - phase) / cell) * cell - from;
      c.strokeStyle = '#d6e2ed';
      for (let x = first(ox, o.margin); x < Wmm; x += cell) { c.moveTo(x * px, 0); c.lineTo(x * px, H); }
      for (let y = first(oy, o.margin + o.lineH); y < Hmm; y += cell) { c.moveTo(0, y * px); c.lineTo(W, y * px); }
    }
    c.stroke();
  }
  c.drawImage(ink, 0, 0);
  ink.width = 0; // free memory early (Safari has a tight canvas budget)

  // Missing characters: clearly marked, never silently replaced.
  c.strokeStyle = c.fillStyle = '#d11';
  c.lineWidth = Math.max(1, 0.2 * px);
  c.setLineDash([0.6 * px, 0.4 * px]);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const ms of page.missing) {
    const x = (ms.x - ox) * px, y = (ms.y - oy) * px;
    c.strokeRect(x, y, ms.w * px, ms.h * px);
    c.font = `${ms.h * 0.6 * px}px sans-serif`;
    c.fillText(ms.ch, x + (ms.w * px) / 2, y + (ms.h * px) / 2);
  }
  return out;
}
