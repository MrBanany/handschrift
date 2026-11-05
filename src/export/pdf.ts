import { PDFDocument } from 'pdf-lib';

const PT_PER_MM = 72 / 25.4;

/**
 * Rendered pages (paper and ink in one PNG each) as a PDF with the exact page size, for importing into GoodNotes.
 * No hidden text layer: GoodNotes would let you select and copy typed letters instead of the handwriting.
 */
export async function toPdf(pngs: Blob[], wMm: number, hMm: number): Promise<Blob> {
  const doc = await PDFDocument.create();
  for (const b of pngs) {
    const img = await doc.embedPng(await b.arrayBuffer());
    const page = doc.addPage([wMm * PT_PER_MM, hMm * PT_PER_MM]);
    page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  return new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' });
}
