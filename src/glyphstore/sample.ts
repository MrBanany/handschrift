import { extractBox } from '../segmentation/extract';
import type { Affine } from '../segmentation/register';
import { GUIDES, MM, PAGE, TEMPLATE_PAGES, XH } from '../template/layout';
import type { Variant } from './types';

import patrickHand from './fonts/PatrickHand-Regular.ttf?url';
import caveat from './fonts/Caveat.ttf?url';
import playwrite from './fonts/PlaywriteDELA.ttf?url'; // Lateinische Ausgangsschrift: its t has a bar (the VA one has none)

export const SAMPLE_SET = 'Muster';
/** Ready-made handwritings for everyone, built on the device on first use. Fonts are SIL OFL 1.1 (licence next to the files). */
export interface Sample { name: string; label: string; family?: string; url?: string; cursive?: boolean }
export const SAMPLES: Sample[] = [
  { name: SAMPLE_SET, label: 'Muster (Beispiel)' },
  { name: 'Muster Druckschrift', label: 'Muster: Druckschrift, ordentlich', family: 'Patrick Hand', url: patrickHand },
  { name: 'Muster Locker', label: 'Muster: locker und schnell', family: 'Caveat', url: caveat },
  { name: 'Muster Schreibschrift', label: 'Muster: Schreibschrift, verbunden', family: 'Playwrite DE LA', url: playwrite, cursive: true },
];
export const sampleOf = (name: string) => SAMPLES.find((x) => x.name === name);
export const isSample = (name: string) => !!sampleOf(name);
/** Loads the sample's font (bundled, works offline once cached) and fills the template with it. */
export async function sampleVariants(x: Sample): Promise<Variant[]> {
  if (!x.url || !x.family) return buildSampleSet();
  document.fonts.add(await new FontFace(x.family, `url(${x.url})`).load());
  return buildSampleSet(`"${x.family}"`);
}
// Handwriting-style fonts that ship with iPadOS, Android, Windows and macOS; nothing is bundled.
const FONT = '"Bradley Hand", "Segoe Print", "Ink Free", "Noteworthy", "Comic Sans MS", cursive';

/**
 * Builds a demo set on the device: fills the template virtually with a system handwriting font
 * (each box a little different) and cuts it out with the same code as a real import.
 */
export async function buildSampleSet(font = FONT): Promise<Variant[]> {
  const W = PAGE.w * MM, H = PAGE.h * MM, T: Affine = [MM, 0, 0, 0, MM, 0];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `100px ${font}`;
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
      ctx.font = `${size * (1 + r * 0.05)}px ${font}`;
      ctx.fillText(b.key, 0, 0);
    });
    const img = ctx.getImageData(0, 0, W, H);
    for (const b of boxes) { const v = extractBox(img, T, b); if (v) out.push(v); }
    await new Promise((ok) => setTimeout(ok)); // keep the UI responsive; requestAnimationFrame never fires in a hidden tab
  }
  c.width = 0;
  return out;
}
