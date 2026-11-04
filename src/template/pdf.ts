import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  CODE_BITS, CODE_SIZE, GUIDES, MARKS, MARK_SIZE, PAGE, TEMPLATE_PAGES, pageCode,
} from './layout';

const PT = 72 / 25.4;
// Guides are light enough (luminance > 185) to be dropped by the ink threshold.
const GUIDE = rgb(0.62, 0.8, 0.95);
const FAINT = rgb(0.8, 0.89, 0.97);
const BORDER = rgb(0.75, 0.8, 0.86);

export async function buildTemplatePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const total = TEMPLATE_PAGES.length;

  TEMPLATE_PAGES.forEach((boxes, p) => {
    const page = doc.addPage([PAGE.w * PT, PAGE.h * PT]);
    const X = (mm: number) => mm * PT;
    const Y = (mm: number) => (PAGE.h - mm) * PT;
    const line = (x1: number, y1: number, x2: number, y2: number, color = GUIDE, t = 0.6, dash?: number[]) =>
      page.drawLine({ start: { x: X(x1), y: Y(y1) }, end: { x: X(x2), y: Y(y2) }, thickness: t, color, dashArray: dash });
    const square = (cx: number, cy: number, s: number) =>
      page.drawRectangle({ x: X(cx - s / 2), y: Y(cy + s / 2), width: s * PT, height: s * PT, color: rgb(0, 0, 0) });

    for (const [cx, cy] of MARKS) square(cx, cy, MARK_SIZE);
    const code = pageCode(p);
    CODE_BITS.forEach(([cx, cy], i) => { if (code & (1 << i)) square(cx, cy, CODE_SIZE); });

    page.drawText(`Handschrift-Vorlage  ·  Seite ${p + 1} von ${total}  ·  schwarz oder dunkelblau schreiben, auf der Grundlinie`, {
      x: X(20), y: Y(13.2), size: 8, font, color: rgb(0.4, 0.4, 0.4),
    });

    for (const b of boxes) {
      page.drawRectangle({ x: X(b.x), y: Y(b.y + b.h), width: b.w * PT, height: b.h * PT, borderColor: BORDER, borderWidth: 0.5 });
      line(b.x, b.y + GUIDES.asc, b.x + b.w, b.y + GUIDES.asc, FAINT, 0.4, [2, 2]);
      line(b.x, b.y + GUIDES.xh, b.x + b.w, b.y + GUIDES.xh, GUIDE, 0.5, [3, 2]);
      line(b.x, b.y + GUIDES.base, b.x + b.w, b.y + GUIDES.base, GUIDE, 0.8);
      line(b.x, b.y + GUIDES.desc, b.x + b.w, b.y + GUIDES.desc, FAINT, 0.4, [2, 2]);
      page.drawText(b.key, { x: X(b.x + 0.6), y: Y(b.y - 1), size: 7, font, color: rgb(0.3, 0.3, 0.3) });
    }
  });
  return doc.save();
}
