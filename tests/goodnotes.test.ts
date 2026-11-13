import { inflateRawSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { appleLz4, backgroundPdf, centerlines, goodnotesFile, tpl, withAttachmentSize } from '../src/export/goodnotes';
import { TEMPLATE } from '../src/export/goodnotes-template';
import type { Variant } from '../src/glyphstore/types';

// Minimal readers, independent of the writer's helpers.
function unzip(z: Uint8Array) {
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
function varint(b: Uint8Array, at: number): [number, number] {
  let v = 0, s = 1;
  for (;;) { const x = b[at++]; v += (x & 0x7f) * s; s *= 128; if (x < 128) return [v, at]; }
}
function fields(b: Uint8Array) {
  const out: [number, number, Uint8Array | number][] = [];
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
function unLz4(b: Uint8Array): Uint8Array {
  const out: number[] = [];
  let at = 0;
  for (;;) {
    const magic = new TextDecoder().decode(b.subarray(at, at + 4));
    if (magic === 'bv4$') return new Uint8Array(out);
    expect(magic).toBe('bv41');
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
      expect(off).toBeGreaterThan(0);
      for (let k = 0; k < m; k++) out.push(out[out.length - off]); // may overlap itself
    }
    expect(out.length - start).toBe(raw);
    at += 12 + enc;
  }
}

const nameOf = (files: Map<string, Uint8Array>, prefix: string) => [...files.keys()].find((k) => k.startsWith(prefix))!;

describe('goodnotes export', () => {
  it('traces an L as one centre line', () => {
    const w = 20, h = 30, a = new Uint8Array(w * h);
    for (let y = 2; y < 28; y++) for (let x = 4; x < 7; x++) a[y * w + x] = 255;
    for (let y = 25; y < 28; y++) for (let x = 4; x < 18; x++) a[y * w + x] = 255;
    const lines = centerlines(a, w, h);
    expect(lines).toHaveLength(1);
    expect(lines[0].pts.length).toBeLessThan(6); // simplified to a few corners
    expect(lines[0].w).toBeGreaterThan(2.5); // the 3 px wide stroke
    expect(lines[0].w).toBeLessThan(4);
  });

  it('keeps a closed loop (an o) round', () => {
    const w = 44, h = 50, a = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r = Math.hypot((x - 22) / 18, (y - 25) / 21); if (r > 0.75 && r < 1) a[y * w + x] = 255; }
    const lines = centerlines(a, w, h);
    expect(lines).toHaveLength(1);
    expect(lines[0].pts.length).toBeGreaterThan(8);
    const xs = lines[0].pts.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(25);
  });

  it('gives a round dot its own width, not the pen width', () => {
    const w = 30, h = 30, a = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - 14.5, y - 14.5) <= 8) a[y * w + x] = 255; // 17 px across
    const lines = centerlines(a, w, h);
    expect(lines).toHaveLength(1);
    expect(lines[0].w).toBeGreaterThan(14);
    expect(lines[0].w).toBeLessThan(19);
  });

  it('frames LZ4 so a reader gets the bytes back, also over 32 KB', () => {
    const data = Array.from({ length: 70000 }, (_, i) => i % 251);
    expect([...unLz4(new Uint8Array(appleLz4(data)))]).toEqual(data);
  });

  it('really compresses repeated data and still round-trips', () => {
    const data = Array.from({ length: 70000 }, (_, i) => (i % 40) * 3 + ((i / 5000) | 0));
    const z = appleLz4(data);
    expect(z.length).toBeLessThan(data.length / 8);
    expect([...unLz4(new Uint8Array(z))]).toEqual(data);
    const run = new Array(1000).fill(7); // a run: matches that overlap themselves
    expect([...unLz4(new Uint8Array(appleLz4(run)))]).toEqual(run);
    expect([...unLz4(new Uint8Array(appleLz4([])))]).toEqual([]);
    const noise = Array.from({ length: 5000 }, (_, i) => (i * 2654435761) >>> 24); // little to match
    expect([...unLz4(new Uint8Array(appleLz4(noise)))]).toEqual(noise);
  });

  it('writes a zip with one stroke record pair per stroke and a valid TPL image', async () => {
    const w = 10, h = 10, alpha = new Uint8Array(w * h);
    for (let x = 1; x < 9; x++) alpha[5 * w + x] = alpha[4 * w + x] = 255;
    const v = { src: 's', key: '-', w, h, alpha, baseline: 8, strokeW: 2, entry: null, exit: null } as unknown as Variant;
    const page = {
      glyphs: [{ g: v, m: [0.1, 0, 0, 0.1, 20, 30] as [number, number, number, number, number, number] }],
      connectors: [{ p: [[0, 0], [1, 0], [2, 0], [3, 0]] as [number, number][], w0: 0.4, w1: 0.4 }] as never,
      missing: [], lines: [], marks: [],
    };
    const files = unzip(await goodnotesFile(page, () => v, '#203040'));
    expect(new TextDecoder().decode(files.get(nameOf(files, 'attachments/'))!.subarray(0, 5))).toBe('%PDF-');
    const notes = files.get(nameOf(files, 'notes/'))!, recs: Uint8Array[] = [];
    for (let at = 0; at < notes.length;) { const [l, a] = varint(notes, at); recs.push(notes.subarray(a, a + l)); at = a + l; }
    expect(recs).toHaveLength(4); // glyph line + connector, two records each
    const meta = fields(recs[0]), stroke = fields(fields(recs[1])[0][2] as Uint8Array);
    expect(meta.find((f) => f[0] === 16)![2]).toBe(24);
    expect(fields(recs[1])[0][0]).toBe(7);
    const img = unLz4(stroke.find((f) => f[0] === 2)![2] as Uint8Array);
    expect(new TextDecoder().decode(img.subarray(0, 3))).toBe('tpl');
    expect(new DataView(img.buffer, img.byteOffset).getUint32(4, true)).toBe(img.length);
    const color = fields(stroke.find((f) => f[0] === 4)![2] as Uint8Array).map((f) => new DataView((f[2] as Uint8Array).slice().buffer).getFloat32(0, true));
    expect(color[0]).toBeCloseTo(0x20 / 255);
  });

  it('builds the TPL point list as start point plus pairs', () => {
    const t = tpl(1, [[0, 0], [1, 1], [2, 2]]);
    expect(t.length).toBe(new DataView(new Uint8Array(t).buffer).getUint32(4, true));
  });

  it('writes the chosen paper as a PDF of the page size, lines on the baselines', async () => {
    const lined = await backgroundPdf('lined', 7.1, 12), blank = await backgroundPdf('blank', 7.1, 12), grid = await backgroundPdf('grid', 10, 12);
    for (const pdf of [lined, blank, grid]) {
      const size = (await PDFDocument.load(pdf)).getPage(0).getSize();
      expect(size.width).toBeCloseTo(455.04, 2);
      expect(size.height).toBeCloseTo(588.45, 2);
    }
    // ruled lines: from margin + lineH down, one per lineH, while y <= pageH - margin (as draw.ts paints them), full width
    const content = (pdf: Uint8Array) => { const p = Buffer.from(pdf), at = p.indexOf('stream\n') + 7; return inflateSync(p.subarray(at, p.indexOf('\nendstream'))).toString(); };
    const lineYs = (pdf: Uint8Array) => [...content(pdf).matchAll(/^0 ([\d.]+) m\n455\.04 /gm)].map((m) => ((588.45 - Number(m[1])) * 25.4) / 72);
    const ys = lineYs(lined);
    expect(ys).toHaveLength(25);
    expect(ys[0]).toBeCloseTo(12 + 7.1, 2);
    expect(ys[24] - ys[0]).toBeCloseTo(24 * 7.1, 2);
    expect(content(blank)).not.toContain(' l\n');
    // grid: boxes of lineH / 2, a baseline (margin + k * lineH) is always a grid line
    const gy = lineYs(grid);
    expect(gy.some((y) => Math.abs(y - (12 + 10 * 3)) < 0.01)).toBe(true);
    expect(gy[1] - gy[0]).toBeCloseTo(5, 3);
  });

  it('writes the size of the background into the event log, and leaves everything else alone', async () => {
    const events = Uint8Array.from(atob(TEMPLATE.events), (c) => c.charCodeAt(0));
    expect(withAttachmentSize(events, 41951)).toEqual(events); // the template's own size: byte for byte the same
    const bg = await backgroundPdf('lined', 7.1, 12);
    const patched = withAttachmentSize(events, bg.length);
    expect(patched.length).not.toBe(events.length); // fewer bytes for a smaller number
    const seen: number[] = [];
    for (let at = 0; at < patched.length;) { // the stream must still split into whole events
      const [l, a] = varint(patched, at);
      for (const f of fields(patched.subarray(a, a + l))) if (f[0] === 6) for (const g of fields(f[2] as Uint8Array)) if (g[0] === 5) seen.push(g[2] as number);
      at = a + l;
    }
    expect(seen).toEqual([bg.length]);
    const files = unzip(await goodnotesFile({ glyphs: [], connectors: [], missing: [], lines: [], marks: [] }, () => null as never, '#000000', undefined, '#000000', 0, bg));
    expect(files.get(nameOf(files, 'attachments/'))).toEqual(bg);
  });

  it('gives every export fresh ids, kept consistent between the index files, the event log and the entry names', async () => {
    const empty = { glyphs: [], connectors: [], missing: [], lines: [], marks: [] };
    const make = async () => unzip(await goodnotesFile(empty, () => null as never, '#000000'));
    const [a, b] = [await make(), await make()];
    const text = (f: Map<string, Uint8Array>, n: string) => new TextDecoder('latin1').decode(f.get(n)!);
    const UUID = /[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}(?!_)/g;
    const ids = (f: Map<string, Uint8Array>) => new Set([...f.keys()].flatMap((k) => (k.endsWith('.pb') ? text(f, k).match(UUID) ?? [] : [])));
    expect(nameOf(a, 'attachments/')).not.toBe(nameOf(b, 'attachments/'));
    expect(nameOf(a, 'notes/')).not.toBe(nameOf(b, 'notes/'));
    expect([...ids(a)].filter((u) => ids(b).has(u))).toEqual([]); // nothing shared between two files
    for (const f of [a, b]) {
      const att = nameOf(f, 'attachments/').slice(12), page = nameOf(f, 'notes/').slice(6);
      expect(nameOf(f, 'search/')).toMatch(/^search\//);
      expect(text(f, 'index.attachments.pb')).toContain(att);
      expect(text(f, 'index.notes.pb')).toContain(page);
      expect(text(f, 'index.search.pb')).toContain(page);
      expect(text(f, 'index.search.pb')).toContain(att);
      const ev = text(f, 'index.events.pb');
      expect(ev).toContain(att); // the page's paper is the attachment
      expect(ev).toContain(page);
      expect(ev).toContain('CC365888-75C9-5DBF-B1D4-A7E8E0AD3B7F_standard_1_2 - White'); // the paper's name stays as GoodNotes wrote it
      const raw = Uint8Array.from(atob(TEMPLATE.events), (c) => c.charCodeAt(0));
      expect(f.get('index.events.pb')!.length).toBe(raw.length); // same length: no field was resized
    }
  });
});
