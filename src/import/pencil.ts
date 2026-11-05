import { MM, PAGE, TEMPLATE_PAGES } from '../template/layout';
import { buildTemplatePdf } from '../template/pdf';
import { pagesOf } from './load';

/** A pen stroke in template pixels (MM px/mm): x, y, width per point. */
type Stroke = number[];
const INK = '#15151c';

// Kept until the app is closed, so the sheet can be left and continued.
const strokes = TEMPLATE_PAGES.map((): Stroke[] => []);
let page = 0, zoom = 1, penSeen = false;

async function templatePage(p: number): Promise<ImageData> {
  const pdf = await buildTemplatePdf(p);
  for await (const { img } of pagesOf(new File([pdf as BlobPart], 'vorlage.pdf', { type: 'application/pdf' }))) return img;
  throw new Error('Vorlage konnte nicht erzeugt werden.');
}

function paint(ctx: CanvasRenderingContext2D, s: Stroke, from = 0) {
  ctx.strokeStyle = ctx.fillStyle = INK;
  ctx.lineCap = ctx.lineJoin = 'round';
  if (s.length === 3) { ctx.beginPath(); ctx.arc(s[0], s[1], s[2] / 2, 0, 2 * Math.PI); ctx.fill(); return; }
  for (let i = Math.max(3, from); i < s.length; i += 3) {
    ctx.lineWidth = (s[i - 1] + s[i + 2]) / 2;
    ctx.beginPath(); ctx.moveTo(s[i - 3], s[i - 2]); ctx.lineTo(s[i], s[i + 1]); ctx.stroke();
  }
}

/** Every page that has writing on it, as the template with the strokes on top (one page in memory at a time). */
async function* written(): AsyncGenerator<{ img: ImageData }> {
  for (let p = 0; p < strokes.length; p++) {
    if (!strokes[p].length) continue;
    const bg = await templatePage(p);
    const c = document.createElement('canvas');
    c.width = bg.width; c.height = bg.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.putImageData(bg, 0, 0);
    for (const s of strokes[p]) paint(ctx, s);
    yield { img: ctx.getImageData(0, 0, c.width, c.height) };
    c.width = 0;
  }
}

/**
 * Fill in the template right here with the Apple Pencil (or mouse / finger), then import it like an exported PDF.
 * Pen draws and a finger moves the page; without a pen one finger draws and two fingers move.
 */
export function setupPencil(onImport: (pages: AsyncIterable<{ img: ImageData }>) => Promise<boolean>, toast: (m: string) => void) {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const overlay = $('pencil'), scroller = $('pencilScroll'), canvas = $<HTMLCanvasElement>('pencilCanvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = PAGE.w * MM; canvas.height = PAGE.h * MM; // page-sized while the first page renders
  let bg: ImageData | null = null;

  const fit = () => { canvas.style.width = `${scroller.clientWidth * zoom}px`; };
  const redraw = () => { if (!bg) return; ctx.putImageData(bg, 0, 0); for (const s of strokes[page]) paint(ctx, s); };
  async function show(p: number) {
    page = p;
    $('pencilPage').textContent = `Seite ${p + 1} von ${strokes.length}`;
    $<HTMLButtonElement>('pencilPrev').disabled = p === 0;
    $<HTMLButtonElement>('pencilNext').disabled = p === strokes.length - 1;
    bg = null;
    const img = await templatePage(p);
    if (page !== p) return; // flipped on meanwhile
    canvas.width = img.width; canvas.height = img.height;
    bg = img;
    redraw();
  }

  $('pencilOpen').onclick = () => {
    overlay.hidden = false;
    fit();
    void show(page);
    toast('Mit dem Pencil in die Kästchen schreiben – mit dem Finger verschiebst du die Seite.');
  };
  $('pencilClose').onclick = () => { overlay.hidden = true; };
  $('pencilPrev').onclick = () => void show(page - 1);
  $('pencilNext').onclick = () => void show(page + 1);
  $('pencilUndo').onclick = () => { strokes[page].pop(); redraw(); };
  $('pencilZoom').onclick = (e) => {
    const top = scroller.scrollTop / scroller.scrollHeight, left = scroller.scrollLeft / scroller.scrollWidth;
    zoom = zoom === 1 ? 2.5 : 1;
    (e.target as HTMLElement).textContent = zoom === 1 ? 'Größer' : 'Kleiner';
    fit();
    scroller.scrollTop = top * scroller.scrollHeight; scroller.scrollLeft = left * scroller.scrollWidth;
  };
  $('pencilDone').onclick = async () => {
    if (!strokes.some((s) => s.length)) { toast('Noch nichts geschrieben.'); return; }
    overlay.hidden = true;
    if (await onImport(written())) strokes.forEach((s) => (s.length = 0));
  };
  addEventListener('resize', () => { if (!overlay.hidden) fit(); });

  // ---------- input ----------
  const touches = new Map<number, { x: number; y: number }>();
  let drawing: { id: number; s: Stroke } | null = null;
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
    // ~0.5 mm pen like on paper; mouse and finger report pressure 0.5 (or 0 for some pens at touch-down).
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k, (0.3 + 0.45 * (e.pressure || 0.5)) * MM];
  };
  const pan = () => {
    const pts = [...touches.values()];
    return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
  };
  let panAt: { x: number; y: number } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (!bg) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    if (e.pointerType === 'pen') penSeen = true;
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (penSeen || touches.size > 1) {
        if (drawing && touches.has(drawing.id)) { strokes[page].pop(); drawing = null; redraw(); } // first finger began a pan, not a line
        panAt = pan();
        return;
      }
    }
    if (drawing) return;
    drawing = { id: e.pointerId, s: at(e) };
    strokes[page].push(drawing.s);
    paint(ctx, drawing.s);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // A palm resting while the pen writes must not move the page.
      if (panAt && !drawing) { const p = pan(); scroller.scrollLeft -= p.x - panAt.x; scroller.scrollTop -= p.y - panAt.y; panAt = p; return; }
    }
    if (!drawing || drawing.id !== e.pointerId) return;
    const from = drawing.s.length;
    const all = e.getCoalescedEvents?.() ?? []; // finer pen path where supported; can be empty
    for (const c of all.length ? all : [e]) drawing.s.push(...at(c));
    paint(ctx, drawing.s, from);
  });
  const end = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    panAt = touches.size ? pan() : null;
    if (drawing?.id === e.pointerId) drawing = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}
