// Writes a .goodnotes file whose writing is real GoodNotes ink (ballpoint strokes): erasable, lasso-movable.
// The format is undocumented. Field layout after InkLift's notes (https://github.com/yellowHatpro/InkLift,
// docs/goodnotes-format.md, MIT); a GoodNotes update may break it.
import type { Page } from '../renderer/layout';
import type { Variant } from '../glyphstore/types';
import { zhangSuen } from '../segmentation/analyze';
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

/** Centre lines of an ink bitmap (glyph px): thinned to a 1-px skeleton, then walked from the line ends. */
export function centerlines(alpha: Uint8Array, w: number, h: number): Pt[][] {
  const sk = zhangSuen(alpha.map((a) => (a >= 110 ? 1 : 0)), w, h);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && sk[y * w + x] === 1;
  const nbs = (i: number) => {
    const x = i % w, y = (i / w) | 0, out: number[] = [];
    for (const [dx, dy] of N8) if (on(x + dx, y + dy)) out.push((y + dy) * w + x + dx);
    return out;
  };
  const seen = new Uint8Array(w * h), paths: Pt[][] = [];
  const walk = (start: number) => {
    const path = [start];
    seen[start] = 1;
    let cur = start, prev = -1;
    for (;;) {
      const free = nbs(cur).filter((n) => !seen[n]);
      if (!free.length) {
        // reached a part already drawn (a junction or the start of a loop): join it, so there is no gap
        const join = nbs(cur).find((n) => n !== prev && !path.slice(-4).includes(n));
        if (join !== undefined) path.push(join);
        break;
      }
      // keep going in the same direction at forks
      const px = cur % w - (prev < 0 ? cur % w : prev % w), py = ((cur / w) | 0) - (prev < 0 ? (cur / w) | 0 : (prev / w) | 0);
      const next = free.reduce((b, n) => ((n % w - cur % w) * px + (((n / w) | 0) - ((cur / w) | 0)) * py > (b % w - cur % w) * px + (((b / w) | 0) - ((cur / w) | 0)) * py ? n : b));
      seen[next] = 1;
      path.push(next);
      prev = cur; cur = next;
    }
    paths.push(path.map((i) => [i % w + 0.5, ((i / w) | 0) + 0.5]));
  };
  const pix: number[] = [];
  for (let i = 0; i < sk.length; i++) if (sk[i]) pix.push(i);
  for (const i of pix) if (!seen[i] && nbs(i).length === 1) walk(i); // line ends first
  for (const i of pix) if (!seen[i]) walk(i); // closed loops (o, 0) and dots
  return paths.map((p) => simplify(p, 0.7));
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

const lineCache = new Map<string, Pt[][]>();

/** Every pen stroke on a laid-out page, in page mm. */
export function inkStrokes(page: Page, get: (src: string) => Variant): InkStroke[] {
  const out: InkStroke[] = [];
  for (const { g, m, accent } of page.glyphs) {
    const v = get(g.src);
    if (!lineCache.has(g.src)) lineCache.set(g.src, centerlines(v.alpha, v.w, v.h));
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    for (const line of lineCache.get(g.src)!) {
      out.push({ pts: line.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]), w: g.strokeW * k, accent });
    }
  }
  for (const c of page.connectors) {
    const [p0, p1, p2, p3] = c.p, pts: Pt[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
    out.push({ pts, w: (c.w0 + c.w1) / 2, accent: c.accent });
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

/** Apple's framed LZ4 ("bv41" blocks, "bv4$" end). Literal-only blocks: valid LZ4, just not smaller. */
export function appleLz4(data: number[]): number[] {
  const out: number[] = [];
  for (let at = 0; at < data.length; at += 32768) {
    const chunk = data.slice(at, at + 32768), block: number[] = [];
    let n = chunk.length;
    block.push(Math.min(n, 15) << 4);
    if (n >= 15) { for (n -= 15; n >= 255; n -= 255) block.push(255); block.push(n); }
    for (const b of chunk) block.push(b);
    out.push(...new TextEncoder().encode('bv41'), ...le(4, chunk.length), ...le(4, block.length), ...block);
  }
  return [...out, ...new TextEncoder().encode('bv4$')];
}

let counter = 3_653_600;
function strokeRecords(s: InkStroke, rgba: number[]): number[] {
  const pts = s.pts.map(([x, y]): Pt => [x * GN_PER_MM, y * GN_PER_MM]);
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

// ---------- zip (stored entries) ----------

const CRC = Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (d: Uint8Array) => { let c = 0xffffffff; for (const b of d) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function zip(files: [string, Uint8Array][]): Uint8Array {
  const body: number[] = [], central: number[] = [];
  for (const [name, data] of files) {
    const nm = [...new TextEncoder().encode(name)], crc = crc32(data), off = body.length;
    const head = [...le(2, 20), ...le(2, 0x0800), ...le(2, 0), ...le(2, 0), ...le(2, 0), ...le(4, crc), ...le(4, data.length), ...le(4, data.length), ...le(2, nm.length), ...le(2, 0)];
    body.push(...le(4, 0x04034b50), ...head, ...nm);
    for (const b of data) body.push(b);
    central.push(...le(4, 0x02014b50), ...le(2, 20), ...head, ...le(2, 0), ...le(2, 0), ...le(2, 0), ...le(4, 0), ...le(4, off), ...nm);
  }
  const end = [...le(4, 0x06054b50), ...le(2, 0), ...le(2, 0), ...le(2, files.length), ...le(2, files.length), ...le(4, central.length), ...le(4, body.length), ...le(2, 0)];
  return new Uint8Array([...body, ...central, ...end]);
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** One page as a .goodnotes document (page laid out on GN_PAGE). ink, head (headings): '#rrggbb'. */
export function goodnotesFile(page: Page, get: (src: string) => Variant, ink: string, thumbnail?: Uint8Array, head = ink): Uint8Array {
  const rgbaOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).concat(1);
  const rgba = rgbaOf(ink), rgbaHead = rgbaOf(head);
  const notes: number[] = [];
  for (const s of inkStrokes(page, get)) if (s.pts.length) notes.push(...strokeRecords(s, s.accent ? rgbaHead : rgba));
  return zip([
    ['document.info.pb', new Uint8Array()],
    ['index.search.pb', b64(TEMPLATE.search)],
    ['index.notes.pb', b64(TEMPLATE.notes)],
    [`search/${PAGE_UUID}`, new Uint8Array([0x04, 0x10, 0x01, 0x1a, 0x00])],
    [`search/${ATTACHMENT_UUID}`, b64(TEMPLATE.attSearch)],
    [`notes/${PAGE_UUID}`, new Uint8Array(notes)],
    ['index.events.pb', b64(TEMPLATE.events)],
    ...(thumbnail ? [['thumbnail.jpg', thumbnail] as [string, Uint8Array]] : []),
    ['index.attachments.pb', b64(TEMPLATE.attachments)],
    [`attachments/${ATTACHMENT_UUID}`, b64(TEMPLATE.background)],
    ['schema.pb', b64(TEMPLATE.schema)],
  ]);
}
