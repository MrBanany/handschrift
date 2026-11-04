import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { Line } from '../renderer/layout';

const PT_PER_MM = 72 / 25.4;

/**
 * Rendered pages (paper and ink in one PNG each) as a PDF with the exact page size, for importing into GoodNotes.
 * Each line's text sits invisibly under the handwriting, so the PDF can be searched and its text selected.
 */
export async function toPdf(pngs: Blob[], wMm: number, hMm: number, lines: Line[][] = []): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const encodable = (ch: string) => { try { font.encodeText(ch); return true; } catch { return false; } };
  for (const [i, b] of pngs.entries()) {
    const img = await doc.embedPng(await b.arrayBuffer());
    const page = doc.addPage([wMm * PT_PER_MM, hMm * PT_PER_MM]);
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    for (const l of lines[i] ?? []) {
      const text = [...l.text].map((ch) => (encodable(ch) ? ch : '?')).join('');
      const unit = font.widthOfTextAtSize(text, 1);
      if (!unit || l.w <= 0) continue;
      // Font size chosen so the text spans the written line; capped so a short word doesn't get a giant box.
      const size = Math.min((l.w * PT_PER_MM) / unit, 8 * PT_PER_MM);
      page.drawText(text, { x: l.x * PT_PER_MM, y: (hMm - l.y) * PT_PER_MM, size, font, opacity: 0 });
    }
  }
  return new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' });
}
