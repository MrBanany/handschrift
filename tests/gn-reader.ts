// A reader for .goodnotes files, independent of the writer in src/export/goodnotes.ts: ZIP (stored / deflate), protobuf
// without a schema, Apple's framed LZ4 and the TPL stroke image. Field numbers as in the reference files of
// https://github.com/Kaih1825/parser-for-goodnotes (assets/ex1–3, record).
import { inflateRawSync } from 'node:zlib';

export function unzip(z: Uint8Array) {
  const dv = new DataView(z.buffer, z.byteOffset), out = new Map<string, Uint8Array>();
  for (let at = 0; dv.getUint32(at, true) === 0x04034b50;) {
    const method = dv.getUint16(at + 8, true), size = dv.getUint32(at + 18, true), nl = dv.getUint16(at + 26, true), xl = dv.getUint16(at + 28, true);
    const name = new TextDecoder().decode(z.subarray(at + 30, at + 30 + nl)), start = at + 30 + nl + xl;
    const raw = z.subarray(start, start + size);
    out.set(name, method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw);
    at = start + size;
  }
  return out;
}

export function varint(b: Uint8Array, at: number): [number, number] {
  let v = 0, s = 1;
  for (;;) { const x = b[at++]; v += (x & 0x7f) * s; s *= 128; if (x < 128) return [v, at]; }
}

/** [field, wire type, value]: a number for varints, the bytes otherwise. */
export type Field = [number, number, Uint8Array | number];
export function fields(b: Uint8Array): Field[] {
  const out: Field[] = [];
  for (let at = 0; at < b.length;) {
    const [k, a1] = varint(b, at); const f = Math.floor(k / 8), w = k & 7; at = a1;
    if (w === 0) { const [v, a2] = varint(b, at); out.push([f, w, v]); at = a2; }
    else if (w === 2) { const [l, a2] = varint(b, at); out.push([f, w, b.subarray(a2, a2 + l)]); at = a2 + l; }
    else if (w === 5) { out.push([f, w, b.subarray(at, at + 4)]); at += 4; }
    else if (w === 1) { out.push([f, w, b.subarray(at, at + 8)]); at += 8; }
    else throw new Error(`wire ${w}`);
  }
  return out;
}

/** A stream of length-prefixed records (the index files, the event log, a notes file). */
export function records(b: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let at = 0; at < b.length;) { const [l, a] = varint(b, at); if (a + l > b.length) throw new Error('record runs past the end'); out.push(b.subarray(a, a + l)); at = a + l; }
  return out;
}

export function unLz4(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  let at = 0;
  for (;;) {
    const magic = new TextDecoder().decode(b.subarray(at, at + 4));
    if (magic === 'bv4$') return new Uint8Array(out);
    if (magic !== 'bv41') throw new Error(`LZ4 frame: ${magic}`);
    const dv = new DataView(b.buffer, b.byteOffset + at), raw = dv.getUint32(4, true), enc = dv.getUint32(8, true);
    const blk = b.subarray(at + 12, at + 12 + enc);
    const start = out.length;
    for (let i = 0; i < blk.length;) {
      const tok = blk[i++];
      let n = tok >> 4;
      if (n === 15) { let x; do { x = blk[i++]; n += x; } while (x === 255); }
      for (let k = 0; k < n; k++) out.push(blk[i++]);
      if (i >= blk.length) break; // the last sequence has literals only
      const off = blk[i] | (blk[i + 1] << 8); i += 2;
      let m = (tok & 15) + 4;
      if ((tok & 15) === 15) { let x; do { x = blk[i++]; m += x; } while (x === 255); }
      if (off <= 0 || off > out.length) throw new Error(`LZ4 offset ${off}`);
      for (let k = 0; k < m; k++) out.push(out[out.length - off]); // may overlap itself
    }
    if (out.length - start !== raw) throw new Error(`LZ4 block: ${out.length - start} bytes, ${raw} announced`);
    at += 12 + enc;
  }
}

/** TPL image of a ballpoint stroke, format "vuA(v)A(S(uu))A(S(uuuu))vA(f)": width and points in GoodNotes units. */
export function readTpl(img: Uint8Array): { width: number; pts: [number, number][] } {
  const dv = new DataView(img.buffer, img.byteOffset, img.length), text = (a: number, b: number) => new TextDecoder().decode(img.subarray(a, b));
  if (text(0, 4) !== 'tpl\0') throw new Error('not a TPL image');
  if (dv.getUint32(4, true) !== img.length) throw new Error('TPL length');
  const end = img.indexOf(0, 8);
  if (text(8, end) !== 'vuA(v)A(S(uu))A(S(uuuu))vA(f)') throw new Error(`TPL format ${text(8, end)}`);
  let at = end + 1;
  const u16 = () => { at += 2; return dv.getUint16(at - 2, true); }, u32 = () => { at += 4; return dv.getUint32(at - 4, true); }, f32 = () => { at += 4; return dv.getFloat32(at - 4, true); };
  u16(); // 2
  const width = f32(), flags = u32();
  for (let i = 0; i < flags; i++) u16(); // pen-down flags
  if (u32() !== 1) throw new Error('TPL: one start point expected');
  const pts: [number, number][] = [[f32(), f32()]], quads = u32();
  if (quads !== flags - 1) throw new Error('TPL: flags and point pairs differ');
  for (let i = 0; i < 2 * quads; i++) pts.push([f32(), f32()]);
  u16(); u32();
  if (at !== img.length) throw new Error(`TPL: ${img.length - at} bytes left over`);
  return { width, pts };
}

const str = (v: Uint8Array | number) => new TextDecoder().decode(v as Uint8Array);
const get = (fs: Field[], f: number) => fs.find((x) => x[0] === f)?.[2];
const f32 = (v: Uint8Array | number) => new DataView((v as Uint8Array).slice().buffer).getFloat32(0, true);

export interface ReadStroke { id: string; tool: number; width: number; pts: [number, number][]; rgba: number[] }
export interface ReadEvent { id: string; kind: number; body: Field[] }

/** Everything a test wants to compare, read back from the bytes of a .goodnotes file. */
export function readGoodnotes(file: Uint8Array) {
  const files = unzip(file);
  const index = (name: string) => records(files.get(name)!).map((r) => { const fs = fields(r); return { id: str(get(fs, 1)!), path: str(get(fs, 2)!) }; });
  const notes = index('index.notes.pb'), attachments = index('index.attachments.pb'), search = index('index.search.pb');
  const events: ReadEvent[] = records(files.get('index.events.pb')!).map((r) => { const [head, body] = fields(r); return { id: str(head[2]), kind: body[0], body: fields(body[2] as Uint8Array) }; });
  const strokes = (path: string): ReadStroke[] => {
    const recs = records(files.get(path)!), out: ReadStroke[] = [];
    if (recs.length % 2) throw new Error('a stroke is a pair of records');
    for (let i = 0; i < recs.length; i += 2) {
      const meta = fields(recs[i]), wrap = fields(recs[i + 1]);
      if (wrap.length !== 1 || wrap[0][0] !== 7) throw new Error('second record of a stroke: one field 7');
      const inner = fields(wrap[0][2] as Uint8Array), id = str(get(meta, 1)!);
      if (str(get(inner, 1)!) !== id) throw new Error('stroke id differs between its two records');
      out.push({ id, tool: get(meta, 16) as number, ...readTpl(unLz4(get(inner, 2) as Uint8Array)), rgba: fields(get(inner, 4) as Uint8Array).map((f) => f32(f[2])) });
    }
    return out;
  };
  return { files, notes, attachments, search, events, strokes, text: (f: ReadEvent, n: number) => str(get(f.body, n)!), num: (f: ReadEvent, n: number) => get(f.body, n) as number };
}
