import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { GN_PAGE, appleLz4, backgroundPdf, centerlines, goodnotesFile, tpl, withAttachmentSize, type PaperTrial } from '../src/export/goodnotes';
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
      expect(Buffer.from(pdf).toString('latin1')).not.toMatch(/\/ObjStm|\/Type\s*\/XRef/); // plain xref table, as in GoodNotes' own paper PDFs
      const size = (await PDFDocument.load(pdf)).getPage(0).getSize();
      expect(size.width).toBeCloseTo(455.04, 2);
      expect(size.height).toBeCloseTo(588.45, 2);
    }
    // ruled lines: from margin + lineH down, one per lineH, while y <= pageH - margin (as draw.ts paints them), full width
    const content = (pdf: Uint8Array) => { const p = Buffer.from(pdf), at = p.indexOf('stream\n') + 7; return at < 7 ? '' /* blank paper: no drawing at all */ : inflateSync(p.subarray(at, p.indexOf('\nendstream'))).toString(); };
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
      expect(ev).toContain('CC365888-75C9-5DBF-B1D4-A7E8E0AD3B7F_standard_1_2 - White'); // the paper's name stays as GoodNotes wrote it
      const raw = Uint8Array.from(atob(TEMPLATE.events), (c) => c.charCodeAt(0));
      expect(f.get('index.events.pb')!.length).toBe(raw.length); // same length: no field was resized
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
    const bg = await backgroundPdf('grid', 7.1, 12), thumb = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const gn = readGoodnotes(await goodnotesFile(page, () => v, '#203040', thumb, '#c02010', 0, bg));

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
    expect(gn.text(paper, 9)).toBe('CC365888-75C9-5DBF-B1D4-A7E8E0AD3B7F_standard_1_2 - White');
    expect(gn.num(added, 5)).toBe(bg.length);
    expect(gn.files.get(gn.attachments[0].path)).toEqual(bg);
    for (const e of [pageEv, paper, added]) expect(gn.text(e, e === added ? 6 : 1)).toBe(doc.id); // all belong to the document
    // ids every real file shares stay as they are
    expect(gn.text(doc, 3)).toContain('5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E');
    expect(gn.text(doc, 7)).toContain('5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E');
    expect(gn.text(kind(10)[0], 3)).toBe('PagingViewServiceUpdater:E1940363-20DF-415F-9D75-9F6BC464911B');
    // the paper has the page's size: 455.04 x 588.45 pt = 834.24 x 1078.82 GoodNotes units
    const size = fields(paper.body.find((f) => f[0] === 8)![2] as Uint8Array).map((f) => new DataView((f[2] as Uint8Array).slice().buffer).getFloat32(0, true));
    near(size, [834.24, 1078.825]);
    const pdfPage = (await PDFDocument.load(bg)).getPage(0).getSize();
    near([pdfPage.width * (132 / 72), pdfPage.height * (132 / 72)], size);
  });
  // Trial variants for "GoodNotes shows dots instead of our paper" (docs/gn-papier.md).
  const K2 = 132 / 25.4, LINE_H = 7.1, MARGIN = 12;
  /** A row of waves standing on each of the first lines, so one sees at once whether the paper's lines sit under the writing. */
  const wavePage = () => ({
    glyphs: [], missing: [], lines: [], marks: [],
    connectors: Array.from({ length: 6 }, (_, row) => Array.from({ length: 8 }, (_, i) => {
      const x = MARGIN + 4 + i * 9, y = MARGIN + LINE_H * (row + 1);
      return { p: [[x, y], [x + 2, y - 5], [x + 4, y - 5], [x + 6, y]] as [number, number][], w0: 0.35, w1: 0.35 };
    })).flat() as never,
  });
  /** The squared paper as an opaque PNG (white, grid lines 2 px), 2 px per GoodNotes unit; same grid as backgroundPdf('grid'). */
  function gridPng(): Uint8Array {
    const s = 2 * K2, W = Math.round(GN_PAGE.w * s), H = Math.round(GN_PAGE.h * s), cell = LINE_H / 2, px = new Uint8Array((W * 3 + 1) * H).fill(255);
    const first = (phase: number) => phase + Math.ceil(-phase / cell) * cell, ink = [0xd6, 0xe2, 0xed];
    const dot = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < W && y < H) px.set(ink, y * (W * 3 + 1) + 1 + x * 3); };
    for (let x = first(MARGIN); x < GN_PAGE.w; x += cell) for (let y = 0; y < H; y++) { dot(Math.round(x * s), y); dot(Math.round(x * s) - 1, y); }
    for (let y = first(MARGIN + LINE_H); y < GN_PAGE.h; y += cell) for (let x = 0; x < W; x++) { dot(x, Math.round(y * s)); dot(x, Math.round(y * s) - 1); }
    for (let y = 0; y < H; y++) px[y * (W * 3 + 1)] = 0; // filter byte of each row
    const chunk = (type: string, data: Uint8Array) => {
      const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8);
      out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
      return out;
    };
    const head = Buffer.alloc(13); head.writeUInt32BE(W, 0); head.writeUInt32BE(H, 4); head.set([8, 2, 0, 0, 0], 8); // 8 bit RGB
    return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(px)), chunk('IEND', new Uint8Array())]));
  }
  const trials = (png: Uint8Array): [string, PaperTrial][] => [['1-ohne-papiername', { drop: [9, 18] }], ['2-ohne-raster-angabe', { drop: [18] }], ['3-papier-als-bild', { image: png }]];

  it('paper trials: fields dropped from the paper event, or the paper as a picture under the writing', async () => {
    const bg = await backgroundPdf('grid', LINE_H, MARGIN), png = gridPng(), [noName, noRuling, picture] = trials(png);
    const paperEvent = (gn: ReturnType<typeof readGoodnotes>) => gn.events.find((e) => e.kind === 2)!.body.map((f) => f[0]);
    const plain = readGoodnotes(await goodnotesFile(wavePage(), () => null as never, '#203040', undefined, '#203040', 0, bg));
    expect(paperEvent(plain)).toEqual(expect.arrayContaining([4, 9, 18]));
    const a = readGoodnotes(await goodnotesFile(wavePage(), () => null as never, '#203040', undefined, '#203040', 0, bg, noName[1]));
    expect(paperEvent(a)).toEqual(paperEvent(plain).filter((f) => f !== 9 && f !== 18));
    const b = readGoodnotes(await goodnotesFile(wavePage(), () => null as never, '#203040', undefined, '#203040', 0, bg, noRuling[1]));
    expect(paperEvent(b)).toEqual(paperEvent(plain).filter((f) => f !== 18));
    expect(a.strokes(a.notes[0].path)).toHaveLength(48);

    const c = readGoodnotes(await goodnotesFile(wavePage(), () => null as never, '#203040', undefined, '#203040', 0, bg, picture[1]));
    expect(c.strokes(c.notes[0].path)).toHaveLength(48);
    const [img] = c.images(c.notes[0].path), entry = c.attachments.find((x) => x.id === img.attachment)!;
    expect(c.attachments).toHaveLength(2);
    expect(c.files.get(entry.path)).toEqual(png);
    img.frame.forEach((v, i) => expect(v).toBeCloseTo([0, 0, 834.24, 1078.825][i], 1));
    const added = c.events.filter((e) => e.kind === 6).find((e) => c.text(e, 1) === img.attachment)!;
    expect(c.num(added, 5)).toBe(png.length);
    expect(c.text(added, 6)).toBe(c.events[0].id); // the document
    expect(paperEvent(c)).toEqual(paperEvent(plain)); // the paper itself untouched
  });

  // GN_TEST=1 npx vitest run tests/goodnotes.test.ts  ->  public/gn-test/*.goodnotes for the iPad (not committed)
  it.runIf(process.env.GN_TEST)('writes the paper trial files', async () => {
    const bg = await backgroundPdf('grid', LINE_H, MARGIN);
    mkdirSync('public/gn-test', { recursive: true });
    for (const [name, trial] of trials(gridPng())) writeFileSync(`public/gn-test/${name}.goodnotes`, await goodnotesFile(wavePage(), () => null as never, '#203040', undefined, '#203040', 0, bg, trial));
  });
});
