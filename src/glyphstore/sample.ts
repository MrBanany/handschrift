import { extractBox } from '../segmentation/extract';
import type { Affine } from '../segmentation/register';
import { GUIDES, MM, PAGE, TEMPLATE_PAGES, XH } from '../template/layout';
import type { Variant } from './types';

export const SAMPLE_SET = 'Muster';
// Handwriting-style fonts that ship with iPadOS, Android, Windows and macOS; nothing is bundled.
const FONT = '"Bradley Hand", "Segoe Print", "Ink Free", "Noteworthy", "Comic Sans MS", cursive';

/**
 * Builds a demo set on the device: fills the template virtually with a system handwriting font
 * (each box a little different) and cuts it out with the same code as a real import.
 */
export async function buildSampleSet(): Promise<Variant[]> {
  const W = PAGE.w * MM, H = PAGE.h * MM, T: Affine = [MM, 0, 0, 0, MM, 0];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `100px ${FONT}`;
  const size = (100 * XH * MM * 0.95) / (ctx.measureText('x').actualBoundingBoxAscent || 50); // x-height = template x-height
  const out: Variant[] = [];
  for (const boxes of TEMPLATE_PAGES) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#15151c';
    boxes.forEach((b, i) => {
      const r = Math.sin(i * 12.9898) * 43758.5453 % 1; // cheap per-box jitter in -1..1
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate((b.x + 2 + r * 0.4) * MM, (b.y + GUIDES.base + r * 0.15) * MM);
      ctx.rotate(r * 0.03);
      ctx.font = `${size * (1 + r * 0.05)}px ${FONT}`;
      ctx.fillText(b.key, 0, 0);
    });
    const img = ctx.getImageData(0, 0, W, H);
    for (const b of boxes) { const v = extractBox(img, T, b); if (v) out.push(v); }
    await new Promise(requestAnimationFrame); // keep the UI responsive
  }
  c.width = 0;
  return out;
}
