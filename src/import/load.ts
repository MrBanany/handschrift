import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { MM, PAGE } from '../template/layout';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_TALL = 3; // tallest accepted picture, in page widths (A4 is 1.41)

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  return { c, ctx };
}

/**
 * Render each page of a PDF (or a single image) ~2100 px wide, one page at a time to spare memory.
 * pxPerMm is exact for PDFs; images are assumed to be A4 wide.
 */
export async function* pagesOf(file: File): AsyncGenerator<{ img: ImageData; pxPerMm: number }> {
  const W = PAGE.w * MM;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await task.promise.catch((e: Error) => {
      throw new Error(e.name === 'PasswordException' ? 'Die PDF ist passwortgeschützt – bitte ohne Passwort exportieren.' : 'Die Datei lässt sich nicht als PDF lesen (beschädigt oder keine PDF).');
    });
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const widthPt = page.getViewport({ scale: 1 }).width;
        const viewport = page.getViewport({ scale: W / widthPt });
        // a poster or a very long strip would need gigabytes
        if (viewport.height > MAX_TALL * W) throw new Error(`Seite ${i} hat kein Seitenformat wie DIN A4 (zu lang oder zu breit).`);
        const { c, ctx } = canvasOf(Math.round(viewport.width), Math.round(viewport.height));
        await page.render({ canvas: c, canvasContext: ctx, viewport }).promise;
        yield { img: ctx.getImageData(0, 0, c.width, c.height), pxPerMm: W / ((widthPt * 25.4) / 72) };
        c.width = 0;
      }
    } finally { await task.destroy(); }
  } else {
    // decoded straight at page width where the browser can: a 12-megapixel photo then never exists at full size
    const bmp = await createImageBitmap(file, { resizeWidth: W, resizeQuality: 'high' }).catch(() => createImageBitmap(file)).catch(() => {
      throw new Error('Das Bild lässt sich nicht lesen. Bitte als JPG oder PNG aufnehmen oder als PDF exportieren.');
    });
    const s = W / bmp.width;
    if (bmp.height * s > MAX_TALL * W) { bmp.close(); throw new Error('Das Bild ist viel länger als breit – bitte nur eine Seite der Vorlage fotografieren.'); }
    const { c, ctx } = canvasOf(W, Math.round(bmp.height * s));
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    yield { img: ctx.getImageData(0, 0, c.width, c.height), pxPerMm: MM };
    c.width = 0;
  }
}
