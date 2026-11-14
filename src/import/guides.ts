import { SYMBOLS } from '../glyphstore/symbols';
import { GUIDES, XH } from '../template/layout';

/**
 * Writing guides for one template box, for the screen only: the image that gets cut out never contains them.
 * Same GUIDES the extraction measures the baseline from. x, y, w in canvas px, k = canvas px per mm.
 * ghost: a faint example letter sitting on the baseline (skipped for drawn symbols such as arrows).
 */
export function drawGuides(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, k: number, ghost?: string) {
  const at = (mm: number) => y + mm * k;
  ctx.save();
  ctx.fillStyle = 'rgba(53, 80, 200, 0.07)'; // x-height band: where a, n, o live
  ctx.fillRect(x, at(GUIDES.xh), w, XH * k);
  if (ghost && !SYMBOLS[ghost]) {
    ctx.fillStyle = '#dfe2ea';
    ctx.textAlign = 'center';
    ctx.font = `${XH * k / 0.523}px Helvetica, Arial, sans-serif`; // Helvetica x-height is 0.523 em: small letters fill the band
    ctx.fillText(ghost, x + w / 2, at(GUIDES.base), w - k);
  }
  const line = (mm: number, color: string, width: number, dash: number[]) => {
    ctx.strokeStyle = color; ctx.lineWidth = width * k; ctx.setLineDash(dash.map((d) => d * k));
    ctx.beginPath(); ctx.moveTo(x, at(mm)); ctx.lineTo(x + w, at(mm)); ctx.stroke();
  };
  line(GUIDES.asc, '#a3adc2', 0.15, [0.6, 0.6]);
  line(GUIDES.desc, '#a3adc2', 0.15, [0.6, 0.6]);
  line(GUIDES.xh, '#7088d8', 0.2, [1, 0.6]);
  line(GUIDES.base, '#3550c8', 0.4, []);
  ctx.restore();
}
