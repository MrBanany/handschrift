import { mkdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { GN_A4, appleLz4, centerlines, gnPaper, goodnotesFile, paperPdf, tpl, withAttachmentSize, type GnPaper } from '../src/export/goodnotes';
import { TEMPLATE } from '../src/export/goodnotes-template';
import type { Variant } from '../src/glyphstore/types';

import { fields, readGoodnotes, unLz4, unzip, varint } from './gn-reader';

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

  it('keeps the short bar of a t and the bridge between two legs', () => {
    const shape = (w: number, h: number, rects: number[][]) => {
      const a = new Uint8Array(w * h);
      for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y * w + x] = 255;
      return centerlines(a, w, h);
    };
    expect(shape(20, 30, [[8, 2, 11, 27], [3, 8, 16, 10]])).toHaveLength(3); // stem + both halves of the bar
    expect(shape(30, 30, [[5, 2, 9, 27], [16, 2, 20, 27], [10, 12, 15, 14], [5, 2, 20, 5]])).toHaveLength(2); // the bar between the legs stays
  });

  it('drops a speck of scan noise but keeps the dot of an i', () => {
    const w = 20, h = 40, a = new Uint8Array(w * h);
    const fill = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y * w + x] = 255; };
    fill(8, 14, 11, 37); // stem, 4 px wide
    fill(8, 4, 11, 7); // dot, 4 x 4
    fill(17, 30, 17, 30); // one stray pixel
    const lines = centerlines(a, w, h);
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.pts.every(([x]) => x > 15))).toBe(false);
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

  it('writes the size of the background into the event log, and leaves everything else alone', async () => {
    const events = Uint8Array.from(atob(TEMPLATE.events), (c) => c.charCodeAt(0));
    expect(withAttachmentSize(events, 41951)).toEqual(events); // the template's own size: byte for byte the same
    const bg = await paperPdf('narrow');
    const patched = withAttachmentSize(events, bg.length);
    expect(patched.length).not.toBe(events.length); // fewer bytes for a smaller number
    const seen: number[] = [];
    for (let at = 0; at < patched.length;) { // the stream must still split into whole events
      const [l, a] = varint(patched, at);
      for (const f of fields(patched.subarray(a, a + l))) if (f[0] === 6) for (const g of fields(f[2] as Uint8Array)) if (g[0] === 5) seen.push(g[2] as number);
      at = a + l;
    }
    expect(seen).toEqual([bg.length]);
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
    // nothing shared between two files, except the two ids every file GoodNotes writes has
    expect([...ids(a)].filter((u) => ids(b).has(u)).sort()).toEqual(['5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E', 'E1940363-20DF-415F-9D75-9F6BC464911B']);
    for (const f of [a, b]) {
      // the page (event f54) and its ink (notes/…) are one pair: notes id = page id + 1, or GoodNotes shows the page empty
      const notes = nameOf(f, 'notes/').slice(6), pageId = notes.slice(0, -1) + '0';
      expect(notes.endsWith('1')).toBe(true);
      const kinds = new Map<string, number[]>(); // event id -> kinds of its events
      const evs = f.get('index.events.pb')!;
      for (let at = 0; at < evs.length;) {
        const [l, s] = varint(evs, at), [head, body] = fields(evs.subarray(s, s + l));
        const key = new TextDecoder().decode(head[2] as Uint8Array);
        kinds.set(key, [...(kinds.get(key) ?? []), body[0]]);
        at = s + l;
      }
      expect(kinds.get(pageId)).toEqual([54]); // "page added"
      expect(kinds.get(notes)).toContain(102); // its ink layer
      expect(new TextDecoder('latin1').decode(evs)).toContain(`PagingViewServiceUpdater:E1940363-20DF-415F-9D75-9F6BC464911B`);
      const att = nameOf(f, 'attachments/').slice(12), page = nameOf(f, 'notes/').slice(6);
      expect(nameOf(f, 'search/')).toMatch(/^search\//);
      expect(text(f, 'index.attachments.pb')).toContain(att);
      expect(text(f, 'index.notes.pb')).toContain(page);
      expect(text(f, 'index.search.pb')).toContain(page);
      expect(text(f, 'index.search.pb')).toContain(att);
      const ev = text(f, 'index.events.pb');
      expect(ev).toContain(att); // the page's paper is the attachment
      expect(ev).toContain(page);
      expect(ev).toContain('B03314A5-9B9F-556B-B373-4678E13D0DAC_a4_1_2 - White'); // the paper's name (blank) keeps its id
      expect(f.get('index.events.pb')!.length).toBe(a.get('index.events.pb')!.length); // same length: new ids resize nothing
    }
  });

  it('round trip: an independent reader gets strokes, colours, paper and the id rules back out of the file', async () => {
    const K = 132 / 25.4; // GoodNotes units per mm
    const w = 10, h = 10, alpha = new Uint8Array(w * h);
    for (let x = 1; x < 9; x++) alpha[5 * w + x] = alpha[4 * w + x] = 255;
    const v = { src: 's', key: '-', w, h, alpha, baseline: 8, strokeW: 2, entry: null, exit: null } as unknown as Variant;
    const line = (p: [number, number][], w0: number, accent?: boolean) => ({ p, w0, w1: w0, accent });
    const page = {
      glyphs: [{ g: v, m: [0.1, 0, 0, 0.1, 20, 30] as [number, number, number, number, number, number] }],
      connectors: [
        line([[20, 40], [30, 40], [40, 40], [50, 40]], 0.3), // straight, ink colour
        line([[20, 50], [20, 55], [20, 60], [20, 65]], 0.4, true), // straight, heading colour
        line([[60, 50], [70, 40], [80, 60], [90, 50]], 0.3), // an S curve
      ] as never,
      missing: [], lines: [], marks: [],
    };
    const thumb = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const gn = readGoodnotes(await goodnotesFile(page, () => v, '#203040', thumb, '#c02010', 0, 'squared')), bg = gn.files.get(gn.attachments[0].path)!;

    // every index entry names a file that is in the archive
    for (const e of [...gn.notes, ...gn.attachments, ...gn.search]) expect(gn.files.has(e.path)).toBe(true);
    expect([gn.notes.length, gn.attachments.length]).toEqual([1, 1]);
    expect(gn.notes[0].path).toBe(`notes/${gn.notes[0].id}`);
    expect(gn.files.get('thumbnail.jpg')).toEqual(thumb);

    // strokes: the glyph's centre line, then the three pen strokes, in GoodNotes units
    const strokes = gn.strokes(gn.notes[0].path);
    expect(strokes).toHaveLength(4);
    expect(new Set(strokes.map((s) => s.id)).size).toBe(4);
    for (const s of strokes) { expect(s.tool).toBe(24); expect(s.pts.length % 2).toBe(1); } // ballpoint; a start point plus pairs
    const [glyph, a, b, c] = strokes, ends = (s: typeof a) => [s.pts[0], s.pts.at(-1)!].flat().map((x) => x / K);
    for (const [x, y] of glyph.pts) { expect(x / K).toBeGreaterThan(20); expect(x / K).toBeLessThan(21); expect(y / K).toBeGreaterThan(30.3); expect(y / K).toBeLessThan(30.7); }
    const near = (got: number[], want: number[]) => got.forEach((g, i) => expect(g).toBeCloseTo(want[i], 2));
    near(ends(a), [20, 40, 50, 40]);
    near(ends(b), [20, 50, 20, 65]);
    near(ends(c), [60, 50, 90, 50]);
    expect(c.pts.length).toBeGreaterThan(3); // the curve keeps points in between, all inside its hull
    for (const [x, y] of c.pts) { expect(x / K).toBeGreaterThanOrEqual(59.99); expect(x / K).toBeLessThanOrEqual(90.01); expect(y / K).toBeGreaterThan(40); expect(y / K).toBeLessThan(60); }
    near([a.width / K, b.width / K, c.width / K], [0.3, 0.4, 0.3]);
    near(a.rgba, [0x20 / 255, 0x30 / 255, 0x40 / 255, 1]);
    near(b.rgba, [0xc0 / 255, 0x20 / 255, 0x10 / 255, 1]); // headings in their own colour
    near(glyph.rgba, a.rgba);

    // the event log: one page (f54), its ink under page id + 1, its paper (f2) is the attachment with our PDF
    const kind = (k: number) => gn.events.filter((e) => e.kind === k);
    const [pageEv] = kind(54), [paper] = kind(2), [added] = kind(6), doc = kind(30)[0];
    expect(kind(54)).toHaveLength(1);
    const big = (u: string) => BigInt('0x' + u.replace(/-/g, ''));
    expect(big(gn.notes[0].id)).toBe(big(pageEv.id) + 1n);
    expect(kind(102).map((e) => e.id)).toEqual([gn.notes[0].id]);
    expect(gn.text(pageEv, 3)).toContain(paper.id); // page -> paper
    expect(gn.text(paper, 4)).toBe(gn.attachments[0].id); // paper -> attachment
    expect(gn.num(paper, 5)).toBe(1); // page 1 of that PDF
    expect(gn.text(paper, 9)).toBe('9FE8F365-4BEE-5057-8573-1A56C77CAC19_a4_1_2 - White');
    expect(gn.num(added, 5)).toBe(bg.length);
    for (const e of [pageEv, paper, added]) expect(gn.text(e, e === added ? 6 : 1)).toBe(doc.id); // all belong to the document
    // ids every real file shares stay as they are
    expect(gn.text(doc, 3)).toContain('5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E');
    expect(gn.text(doc, 7)).toContain('5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E');
    expect(gn.text(kind(10)[0], 3)).toBe('PagingViewServiceUpdater:E1940363-20DF-415F-9D75-9F6BC464911B');
    // the paper has the page's size: A4, 595.28 x 841.89 pt = 1091.35 x 1543.46 GoodNotes units
    const size = fields(paper.body.find((f) => f[0] === 8)![2] as Uint8Array).map((f) => new DataView((f[2] as Uint8Array).slice().buffer).getFloat32(0, true));
    near(size, [1091.3467, 1543.465]);
    const pdfPage = (await PDFDocument.load(bg)).getPage(0).getSize();
    near([pdfPage.width * (132 / 72), pdfPage.height * (132 / 72)], size);
  });
  const LINE_H = 7.1, MARGIN = 12;
  /** A row of waves standing on each of the first lines, so one sees at once whether the paper's lines sit under the writing. */
  const wavePage = (lineH = LINE_H, margin = MARGIN) => ({
    glyphs: [], missing: [], lines: [], marks: [],
    connectors: Array.from({ length: 6 }, (_, row) => Array.from({ length: 8 }, (_, i) => {
      const x = margin + 4 + i * 9, y = margin + lineH * (row + 1);
      return { p: [[x, y], [x + 2, y - 5], [x + 4, y - 5], [x + 6, y]] as [number, number][], w0: 0.35, w1: 0.35 };
    })).flat() as never,
  });
  // The numbers GoodNotes 7 wrote into empty A4 pages (samples of 14 November, docs/gn-papier.md): name id, pitch, text area top and height, line gap.
  const REAL: Record<GnPaper, [string, number, number, number, number]> = {
    wide: ['AA273C17-F440-5125-B34E-F9C3C62F89E2', 45.833335876464844, 45.833335876464844, 1451.79833984375, 44.91666793823242],
    narrow: ['238EE861-EE9A-51BD-B010-832CD3C50D2C', 32.083335876464844, 60.5, 1422.465087890625, 31.166667938232422],
    squared: ['9FE8F365-4BEE-5057-8573-1A56C77CAC19', 29.33333396911621, 58.66666793823242, 1426.1317138671875, 28.416667938232422],
    blank: ['B03314A5-9B9F-556B-B373-4678E13D0DAC', 29.33333396911621, 62.333335876464844, 1418.79833984375, 29.33333396911621],
  };
  const PAPER_NAMES = Object.keys(REAL) as GnPaper[];
  const fit = { wide: gnPaper('lined', 8.7, 20), narrow: gnPaper('lined', 6.4, 20), squared: gnPaper('grid', 10, 20), blank: gnPaper('blank', 7.1, 20) };

  it("writes GoodNotes' own papers the way GoodNotes exported them", async () => {
    const f64 = (v: unknown) => new DataView((v as Uint8Array).slice().buffer).getFloat64(0, true), f32 = (v: unknown) => new DataView((v as Uint8Array).slice().buffer).getFloat32(0, true);
    const sub = (fs: ReturnType<typeof fields>, f: number) => fields(fs.find((x) => x[0] === f)![2] as Uint8Array);
    for (const paper of PAPER_NAMES) {
      const [id, pitch, top, height, gap] = REAL[paper];
      const gn = readGoodnotes(await goodnotesFile(wavePage(), () => null as never, '#203040', undefined, '#203040', 0, paper));
      const ev = gn.events.find((e) => e.kind === 2)!, b = ev.body;
      expect(b.map((f) => f[0])).toEqual([1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 21]); // field order of the real files
      expect(gn.text(ev, 9)).toBe(`${id}_a4_1_2 - White`);
      expect(f64(b.find((f) => f[0] === 7)![2])).toBe(pitch);
      expect(f64(sub(b, 12)[0][2])).toBe(pitch);
      expect(sub(b, 12).map((f) => f[0])).toEqual([1, 2]);
      expect(sub(b, 8).map((f) => f32(f[2]))).toEqual([1091.3466796875, 1543.4649658203125]);
      const area = sub(b, 18), rect = sub(area, 1).flatMap((pt) => fields(pt[2] as Uint8Array).map((c) => f32(c[2])));
      expect(rect).toEqual([44, top, 1003.3467407226562, height]);
      expect(f32(area[1][2])).toBe(gap);
      // lined and squared paper also say how thick a line is (0.5 pt); blank paper has no such field
      expect(area.map((f) => [f[0], f[1]])).toEqual(paper === 'blank' ? [[1, 2], [2, 5], [5, 0]] : [[1, 2], [2, 5], [3, 5], [5, 0]]);
      if (paper !== 'blank') expect(f32(area[2][2])).toBe(0.9166666865348816);
      // the attached PDF: A4, its size in the "attachment added" event
      const pdf = gn.files.get(gn.attachments[0].path)!;
      expect(gn.num(gn.events.find((e) => e.kind === 6)!, 5)).toBe(pdf.length);
      expect((await PDFDocument.load(pdf)).getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
      expect(gn.strokes(gn.notes[0].path)).toHaveLength(48);
    }
  });

  it('fits the line spacing and margin to the paper: every baseline on a line', async () => {
    expect([gnPaper('lined', 6.4, 20).paper, gnPaper('lined', 7.1, 20).paper, gnPaper('lined', 8.7, 20).paper, gnPaper('grid', 8, 20).paper]).toEqual(['narrow', 'narrow', 'wide', 'squared']);
    expect(gnPaper('grid', 10, 20).lineH).toBeCloseTo(2 * 16 * 25.4 / 72, 6); // two squares per line
    expect(gnPaper('grid', 6, 20).lineH).toBeCloseTo(16 * 25.4 / 72, 6);
    // blank paper has no lines to hit: spacing as set, the margin at most 12 mm; its PDF is the white page alone
    expect([fit.blank, gnPaper('blank', 7.1, 8)]).toEqual([{ paper: 'blank', lineH: 7.1, margin: 12 }, { paper: 'blank', lineH: 7.1, margin: 8 }]);
    const drawn = async (paper: GnPaper) => { const pdf = Buffer.from(await paperPdf(paper)), at = pdf.indexOf('stream\n') + 7; return inflateSync(pdf.subarray(at, pdf.indexOf('\nendstream'))).toString('latin1').split('\nh\nf\n').length - 1; };
    expect([await drawn('blank'), await drawn('wide'), await drawn('narrow'), await drawn('squared')]).toEqual([1, 1 + 32, 1 + 45, 1 + 52 + 37]); // rectangles: the page, then the lines GoodNotes' own PDFs have on the page
    // line centres of the real PDFs (pt from the top): wide 49.75 + 25 k, narrow 50.25 + 17.5 k, squared 15.75 + 16 k
    const lines = { wide: [49.75, 25], narrow: [50.25, 17.5], squared: [15.75, 16] };
    for (const paper of ['wide', 'narrow', 'squared'] as const) {
      const { lineH, margin } = fit[paper], [first, pitch] = lines[paper];
      for (let k = 1; k < 20; k++) { const off = ((margin + k * lineH) * 72 / 25.4 - first) / pitch; expect(Math.abs(off - Math.round(off))).toBeLessThan(1e-6); }
      expect(margin).toBeGreaterThan(8); expect(margin).toBeLessThan(12);
      // and our PDF has a line there: a 0.5 pt rectangle whose lower edge is 0.25 pt below the centre
      const pdf = Buffer.from(await paperPdf(paper)), at = pdf.indexOf('stream\n') + 7, text = inflateSync(pdf.subarray(at, pdf.indexOf('\nendstream'))).toString('latin1');
      expect(text).toContain(` ${+(841.89 - first - 0.25).toFixed(2)} `);
    }
    expect(GN_A4.w).toBeCloseTo(210, 1);
  });

  // GN_TEST=1 npx vitest run --dir tests tests/goodnotes.test.ts  ->  public/gn-test/*.goodnotes for the iPad (not committed)
  it.runIf(process.env.GN_TEST)('writes one test file per paper', async () => {
    mkdirSync('public/gn-test', { recursive: true });
    const names = { wide: 'liniert-breit', narrow: 'liniert-schmal', squared: 'kariert', blank: 'leer' };
    for (const paper of PAPER_NAMES) writeFileSync(`public/gn-test/${names[paper]}.goodnotes`, await goodnotesFile(wavePage(fit[paper].lineH, fit[paper].margin), () => null as never, '#203040', undefined, '#203040', 0, paper));
  });
});
