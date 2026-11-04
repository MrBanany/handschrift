import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  CODE_BITS, CODE_SIZE, GUIDES, MARKS, MARK_SIZE, PAGE, TEMPLATE_PAGES, XH, pageCode,
} from './layout';

const PT = 72 / 25.4;
// Guides are light enough (luminance > 185) to be dropped by the ink threshold.
const GUIDE = rgb(0.62, 0.8, 0.95);
const FAINT = rgb(0.8, 0.89, 0.97);
const BORDER = rgb(0.75, 0.8, 0.86);
// Trace-over letter: luminance ~222, far above the ink threshold (180), so it never ends up in a sample.
const GHOST = rgb(0.87, 0.87, 0.87);
const TEXT = rgb(0.18, 0.2, 0.25);
const MUTED = rgb(0.45, 0.47, 0.52);
const HELVETICA_XH = 0.523; // x-height per em
// Dark text must stay this far (mm) from the corner marks, or it shifts their detected centre (see register.ts).
const HEAD_X0 = 30, HEAD_X1 = 180;

export async function buildTemplatePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const total = TEMPLATE_PAGES.length;
  const ghostSize = (XH * PT) / HELVETICA_XH; // small letters exactly fill the x-height band
  let prevKey = '';

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

    page.drawText('Handschrift-Vorlage', { x: X(HEAD_X0), y: Y(12.6), size: 13, font: bold, color: TEXT });
    const pageNo = `Seite ${p + 1} von ${total}`;
    page.drawText(pageNo, { x: X(HEAD_X1) - font.widthOfTextAtSize(pageNo, 9), y: Y(12.6), size: 9, font, color: MUTED });
    page.drawText(
      p === 0
        ? 'Schwarz oder dunkelblau, auf die durchgezogene Linie. Der graue Buchstabe zeigt nur die Größe – schreib in deiner Art darüber.'
        : 'Schwarz oder dunkelblau, auf die durchgezogene Linie. Leere Kästchen sind in Ordnung.',
      { x: X(HEAD_X0), y: Y(17.6), size: 7, font, color: MUTED, maxWidth: (HEAD_X1 - HEAD_X0) * PT },
    );

    for (const b of boxes) {
      page.drawRectangle({ x: X(b.x), y: Y(b.y + b.h), width: b.w * PT, height: b.h * PT, borderColor: BORDER, borderWidth: 0.5 });
      // Only the first box of each character gets the grey letter: the others stay free, so the variants differ like real writing.
      if (b.key !== prevKey) {
        const w = font.widthOfTextAtSize(b.key, ghostSize);
        page.drawText(b.key, { x: X(b.x + b.w / 2) - w / 2, y: Y(b.y + GUIDES.base), size: ghostSize, font, color: GHOST });
      }
      prevKey = b.key;
      line(b.x, b.y + GUIDES.asc, b.x + b.w, b.y + GUIDES.asc, FAINT, 0.4, [2, 2]);
      line(b.x, b.y + GUIDES.xh, b.x + b.w, b.y + GUIDES.xh, GUIDE, 0.5, [3, 2]);
      line(b.x, b.y + GUIDES.base, b.x + b.w, b.y + GUIDES.base, GUIDE, 0.8);
      line(b.x, b.y + GUIDES.desc, b.x + b.w, b.y + GUIDES.desc, FAINT, 0.4, [2, 2]);
      page.drawText(b.key, { x: X(b.x + 0.6), y: Y(b.y - 1), size: 7, font, color: rgb(0.3, 0.3, 0.3) });
    }
  });
  return doc.save();
}
