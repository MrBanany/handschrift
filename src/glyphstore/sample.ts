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
  return buildSampleSet(`"${x.family}"`, x.cursive ? 0.3 : 1);
}
// Handwriting-style fonts that ship with iPadOS, Android, Windows and macOS; nothing is bundled.
const FONT = '"Bradley Hand", "Segoe Print", "Ink Free", "Noteworthy", "Comic Sans MS", cursive';

/**
 * Builds a demo set on the device: fills the template virtually with a system handwriting font
 * (each box a little different) and cuts it out with the same code as a real import.
 */
/** wild: how uneven (0 = as the font draws it, 1 = full); joined-up writing needs its lead-in and lead-out strokes in place. */
export async function buildSampleSet(font = FONT, wild = 1): Promise<Variant[]> {
  const W = PAGE.w * MM, H = PAGE.h * MM, T: Affine = [MM, 0, 0, 0, MM, 0];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.font = `100px ${font}`;
  const size = (100 * XH * MM * 0.95) / (ctx.measureText('x').actualBoundingBoxAscent || 50); // x-height = template x-height
  const out: Variant[] = [];
  // One scratch canvas per letter: drawn there straight, then copied row by row with a small sideways wave (a hand's tremor)
  // and a random slant, size and lean, so no two boxes look printed. Fonts alone are too even to pass as handwriting.
  const g = document.createElement('canvas'), gc = g.getContext('2d')!;
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; }; // -1..1, same set every time
  for (const boxes of TEMPLATE_PAGES) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    for (const b of boxes) {
      const k = size * (1 + rnd() * 0.08 * wild);
      g.width = Math.ceil(b.w * MM); g.height = Math.ceil(b.h * MM);
      gc.setTransform(1, 0, 0, 1, 0, 0);
      gc.translate((2 + rnd() * 0.5 * wild) * MM, (GUIDES.base + rnd() * 0.3 * wild) * MM);
      gc.rotate(rnd() * 0.06 * wild);
      gc.transform(1 + rnd() * 0.06 * wild, 0, (-0.12 * rnd() - 0.05) * wild, 1 + rnd() * 0.06 * wild, 0, 0); // lean: mostly a little to the right
      gc.font = `${k}px ${font}`;
      gc.fillStyle = '#15151c';
      gc.fillText(b.key, 0, 0);
      const amp = (0.15 + 0.1 * Math.abs(rnd())) * MM * XH / 3 * wild, f = (1.5 + rnd()) / (XH * MM), ph = rnd() * 3;
      for (let y = 0; y < g.height; y++) ctx.drawImage(g, 0, y, g.width, 1, b.x * MM + amp * Math.sin(y * f + ph), b.y * MM + y, g.width, 1);
    }
    const img = { data: ctx.getImageData(0, 0, W, H).data, width: W, height: H }; // plain object: ImageData's getters, read per pixel in extractBox, cost most of the time
    for (const b of boxes) { const v = extractBox(img, T, b); if (v) out.push(v); }
    await new Promise((ok) => { const ch = new MessageChannel(); ch.port1.onmessage = ok; ch.port2.postMessage(0); }); // keep the UI responsive; setTimeout waits a second per page in a hidden tab, requestAnimationFrame never fires there
  }
  c.width = 0;
  return out;
}
