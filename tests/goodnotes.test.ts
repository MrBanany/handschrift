import { describe, expect, it } from 'vitest';
import { appleLz4, centerlines, goodnotesFile, tpl } from '../src/export/goodnotes';
import type { Variant } from '../src/glyphstore/types';

// Minimal readers, independent of the writer's helpers.
function unzip(z: Uint8Array) {
  const dv = new DataView(z.buffer, z.byteOffset), out = new Map<string, Uint8Array>();
  for (let at = 0; dv.getUint32(at, true) === 0x04034b50;) {
    const size = dv.getUint32(at + 18, true), nl = dv.getUint16(at + 26, true), xl = dv.getUint16(at + 28, true);
    const name = new TextDecoder().decode(z.subarray(at + 30, at + 30 + nl)), start = at + 30 + nl + xl;
    out.set(name, z.subarray(start, start + size));
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
    let i = 0, n = blk[i++] >> 4;
    if (n === 15) { let x; do { x = blk[i++]; n += x; } while (x === 255); }
    out.push(...blk.subarray(i, i + n));
    expect(n).toBe(raw);
    at += 12 + enc;
  }
}

describe('goodnotes export', () => {
  it('traces an L as one centre line', () => {
    const w = 20, h = 30, a = new Uint8Array(w * h);
    for (let y = 2; y < 28; y++) for (let x = 4; x < 7; x++) a[y * w + x] = 255;
    for (let y = 25; y < 28; y++) for (let x = 4; x < 18; x++) a[y * w + x] = 255;
    const lines = centerlines(a, w, h);
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBeLessThan(6); // simplified to a few corners
  });

  it('keeps a closed loop (an o) round', () => {
    const w = 44, h = 50, a = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const r = Math.hypot((x - 22) / 18, (y - 25) / 21); if (r > 0.75 && r < 1) a[y * w + x] = 255; }
    const lines = centerlines(a, w, h);
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBeGreaterThan(8);
    const xs = lines[0].map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(25);
  });

  it('frames LZ4 so a reader gets the bytes back, also over 32 KB', () => {
    const data = Array.from({ length: 70000 }, (_, i) => i % 251);
    expect([...unLz4(new Uint8Array(appleLz4(data)))]).toEqual(data);
  });

  it('writes a zip with one stroke record pair per stroke and a valid TPL image', () => {
    const w = 10, h = 10, alpha = new Uint8Array(w * h);
    for (let x = 1; x < 9; x++) alpha[5 * w + x] = alpha[4 * w + x] = 255;
    const v = { src: 's', key: '-', w, h, alpha, baseline: 8, strokeW: 2, entry: null, exit: null } as unknown as Variant;
    const page = {
      glyphs: [{ g: v, m: [0.1, 0, 0, 0.1, 20, 30] as [number, number, number, number, number, number] }],
      connectors: [{ p: [[0, 0], [1, 0], [2, 0], [3, 0]] as [number, number][], w0: 0.4, w1: 0.4 }] as never,
      missing: [], lines: [], marks: [],
    };
    const files = unzip(goodnotesFile(page, () => v, '#203040'));
    expect([...files.keys()]).toContain('notes/47C42002-8FC8-521C-80C0-A3C6E11DA9C1');
    expect(new TextDecoder().decode(files.get('attachments/F8C077F2-68CA-5AFC-B1D1-EFEA5ED4D254')!.subarray(0, 5))).toBe('%PDF-');
    const notes = files.get('notes/47C42002-8FC8-521C-80C0-A3C6E11DA9C1')!, recs: Uint8Array[] = [];
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
});
