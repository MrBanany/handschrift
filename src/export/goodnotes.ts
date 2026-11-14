// Writes a .goodnotes file whose writing is real GoodNotes ink (ballpoint strokes): erasable, lasso-movable.
// The format is undocumented. Field layout after InkLift's notes (https://github.com/yellowHatpro/InkLift,
// docs/goodnotes-format.md, MIT); a GoodNotes update may break it.
import { PDFDocument, rgb } from 'pdf-lib';
import type { Background } from '../renderer/draw';
import type { Page } from '../renderer/layout';
import type { Variant } from '../glyphstore/types';
import { components, zhangSuen } from '../segmentation/analyze';
import { ATTACHMENT_UUID, PAGE_UUID, TEMPLATE } from './goodnotes-template';

/** The template's page (its background PDF is 455.04 x 588.45 pt), in mm: lay the text out on this size. */
export const GN_PAGE = { w: (455.04 * 25.4) / 72, h: (588.45 * 25.4) / 72 };
const GN_PER_MM = 132 / 25.4; // GoodNotes units per PDF point are 132/72
const BALLPOINT = 24;
const DEVICE_TAG = 1184897455800006800n, APP_TAG = 5381; // opaque constants from files GoodNotes wrote

type Pt = [number, number];
export interface InkStroke { pts: Pt[]; w: number; accent?: boolean } // mm

// ---------- glyph bitmap -> centre lines ----------

const N8: Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]]; // straight ones first

/**
 * Centre lines of an ink bitmap (glyph px): thinned to a 1-px skeleton, then walked from the line ends.
 * w: the ink width along each line (glyph px), measured on the bitmap: a dot is as wide as it is, not as the pen.
 */
export function centerlines(alpha: Uint8Array, w: number, h: number): { pts: Pt[]; w: number }[] {
  const bin = alpha.map((a) => (a >= 110 ? 1 : 0));
  const sk = zhangSuen(bin, w, h);
  // thinning can erase a perfectly round blob (a dot) completely: keep its middle pixel
  const { labels, comps } = components(bin, w, h);
  const sums = comps.map(() => ({ x: 0, y: 0, n: 0, has: false }));
  labels.forEach((l, i) => { if (l >= 0) { const c = sums[l]; c.x += i % w; c.y += (i / w) | 0; c.n++; if (sk[i]) c.has = true; } });
  for (const c of sums) if (!c.has) sk[Math.round(c.y / c.n) * w + Math.round(c.x / c.n)] = 1;
  /** Distance from an ink pixel to the nearest background pixel centre (the picture's edge counts as background). */
  const edge = (x: number, y: number) => {
    let best = Infinity;
    for (let r = 1; r <= best; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !bin[ny * w + nx]) best = Math.min(best, Math.hypot(dx, dy));
      }
    }
    return best;
  };
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x] === 1;
  const nbs = (i: number) => {
    const x = i % w, y = (i / w) | 0, out: number[] = [];
    for (const [dx, dy] of N8) if (on(x + dx, y + dy)) out.push((y + dy) * w + x + dx);
    return out;
  };
  const seen = new Uint8Array(w * h), paths: { pts: Pt[]; w: number }[] = [];
  const walk = (start: number) => {
    const path = [start];
    let joined = false;
    seen[start] = 1;
    let cur = start, prev = -1;
    for (;;) {
      const free = nbs(cur).filter((n) => !seen[n]);
      if (!free.length) {
        // reached a part already drawn (a junction or the start of a loop): join it, so there is no gap
        const join = nbs(cur).find((n) => n !== prev && !path.slice(-4).includes(n));
        if (join !== undefined) { path.push(join); joined = true; }
        break;
      }
      // keep going in the same direction at forks
      const px = cur % w - (prev < 0 ? cur % w : prev % w), py = ((cur / w) | 0) - (prev < 0 ? (cur / w) | 0 : (prev / w) | 0);
      const next = free.reduce((b, n) => ((n % w - cur % w) * px + (((n / w) | 0) - ((cur / w) | 0)) * py > (b % w - cur % w) * px + (((b / w) | 0) - ((cur / w) | 0)) * py ? n : b));
      seen[next] = 1;
      path.push(next);
      prev = cur; cur = next;
    }
    // -0.5: the soft edge of the picture (alpha below the threshold) still shows, ink area then matches the PNG within ~5 %
    const wid = Math.max(1, (2 * path.reduce((sum, i) => sum + edge(i % w, (i / w) | 0), 0)) / path.length - 0.5);
    if (joined && path.length < 1.5 * wid + 1) return; // a thinning spur at a junction, not a stroke
    paths.push({ pts: path.map((i) => [i % w + 0.5, ((i / w) | 0) + 0.5]), w: wid });
  };
  const pix: number[] = [];
  for (let i = 0; i < sk.length; i++) if (sk[i]) pix.push(i);
  for (const i of pix) if (!seen[i] && nbs(i).length === 1) walk(i); // line ends first
  for (const i of pix) if (!seen[i]) walk(i); // closed loops (o, 0) and dots
  return paths.map((p) => ({ pts: simplify(smooth(p.pts), 0.7), w: p.w }));
}

/** Smooth the pixel staircase of a skeleton path (1-2-1 average, twice), ends stay where they are. */
function smooth(p: Pt[]): Pt[] {
  let q = p;
  for (let pass = 0; pass < 2; pass++) {
    q = q.map((pt, i) => (i === 0 || i === q.length - 1 ? pt : [(q[i - 1][0] + 2 * pt[0] + q[i + 1][0]) / 4, (q[i - 1][1] + 2 * pt[1] + q[i + 1][1]) / 4]));
  }
  return q;
}

/** Ramer-Douglas-Peucker: drop points closer than eps to the line through their neighbours. */
function simplify(p: Pt[], eps: number): Pt[] {
  if (p.length < 3) return p;
  const [a, b] = [p[0], p[p.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); // 0 for a closed loop
  let far = 0, at = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const d = l > 1e-9 ? Math.abs(dy * (p[i][0] - a[0]) - dx * (p[i][1] - a[1])) / l : Math.hypot(p[i][0] - a[0], p[i][1] - a[1]);
    if (d > far) { far = d; at = i; }
  }
  return far <= eps ? [a, b] : [...simplify(p.slice(0, at + 1), eps).slice(0, -1), ...simplify(p.slice(at), eps)];
}

// keyed by the bitmap itself: box ids repeat across handwriting sets
const lineCache = new WeakMap<Uint8Array, { pts: Pt[]; w: number }[]>();
/** Centre lines of a glyph (glyph px), made once per bitmap. Also what the picture is drawn from (renderer/draw). */
export function glyphLines(v: Variant) {
  if (!lineCache.has(v.alpha)) lineCache.set(v.alpha, centerlines(v.alpha, v.w, v.h));
  return lineCache.get(v.alpha)!;
}

/** Every pen stroke on a laid-out page, in page mm. weight: the "Strichstärke" setting, as in the picture (draw.ts) 0.1 mm wider per step. */
export function inkStrokes(page: Page, get: (src: string) => Variant, weight = 0): InkStroke[] {
  const out: InkStroke[] = [], extra = 0.1 * weight;
  for (const { g, m, accent } of page.glyphs) {
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    for (const line of glyphLines(get(g.src))) {
      out.push({ pts: line.pts.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]), w: line.w * k + extra, accent });
    }
  }
  for (const c of page.connectors) {
    const [p0, p1, p2, p3] = c.p, pts: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
    out.push({ pts, w: (c.w0 + c.w1) / 2 + extra, accent: c.accent });
  }
  return out;
}

// ---------- bytes ----------

class Proto {
  b: number[] = [];
  static varint(v: number | bigint, out: number[] = []) {
    let x = BigInt(v);
    do { const byte = Number(x & 0x7fn); x >>= 7n; out.push(x ? byte | 0x80 : byte); } while (x);
    return out;
  }
  private key(f: number, wire: number) { Proto.varint((f << 3) | wire, this.b); }
  varint(f: number, v: number | bigint) { this.key(f, 0); Proto.varint(v, this.b); return this; }
  bytes(f: number, v: ArrayLike<number>) { this.key(f, 2); Proto.varint(v.length, this.b); for (let i = 0; i < v.length; i++) this.b.push(v[i]); return this; }
  string(f: number, s: string) { return this.bytes(f, new TextEncoder().encode(s)); }
  msg(f: number, p: Proto) { return this.bytes(f, p.b); }
  float(f: number, v: number) { this.key(f, 5); this.b.push(...new Uint8Array(new Float32Array([v]).buffer)); return this; }
  /** As a length-prefixed record of a stream. */
  record() { return [...Proto.varint(this.b.length), ...this.b]; }
}

const le = (n: number, v: number) => Array.from({ length: n }, (_, i) => (v >>> (8 * i)) & 0xff); // little-endian
const f32 = (v: number) => [...new Uint8Array(new Float32Array([v]).buffer)];

/** TPL image of a ballpoint stroke: "vuA(v)A(S(uu))A(S(uuuu))vA(f)" – width, start point, then point pairs. */
export function tpl(width: number, pts: Pt[]): number[] {
  const format = [...new TextEncoder().encode('vuA(v)A(S(uu))A(S(uuuu))vA(f)'), 0];
  const rest = pts.slice(1);
  if (rest.length % 2) rest.push(rest[rest.length - 1]);
  const quads = rest.length / 2, body: number[] = [];
  body.push(...le(2, 2), ...f32(width), ...le(4, quads + 1), ...le(2, 0));
  for (let i = 0; i < quads; i++) body.push(...le(2, 1));
  body.push(...le(4, 1), ...f32(pts[0][0]), ...f32(pts[0][1]), ...le(4, quads));
  for (const [x, y] of rest) body.push(...f32(x), ...f32(y));
  body.push(...le(2, 1), ...le(4, 0));
  return [...new TextEncoder().encode('tpl'), 0, ...le(4, 8 + format.length + body.length), ...format, ...body];
}

/** One LZ4 block (greedy matching, 4-byte hash table). Ends like the spec asks: last match starts >= 12 and ends >= 5 bytes before the end. */
function lz4Block(src: Uint8Array): number[] {
  const n = src.length, out: number[] = [], table = new Int32Array(1 << 14).fill(-1);
  const len = (r: number) => { for (; r >= 255; r -= 255) out.push(255); out.push(r); };
  const seq = (from: number, to: number, mlen = 0, off = 0) => {
    const ll = to - from, ml = mlen ? mlen - 4 : 0;
    out.push((Math.min(ll, 15) << 4) | Math.min(ml, 15));
    if (ll >= 15) len(ll - 15);
    for (let k = from; k < to; k++) out.push(src[k]);
    if (!mlen) return;
    out.push(off & 255, off >> 8);
    if (ml >= 15) len(ml - 15);
  };
  let anchor = 0, i = 0;
  while (i < n - 11) {
    const v = src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24), h = Math.imul(v, -1640531535) >>> 18;
    const ref = table[h];
    table[h] = i;
    if (ref < 0 || i - ref > 65535 || (src[ref] | (src[ref + 1] << 8) | (src[ref + 2] << 16) | (src[ref + 3] << 24)) !== v) { i++; continue; }
    let m = 4;
    while (i + m < n - 5 && src[ref + m] === src[i + m]) m++;
    seq(anchor, i, m, i - ref);
    i += m; anchor = i;
  }
  seq(anchor, n);
  return out;
}

/** Apple's framed LZ4 ("bv41" blocks of up to 32 KB, each decodable on its own; "bv4$" end). */
export function appleLz4(data: ArrayLike<number>): number[] {
  const all = Uint8Array.from(data as ArrayLike<number>), out: number[] = [], magic = (s: string) => [...new TextEncoder().encode(s)];
  for (let at = 0; at < all.length; at += 32768) {
    const chunk = all.subarray(at, at + 32768), block = lz4Block(chunk);
    out.push(...magic('bv41'), ...le(4, chunk.length), ...le(4, block.length));
    for (const b of block) out.push(b);
  }
  return [...out, ...magic('bv4$')];
}

let counter = 3_653_600;
function strokeRecords(s: InkStroke, rgba: number[]): number[] {
  // connectors come as 13 curve samples: drop the ones within 0.15 GN units (0.03 mm) of the line between their neighbours
  const pts = simplify(s.pts.map(([x, y]): Pt => [x * GN_PER_MM, y * GN_PER_MM]), 0.15);
  if (pts.length === 1) pts.push([pts[0][0] + 0.01, pts[0][1] + 0.01]); // a dot
  const uuid = crypto.randomUUID().toUpperCase(), n = ++counter;
  const clock = new Proto().varint(1, 2).varint(2, (Math.random() * 2 ** 32) >>> 0);
  const meta = new Proto().string(1, uuid).msg(2, clock).string(6, crypto.randomUUID().toUpperCase())
    .varint(8, DEVICE_TAG).varint(9, n).varint(14, APP_TAG).varint(16, BALLPOINT);
  const color = new Proto();
  rgba.forEach((v, i) => color.float(i + 1, v));
  const stamp = new Proto().msg(1, new Proto().varint(1, n).varint(2, Date.now()));
  const inner = new Proto().string(1, uuid).bytes(2, appleLz4(tpl(Math.max(0.5, s.w * GN_PER_MM), pts))).msg(4, color)
    .bytes(6, []).msg(7, stamp).bytes(9, []).msg(15, clock).bytes(20, []).varint(21, BALLPOINT);
  return [...meta.record(), ...new Proto().msg(7, inner).record()];
}

// ---------- zip (deflate, like GoodNotes' own files; stored where that does not help) ----------

const CRC = Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (const b of d) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

async function deflate(d: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null; // very old browsers: store the entry
  return new Uint8Array(await new Response(new Blob([d as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}

export async function zip(files: [string, Uint8Array][]): Promise<Uint8Array> {
  const body: number[] = [], central: number[] = [];
  for (const [name, data] of files) {
    const nm = [...new TextEncoder().encode(name)], crc = crc32(data), off = body.length;
    const z = data.length > 64 ? await deflate(data) : null, packed = z && z.length < data.length ? z : data;
    const head = [...le(2, 20), ...le(2, 0x0800), ...le(2, packed === data ? 0 : 8), ...le(2, 0), ...le(2, 0), ...le(4, crc), ...le(4, packed.length), ...le(4, data.length), ...le(2, nm.length), ...le(2, 0)];
    body.push(...le(4, 0x04034b50), ...head, ...nm);
    for (const b of packed) body.push(b);
    central.push(...le(4, 0x02014b50), ...le(2, 20), ...head, ...le(2, 0), ...le(2, 0), ...le(2, 0), ...le(4, 0), ...le(4, off), ...nm);
  }
  const end = [...le(4, 0x06054b50), ...le(2, 0), ...le(2, 0), ...le(2, files.length), ...le(2, files.length), ...le(4, central.length), ...le(4, body.length), ...le(2, 0)];
  return new Uint8Array([...body, ...central, ...end]);
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// ---------- background PDF ----------

/**
 * The page's paper as a vector PDF on GN_PAGE: ruled or squared like drawPage (draw.ts) paints it, same colours and spacing,
 * so the lines sit exactly on the baselines of the laid-out text. margin: the one the text was laid out with.
 */
export async function backgroundPdf(kind: Background, lineH: number, margin: number): Promise<Uint8Array> {
  const pt = 72 / 25.4, W = GN_PAGE.w, H = GN_PAGE.h, doc = await PDFDocument.create(), page = doc.addPage([455.04, 588.45]);
  const line = (x0: number, y0: number, x1: number, y1: number, hex: string) => page.drawLine({
    start: { x: x0 * pt, y: page.getHeight() - y0 * pt }, end: { x: x1 * pt, y: page.getHeight() - y1 * pt }, thickness: 0.15 * pt,
    color: rgb(...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number])),
  });
  if (kind === 'lined') for (let y = margin + lineH; y <= H - margin + 0.01; y += lineH) line(0, y, W, y, '#b9cde0');
  if (kind === 'grid') {
    const cell = lineH / 2, first = (phase: number) => phase + Math.ceil(-phase / cell) * cell; // every baseline falls on a grid line
    for (let x = first(margin); x < W; x += cell) line(x, 0, x, H, '#d6e2ed');
    for (let y = first(margin + lineH); y < H; y += cell) line(0, y, W, y, '#d6e2ed');
  }
  return doc.save({ useObjectStreams: false }); // a plain cross-reference table, like the paper PDFs in GoodNotes' own files
}

// ---------- event log: the attachment's byte size ----------

interface Field { f: number; w: number; v: Uint8Array } // v: the payload of a length-delimited field, else the raw value bytes
function parseFields(b: Uint8Array): Field[] {
  const out: Field[] = [];
  let at = 0;
  const varint = () => { let x = 0, m = 1; for (;;) { const c = b[at++]; x += (c & 127) * m; m *= 128; if (c < 128) return x; } };
  while (at < b.length) {
    const k = varint(), w = k & 7;
    let st = at;
    if (w === 0) varint(); else if (w === 5) at += 4; else if (w === 1) at += 8; else if (w === 2) { const l = varint(); st = at; at += l; } else throw new Error(`wire ${w}`);
    out.push({ f: k >> 3, w, v: b.subarray(st, at) });
  }
  return out;
}
const encodeFields = (fs: Field[]) => fs.flatMap(({ f, w, v }) => [...Proto.varint((f << 3) | w), ...(w === 2 ? Proto.varint(v.length) : []), ...v]);

/**
 * The template's event log says how many bytes the background attachment has (f6 "attachment added", f5 = 41951 = the dot grid's size).
 * Write the size of our PDF there; the log is a stream of length-prefixed events.
 */
export function withAttachmentSize(events: Uint8Array, size: number): Uint8Array {
  const out: number[] = [];
  for (let at = 0; at < events.length;) {
    let l = 0, m = 1;
    for (;;) { const c = events[at++]; l += (c & 127) * m; m *= 128; if (c < 128) break; }
    let ev = parseFields(events.subarray(at, at + l));
    at += l;
    ev = ev.map((e) => (e.f === 6 && e.w === 2 ? { ...e, v: Uint8Array.from(encodeFields(parseFields(e.v).map((x) => (x.f === 5 && x.w === 0 ? { ...x, v: Uint8Array.from(Proto.varint(size)) } : x)))) } : e));
    const body = encodeFields(ev);
    out.push(...Proto.varint(body.length), ...body);
  }
  return new Uint8Array(out);
}

/**
 * Fresh ids for one export. The template's ids (document, page, attachment, events) are the same in every file we write;
 * GoodNotes keeps attachments and page renderings by id, so a second import with other paper could be shown with the first one's.
 * Every file GoodNotes writes itself has ids of its own. The paper's name ("<uuid>_standard_1_2 - White") keeps its uuid.
 */
// Not ours to renew: the same in every reference file (document event f3/f7, and the "PagingViewServiceUpdater:" name).
const SHARED_IDS = ['5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E', 'E1940363-20DF-415F-9D75-9F6BC464911B'];
function freshIds() {
  // GoodNotes finds a page's ink by id alone: notes id = page id + 1 (so in all five pages of the four reference files,
  // no event links the two). Two unrelated ids left the page without its writing. The pair gets one new id, ending in 0 and 1.
  const pair = crypto.randomUUID().toUpperCase().slice(0, -1);
  const ids = new Map<string, string>([[PAGE_UUID.slice(0, -1) + '0', pair + '0'], [PAGE_UUID, pair + '1']]);
  const id = (u: string) => (SHARED_IDS.includes(u) ? u : ids.get(u) ?? (ids.set(u, crypto.randomUUID().toUpperCase()), ids.get(u)!));
  const swap = (b: Uint8Array) => Uint8Array.from(String.fromCharCode(...b).replace(/[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}(?!_)/g, id), (c) => c.charCodeAt(0));
  return { id, swap };
}

/** One page as a .goodnotes document (page laid out on GN_PAGE). ink, head (headings): '#rrggbb'. background: PDF of GN_PAGE size (backgroundPdf), else the template's dot grid. */
export function goodnotesFile(page: Page, get: (src: string) => Variant, ink: string, thumbnail?: Uint8Array, head = ink, weight = 0, background?: Uint8Array): Promise<Uint8Array> {
  const rgbaOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(1);
  const rgba = rgbaOf(ink), rgbaHead = rgbaOf(head);
  const notes: number[] = [];
  for (const s of inkStrokes(page, get, weight)) if (s.pts.length) notes.push(...strokeRecords(s, s.accent ? rgbaHead : rgba));
  const { id, swap } = freshIds(), pageId = id(PAGE_UUID), attId = id(ATTACHMENT_UUID);
  return zip([
    ['document.info.pb', new Uint8Array()],
    ['index.search.pb', swap(b64(TEMPLATE.search))],
    ['index.notes.pb', swap(b64(TEMPLATE.notes))],
    [`search/${pageId}`, new Uint8Array([0x04, 0x10, 0x01, 0x1a, 0x00])],
    [`search/${attId}`, b64(TEMPLATE.attSearch)],
    [`notes/${pageId}`, new Uint8Array(notes)],
    ['index.events.pb', swap(background ? withAttachmentSize(b64(TEMPLATE.events), background.length) : b64(TEMPLATE.events))],
    ...(thumbnail ? [['thumbnail.jpg', thumbnail] as [string, Uint8Array]] : []),
    ['index.attachments.pb', swap(b64(TEMPLATE.attachments))],
    [`attachments/${attId}`, background ?? b64(TEMPLATE.background)],
    ['schema.pb', b64(TEMPLATE.schema)],
  ]);
}
