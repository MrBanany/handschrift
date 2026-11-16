import { describe, expect, it } from 'vitest';
import { connectionModel } from '../src/connectors/connect';
import type { GlyphMeta } from '../src/glyphstore/types';
import { inkStrokes } from '../src/export/goodnotes';
import { layout, segment, type Page, type Settings } from '../src/renderer/layout';
import { EMPH, HEAD, MARK, STRUCT, clean } from '../src/renderer/clean';
import { extractPage } from '../src/segmentation/extract';
import { readPageCode, register, type Affine } from '../src/segmentation/register';
import { PDFDocument } from 'pdf-lib';
import { CURSIVE_KEYS, CURSIVE_PAGES, MM, TEMPLATE_PAGES, TEMPLATE_KEYS, SINGLES, SYMBOL_KEYS, SYMBOL_PAGE } from '../src/template/layout';
import { buildTemplatePdf } from '../src/template/pdf';
import { blankPage, writeU } from './synthetic';

describe('template layout', () => {
  it('contains every requested key with unique box ids', () => {
    for (const k of SINGLES) expect(TEMPLATE_KEYS).toContain(k);
    const ids = TEMPLATE_PAGES.flat().map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of TEMPLATE_PAGES.flat()) { expect(b.x + b.w).toBeLessThanOrEqual(198.01); expect(b.y + b.h).toBeLessThan(280); }
  });

  it('puts arrows and symbols on one page of their own, after the unchanged letter pages', () => {
    expect(SYMBOL_PAGE).toBe(7);
    expect(new Set(TEMPLATE_PAGES[SYMBOL_PAGE].map((b) => b.key))).toEqual(new Set(SYMBOL_KEYS));
    expect(TEMPLATE_PAGES[0][0]).toEqual({ id: '1-0-0', key: 'a', page: 0, x: 12, y: 26, w: 15.5, h: 22 }); // v1 sheets stay readable
    for (const k of SYMBOL_KEYS) expect(TEMPLATE_KEYS.filter((t) => t === k)).toHaveLength(1);
  });

  it('adds the joined-up writing pages last, each key once', () => {
    expect(CURSIVE_PAGES.length).toBeGreaterThan(0);
    expect(CURSIVE_PAGES[0]).toBe(SYMBOL_PAGE + 1);
    for (const k of CURSIVE_KEYS) expect(TEMPLATE_KEYS.filter((t) => t === k)).toHaveLength(1);
  });

  it('builds the PDF, also just the symbol page (arrows etc. drawn where Helvetica has no glyph)', async () => {
    expect((await PDFDocument.load(await buildTemplatePdf())).getPageCount()).toBe(TEMPLATE_PAGES.length);
    expect((await PDFDocument.load(await buildTemplatePdf([SYMBOL_PAGE]))).getPageCount()).toBe(1);
  });
});

describe('segmentation', () => {
  const rot = 0.01; // a slightly rotated, shifted and scaled export
  const skew: Affine = [MM * 1.01 * Math.cos(rot), -MM * Math.sin(rot), 14, MM * Math.sin(rot), MM * 1.01 * Math.cos(rot), -9];

  for (const [name, T] of [['straight', undefined], ['rotated', skew]] as const) {
    it(`registers marks and reads the page code (${name})`, () => {
      const p = blankPage(3, T);
      const found = register(p.img);
      const ref = T ?? [MM, 0, 0, 0, MM, 0];
      found.forEach((v, i) => expect(Math.abs(v - ref[i])).toBeLessThan(i % 3 === 2 ? 1.5 : 0.01));
      expect(readPageCode(p.img, found) & 31).toBe(3);
    });
  }

  it('cuts out written boxes, drops guides and empty boxes, finds entry/exit', () => {
    const p = blankPage(0, skew);
    const [a1, a2] = TEMPLATE_PAGES[0];
    writeU(p, a1); writeU(p, a2, 1);
    const { page, variants } = extractPage(p.img);
    expect(page).toBe(0);
    expect(variants.map((v) => v.src)).toEqual([a1.id, a2.id]);
    const v = variants[0];
    expect(v.key).toBe('a');
    // ink sits on the baseline (within half a mm)
    let lowest = 0;
    for (let i = 0; i < v.alpha.length; i++) if (v.alpha[i] > 128) lowest = Math.max(lowest, Math.floor(i / v.w));
    expect(Math.abs(lowest - v.baseline)).toBeLessThan(0.6 * MM);
    expect(v.entry).not.toBeNull();
    expect(v.exit).not.toBeNull();
    expect(v.entry!.x).toBeLessThan(v.w * 0.2);
    expect(v.exit!.x).toBeGreaterThan(v.w * 0.8);
    expect(v.exit!.dx).toBeGreaterThan(0.3); // leaves to the upper right
    expect(v.exit!.dy).toBeLessThan(0);
    expect(v.strokeW).toBeGreaterThan(3); expect(v.strokeW).toBeLessThan(8); // ~0.5 mm pen
  });

  it('reads the symbol page', () => {
    const p = blankPage(SYMBOL_PAGE);
    const b = TEMPLATE_PAGES[SYMBOL_PAGE][0];
    writeU(p, b);
    const { page, variants } = extractPage(p.img);
    expect(page).toBe(SYMBOL_PAGE);
    expect(variants.map((v) => [v.src, v.key])).toEqual([[b.id, '→']]);
  });

  it('ignores the grey trace-over letters of the template', () => {
    const p = blankPage(0);
    const b = TEMPLATE_PAGES[0][0];
    p.line([b.x + 4, b.y + 10], [b.x + 11, b.y + 15], 0.8, [222, 222, 222]); // GHOST colour from template/pdf.ts
    expect(extractPage(p.img).variants).toEqual([]);
  });

  it('tells joined from separate pairs', () => {
    const pi = TEMPLATE_PAGES.findIndex((pg) => pg.some((b) => b.key === 'ch'));
    const [b1, b2] = TEMPLATE_PAGES[pi].filter((b) => b.key === 'ch');
    const p = blankPage(pi);
    writeU(p, b1); writeU(p, b1, 5.6); // second starts where the first ends: joined
    writeU(p, b2); writeU(p, b2, 9); // clear gap
    const vs = extractPage(p.img).variants;
    expect(vs.find((v) => v.src === b1.id)!.connected).toBe(true);
    expect(vs.find((v) => v.src === b2.id)!.connected).toBe(false);
  });
});

// ---------- layout & connections (no bitmaps needed) ----------
const glyph = (key: string, i: number, connected?: boolean): GlyphMeta => ({
  src: `${key}-${i}`, key, w: 60, h: 120, baseline: 100, strokeW: 5, connected,
  entry: { x: 2, y: 98, dx: 0.7, dy: -0.7, w: 5 }, exit: { x: 58, y: 95, dx: 0.8, dy: -0.6, w: 5 },
});
const libOf = (keys: string[], n = 3, conn?: (k: string) => boolean) =>
  new Map(keys.map((k) => [k, Array.from({ length: n }, (_, i) => glyph(k, i, conn?.(k)))]));
const S: Settings = { xh: 3, lineH: 10, margin: 15, pageW: 210, pageH: 297, hasty: 0.3, seed: 7 };

describe('unit selection', () => {
  it('prefers word > trigram > pair > single', () => {
    const lib = libOf([...'abcdehinrstu', 'und', 'sch', 'ch', 'en']);
    expect(segment('und', lib)).toEqual(['und']);
    expect(segment('schen,', lib)).toEqual(['sch', 'en', ',']);
    expect(segment('Bach', lib)).toEqual(['B', 'a', 'ch']);
  });

  it('sometimes writes the single letters instead of a pair, but only when they exist', () => {
    const lib = libOf([...'Fenst', 'st'], 1);
    expect(segment('Fenster', lib, () => 0)).toEqual(['F', 'e', 'n', 'st', 'e', 'r']);
    expect(segment('Fenster', lib, () => 0.99)).toEqual([...'Fenster']);
    const noT = libOf([...'Fens', 'st'], 1);
    expect(segment('Fenster', noT, () => 0.99)).toEqual(['F', 'e', 'n', 'st', 'e', 'r']); // no t of its own: keep the pair
  });
});

describe('connection model', () => {
  it('learns per pair and falls back to letter and global rates', () => {
    const lib = new Map([
      ['ch', [glyph('ch', 0, true), glyph('ch', 1, true), glyph('ch', 2, false)]],
      ['ou', [glyph('ou', 0, false)]],
    ]);
    const p = connectionModel(lib);
    expect(p('c', 'h')).toBeCloseTo(2 / 3);
    expect(p('o', 'u')).toBe(0);
    expect(p('c', 'x')).toBeCloseTo(2 / 3); // only "c" onwards is known
    expect(p('a', ',')).toBe(0);
    expect(p('A', 'h')).toBeLessThan(p('a', 'h'));
  });
});

describe('layout', () => {
  const lib = libOf([...'abcdefghijklmnopqrstuvwxyz'], 3, () => true);
  const always = libOf([...'abcdefghijklmnopqrstuvwxyz', 'ab'], 3, () => true);

  it('is reproducible per seed and varies across seeds', () => {
    const a = layout('hallo welt', lib, S), b = layout('hallo welt', lib, S), c = layout('hallo welt', lib, { ...S, seed: 8 });
    expect(a).toEqual(b);
    expect(a.pages[0].glyphs.map((g) => g.m)).not.toEqual(c.pages[0].glyphs.map((g) => g.m));
  });

  it('draws a function graph as pen strokes and pushes the following line below it', () => {
    const digits = libOf([...'abcdefghijklmnopqrstuvwxyz0123456789-,'], 3, () => true);
    const { pages, missing } = layout(clean('a\n[[plot: x^2 - 1, -3..3]]\nc', () => true), digits, S);
    expect(pages).toHaveLength(1);
    expect(missing.size).toBe(0);
    const pg = pages[0], ys = pg.glyphs.map((p) => p.m[3] * p.g.baseline + p.m[5]), first = ys[0], last = ys.at(-1)!; // single letters: no joins, so every connector belongs to the graph
    expect(pg.connectors.length).toBeGreaterThan(2 + 4 + 8 + 10); // axes, arrow heads, ticks, curve
    // every stroke lies between the line before and the line after, inside the margins
    for (const c of pg.connectors) for (const [x, y] of c.p) {
      expect(y).toBeGreaterThan(first); expect(y).toBeLessThan(last - 1.2 * S.xh);
      expect(x).toBeGreaterThanOrEqual(S.margin - 0.5); expect(x).toBeLessThanOrEqual(S.pageW - S.margin + 0.5);
    }
    expect(pg.lines.map((l) => l.text)).toEqual(['a', 'Graph: x^2-1', 'c']);
    // the GoodNotes file gets every stroke as pen ink
    expect(inkStrokes({ ...pg, glyphs: [] }, () => { throw new Error('no glyphs'); })).toHaveLength(pg.connectors.length);
    // a formula the app cannot read is written as text
    expect(layout(clean('[[plot: quatsch(x)]]', () => true), digits, S).pages[0].lines[0].text).toBe('plot: quatsch(x)');
    // near the page end the graph moves to the next page as a whole
    const two = layout(clean('a\n'.repeat(22) + '[[plot: x^2, -3..3]]', () => true), digits, S).pages;
    expect(two).toHaveLength(2);
    expect(two[0].connectors).toHaveLength(0);
  });

  it('draws a mind map and pushes the following line below it', () => {
    const map = clean('Mindmap: zelle\n- kern\n  - dna\n- wand\n- plasma', () => true);
    const { pages } = layout(`${map}\nab`, lib, S);
    expect(pages).toHaveLength(1);
    const ys = pages[0].glyphs.map((g) => g.m[5]), after = ys.slice(-2), inMap = ys.slice(0, -2);
    expect(pages[0].connectors.length).toBeGreaterThanOrEqual(4 + 3 + 3); // frame, links, underlines
    expect(Math.min(...after)).toBeGreaterThan(Math.max(...inMap) + S.lineH / 2);
    // frame, links and underlines all end above the following line's letters
    expect(pages[0].connectors.filter((c) => c.p.every((q) => q[1] < Math.min(...after) - 1.2 * S.xh)).length).toBeGreaterThanOrEqual(4 + 3 + 3);
    // the GoodNotes file gets every stroke (frame, links, underlines) as pen ink, plus a red box per missing character
    expect(inkStrokes({ ...pages[0], glyphs: [] }, () => { throw new Error('no glyphs'); })).toHaveLength(pages[0].connectors.length + pages[0].missing.length);
    // more than 8 branches: an indented list instead
    const list = layout(clean('Mindmap: zelle\n' + [...'abcdefghi'].map((c) => `- ${c}${c}`).join('\n'), () => true), lib, S);
    expect(list.pages[0].lines.length).toBeGreaterThan(9);
  });

  it('writes a flash card into a frame: question left, answer right of the fold line, text around it kept clear', () => {
    const long = (c: Page['connectors'][number]) => Math.hypot(c.p[3][0] - c.p[0][0], c.p[3][1] - c.p[0][1]) > 15;
    const { pages } = layout(clean('vorher\n\nKarteikarte: was\nAntwort: das\n\nnachher', () => true), lib, S);
    const g = pages[0].glyphs.map((p) => p.m), frame = pages[0].connectors.filter(long), mid = S.pageW / 2;
    expect(frame).toHaveLength(5); // four sides and the fold line
    const ys = frame.flatMap((c) => [c.p[0][1], c.p[3][1]]), top = Math.min(...ys), bot = Math.max(...ys);
    for (const m of g.slice(0, 6)) expect(m[5]).toBeLessThan(top - 0.5 * S.xh); // "vorher" ends above the frame
    for (const m of g.slice(6, 9)) { expect(m[4]).toBeLessThan(mid); expect(m[5]).toBeGreaterThan(top); expect(m[5]).toBeLessThan(bot); }
    for (const m of g.slice(9, 12)) { expect(m[4]).toBeGreaterThan(mid); expect(Math.abs(m[5] - g[6][5])).toBeLessThan(1); }
    for (const m of g.slice(12)) expect(m[5]).toBeGreaterThan(bot + 2 * S.xh); // "nachher" starts below it
    expect(inkStrokes({ ...pages[0], glyphs: [] }, () => { throw new Error('no glyphs'); })).toHaveLength(pages[0].connectors.length);
    // a note box: one frame, no fold line (the fifth stroke underlines "Merke:")
    expect(layout(clean('Merke: ab\ncd', () => true), lib, S).pages[0].connectors.filter(long)).toHaveLength(5);
  });

  it('never splits a card over two pages', () => {
    const long = (c: Page['connectors'][number]) => Math.hypot(c.p[3][0] - c.p[0][0], c.p[3][1] - c.p[0][1]) > 15;
    const { pages } = layout(clean(Array.from({ length: 30 }, () => 'Karteikarte: was\nAntwort: das\naber\nauch').join('\n\n'), () => true), lib, S);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.connectors.filter(long))).toHaveLength(30 * 5);
    for (const p of pages) {
      expect(p.glyphs.length % 14).toBe(0); // whole cards only (14 letters each)
      for (const c of p.connectors.filter(long)) for (const q of c.p) { expect(q[1]).toBeGreaterThan(S.margin - S.lineH); expect(q[1]).toBeLessThan(S.pageH - S.margin + S.lineH); }
    }
  });

  it('writes Cornell notes: cues left of a pen line, notes right of it, the summary below a line across', () => {
    const long = (c: Page['connectors'][number]) => Math.hypot(c.p[3][0] - c.p[0][0], c.p[3][1] - c.p[0][1]) > 15;
    const { pages } = layout(clean('Cornell: ab\nwas | das\naber\nwo | da\nZusammenfassung: gut', () => true), lib, S);
    const g = pages[0].glyphs.map((p) => p.m), x = S.margin + 0.3 * (S.pageW - 2 * S.margin);
    const vert = pages[0].connectors.filter(long).find((c) => Math.abs(c.p[0][0] - c.p[3][0]) < 1)!;
    const across = pages[0].connectors.find((c) => Math.abs(c.p[0][0] - c.p[3][0]) > 100)!;
    expect(Math.abs(vert.p[0][0] - x)).toBeLessThan(0.5);
    expect(Math.abs(vert.p[3][0] - x)).toBeLessThan(0.5);
    expect(Math.abs(across.p[0][1] - across.p[3][1])).toBeLessThan(0.5);
    expect(Math.abs(vert.p[3][1] - across.p[0][1])).toBeLessThan(0.5); // the column line ends on the line across
    // ab | was das aber | wo da | (summary): cues left, notes right, each row level, rows in order
    for (const i of [2, 3, 4, 12, 13]) expect(g[i][4]).toBeLessThan(x);
    for (const i of [5, 6, 7, 8, 9, 10, 11, 14, 15]) expect(g[i][4]).toBeGreaterThan(x);
    expect(Math.abs(g[2][5] - g[5][5])).toBeLessThan(1);
    expect(g[8][5]).toBeGreaterThan(g[5][5] + S.lineH / 2);
    expect(Math.abs(g[12][5] - g[14][5])).toBeLessThan(1);
    expect(g[12][5]).toBeGreaterThan(g[8][5] + S.lineH / 2);
    for (const m of g.slice(16)) expect(m[5]).toBeGreaterThan(across.p[0][1]); // the summary
    // over two pages: a column line on each, every row whole
    const two = layout(clean('Cornell: ab\n' + Array.from({ length: 40 }, () => 'was | das').join('\n'), () => true), lib, S).pages;
    expect(two).toHaveLength(2);
    for (const p of two) expect(p.connectors.filter(long).filter((c) => Math.abs(c.p[0][0] - c.p[3][0]) < 1)).toHaveLength(1);
    expect((two[0].glyphs.length - 2) % 6).toBe(0);
  });

  it('writes a card taller than a whole page as plain lines over the pages', () => {
    const long = (c: Page['connectors'][number]) => Math.hypot(c.p[3][0] - c.p[0][0], c.p[3][1] - c.p[0][1]) > 15;
    const { pages } = layout(clean('Karteikarte: was\nAntwort: das\n' + Array(40).fill('ab').join('\n'), () => true), lib, S);
    expect(pages).toHaveLength(2);
    expect(pages.flatMap((p) => p.connectors.filter(long))).toHaveLength(0);
    expect(pages.flatMap((p) => p.glyphs)).toHaveLength(6 + 80);
    for (const p of pages) for (const g of p.glyphs) expect(g.m[5]).toBeLessThan(S.pageH - S.margin + 1);
  });

  it('writes a fraction stacked: numerator above, denominator below a bar', () => {
    const { pages } = layout('x = \u0011ab\u0012c\u0013,', lib, S);
    const [, a, b, c] = pages[0].glyphs; // x, a, b, c, comma
    const bar = pages[0].connectors.reduce((m, c) => (c.p[3][0] - c.p[0][0] > m.p[3][0] - m.p[0][0] ? c : m)).p, // the widest stroke is the bar
      barY = (bar[0][1] + bar[3][1]) / 2;
    const base = (g: typeof a) => g.m[3] * g.g.baseline + g.m[5]; // baseline height on the page
    expect(base(a)).toBeLessThan(barY);
    expect(base(b)).toBeCloseTo(base(a), 0);
    expect(base(c) - c.m[3] * 70).toBeGreaterThan(barY - 0.5); // top of the denominator under the bar
    expect(pages[0].lines[0].text).toBe('x = ab/c,');
  });

  it('draws a root by hand: hook and a bar over the whole radicand, taller around a fraction, the index small in the hook', () => {
    const R = (rad: string, n = '') => `\u0007${n}\u001d${rad}\u001e`;
    const span = (p: Page) => { const xs = p.glyphs.map((g) => g.m[4]); return [Math.min(...xs), Math.max(...xs) + 60 * 0.06]; }; // glyphs are 60 px wide, ~0.06 mm/px
    const bars = (p: Page) => p.connectors.map((c) => c.p).sort((a, b) => (b[3][0] - b[0][0]) - (a[3][0] - a[0][0])); // widest first
    const root = layout(`x = ${R('ab')},`, lib, S).pages[0]; // two words: no join between the letters, only the root's strokes
    expect(root.connectors).toHaveLength(4); // tick, down, up, bar
    const [bar] = bars(root), [, a, b] = root.glyphs, top = a.m[5]; // glyph top on the page (y of the bitmap's row 0)
    expect(bar[0][0]).toBeLessThan(a.m[4]);
    expect(bar[3][0]).toBeGreaterThan(b.m[4] + 60 * b.m[0]); // past the last letter
    expect(Math.abs(bar[0][1] - bar[3][1])).toBeLessThan(0.5); // level
    expect(bar[0][1]).toBeLessThan(top + 1); // above the letters
    expect(root.lines[0].text).toBe('x = √(a b),');
    // every stroke of the hook ends where the next begins (one pen movement)
    const c = root.connectors.map((k) => k.p);
    for (let i = 0; i + 1 < c.length; i++) expect(Math.hypot(c[i][3][0] - c[i + 1][0][0], c[i][3][1] - c[i + 1][0][1])).toBeLessThan(0.6);

    const frac = layout(R('\u0011a\u0012b\u0013'), lib, S).pages[0];
    expect(frac.connectors).toHaveLength(5); // the root and the fraction bar
    const ys = frac.connectors.flatMap((k) => [k.p[0][1], k.p[3][1]]), tall = Math.max(...ys) - Math.min(...ys);
    const ys1 = root.connectors.flatMap((k) => [k.p[0][1], k.p[3][1]]);
    expect(tall).toBeGreaterThan(1.2 * (Math.max(...ys1) - Math.min(...ys1)));
    expect(frac.lines[0].text).toBe('√(a/b)');

    const nested = layout(R(`${R('a')}\u0010b`), lib, S).pages[0];
    expect(nested.connectors).toHaveLength(8);
    const [outer, inner] = bars(nested);
    expect(outer[0][1]).toBeLessThan(inner[0][1]); // the outer bar above the inner one
    expect(outer[3][0]).toBeGreaterThan(inner[3][0]);

    const third = layout(R('a', 'c'), lib, S).pages[0], [ra, ix] = third.glyphs;
    expect(Math.abs(ix.m[0])).toBeLessThan(0.7 * Math.abs(ra.m[0])); // the index is small
    expect(ix.m[4]).toBeLessThan(ra.m[4]); // and stands left, in the hook
    expect(third.lines[0].text).toBe('c√a');

    // a root in a fraction keeps numerator and denominator stacked, nothing is left unwritten
    const mixed = layout(`\u0011a\u0010${R('b')}\u0012c\u0013`, lib, S).pages[0];
    expect(mixed.glyphs).toHaveLength(3);
    expect(mixed.connectors).toHaveLength(5);
    expect(mixed.missing).toHaveLength(0);
  });

  it('marks heading ink (letters and underline) for the heading colour, nothing else', () => {
    const { pages } = layout('\u0006\u0002ab\u0003\ncd', lib, S);
    expect(pages[0].glyphs.map((g) => !!g.accent)).toEqual([true, true, false, false]);
    expect(pages[0].connectors.some((c) => c.accent)).toBe(true); // the underline
  });

  it('writes compactly after a deep fraction or root: the boxed result beside the formula, the next fraction just clear of it', () => {
    // the box holds x-height letters (like "2 s"): the test font's full-height boxes would decide by size jitter alone whether it fits beside
    const low = new Map(lib);
    for (const k of 'cd') low.set(k, lib.get(k)!.map((g) => ({ ...g, h: 100, baseline: 80 })));
    const base = (g: Page['glyphs'][number]) => g.m[3] * g.g.baseline + g.m[5]; // baseline height on the page
    const bottom = (g: Page['glyphs'][number]) => g.m[5] + g.g.h * g.m[3];
    const frac = '\u0011a\u0012b\u0013', root = `\u0007\u001d${frac}\u001e`, box = '\u0016cd\u0017';
    /** Lines between the first and the last glyph's baseline. */
    const lines = (...text: string[]) => { const g = layout(text.join('\n'), low, S).pages[0].glyphs; return (base(g.at(-1)!) - base(g[0])) / S.lineH; };
    expect(lines(`x ${frac}`, 'cd') - lines('x a', 'cd')).toBeCloseTo(0, 1); // plain text under a fraction does not move
    // the boxed result goes up beside the formula line: same baseline as its "x", right of the fraction, frame and all
    for (const formula of [frac, root]) {
      const p = layout([`x ${formula}`, box].join('\n'), low, S).pages[0], [x, a] = p.glyphs, c = p.glyphs.at(-2)!;
      expect(base(c) - base(x)).toBeCloseTo(0, 0);
      expect(c.m[4]).toBeGreaterThan(a.m[4] + 60 * a.m[0]);
      const frame = p.connectors.slice(-4).flatMap((k) => [k.p[0], k.p[3]]);
      expect(Math.min(...frame.map((q) => q[0]))).toBeGreaterThan(a.m[4] + 60 * a.m[0]);
      expect(Math.min(...frame.map((q) => q[1]))).toBeLessThan(base(c)); // around the letters, not left below
      expect(Math.max(...frame.map((q) => q[1]))).toBeGreaterThan(base(c));
    }
    // what follows starts on the next line, not two further down
    expect(lines(`x ${frac}`, box, 'ab')).toBeLessThan(2.5);
    // no room beside a long line: the box goes below, by whole lines (on the ruling), its top under the denominator
    // (the line is filled word by word until the fraction ends so far right that the box no longer fits beside it)
    const filled = Array.from({ length: 40 }, (_, n) => layout([`${Array(n + 1).fill('abcd').join(' ')} ${frac}`, box].join('\n'), low, S).pages[0])
      .find((p) => base(p.glyphs.at(-1)!) > base(p.glyphs.at(-3)!));
    expect(filled).toBeDefined();
    const q = filled!, den = q.glyphs.at(-3)!;
    expect(Math.min(...q.connectors.slice(-4).flatMap((k) => [k.p[0][1], k.p[3][1]]))).toBeGreaterThan(bottom(den));
    // a fraction under a fraction: the second numerator starts below the first denominator
    const two = layout([frac, frac].join('\n'), low, S).pages[0].glyphs;
    expect(two[2].m[5]).toBeGreaterThan(bottom(two[1]));
  });

  it('draws a ring around circled words and a box around boxed ones', () => {
    const plain = layout('ab cd', lib, S).pages[0].connectors.length;
    const circ = layout('\u0014ab cd\u0015', lib, S).pages[0];
    expect(circ.connectors.length).toBe(plain + 5); // ellipse in five pieces
    const ring = circ.connectors.slice(-5).flatMap((c) => c.p.map((p) => p[0]));
    const ink = circ.glyphs.map((g) => g.m[4]);
    expect(Math.min(...ring)).toBeLessThan(Math.min(...ink));
    expect(layout('\u0016ab\u0017', lib, S).pages[0].connectors.length).toBe(layout('ab', lib, S).pages[0].connectors.length + 4);
    // the next word keeps clear of the ring
    const one = layout('\u0014ab\u0015 cd', lib, S).pages[0];
    const ringR = Math.max(...one.connectors.slice(-5).flatMap((c) => c.p.map((p) => p[0]))), next = one.glyphs.find((g) => g.g.key === 'c')!;
    expect(next.m[4] + next.m[2] * next.g.baseline).toBeGreaterThan(ringR + 0.3 * S.xh);
  });

  it('draws the box of a boxed word with lines pulled straight: no bow, about level and plumb, but not computer-exact', () => {
    const plain = layout('ab', lib, S).pages[0].connectors.length;
    const frame = layout('\u0016ab\u0017', lib, S).pages[0].connectors.slice(plain);
    expect(frame).toHaveLength(4);
    const offs = frame.map((c) => {
      const [a, , , b] = c.p, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (const p of c.p) expect(Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len).toBeLessThan(1e-9); // no bow
      return (Math.min(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / len) * (180 / Math.PI); // degrees off level / plumb
    });
    for (const d of offs) expect(d).toBeLessThan(0.8);
    expect(Math.max(...offs)).toBeGreaterThan(0.01);
  });

  it('lets the left edge wander and indents wrapped list items under their text', () => {
    const long = Array.from({ length: 40 }, () => 'abc').join(' ');
    const { pages } = layout(`${long}\n- ${long}`, lib, { ...S, seed: 3 });
    // first glyph of each line = smallest x among glyphs on that baseline
    const starts = new Map<number, number>();
    for (const g of pages[0].glyphs) { const y = Math.round(g.m[5] / 5); starts.set(y, Math.min(starts.get(y) ?? Infinity, g.m[4])); }
    const xs = [...starts.values()];
    expect(new Set(xs.map((x) => x.toFixed(2))).size).toBeGreaterThan(2); // not all at one spot
    expect(Math.max(...xs.slice(-2))).toBeGreaterThan(Math.min(...xs) + 2); // the bullet's wrapped lines sit further right
  });

  it('breaks a word wider than the line with a hyphen instead of running off the page', () => {
    const hy = new Map([...lib, ['-', lib.get('a')!.map((g) => ({ ...g, key: '-' }))]]);
    const { pages } = layout('a'.repeat(300), hy, S);
    for (const g of pages[0].glyphs) expect(g.m[4] + g.m[0] * g.g.w).toBeLessThan(S.pageW - S.margin / 2); // bitmap box, includes its empty edge
    expect(new Set(pages[0].glyphs.map((g) => Math.round(g.m[5] / 5))).size).toBeGreaterThan(1); // more than one line
  });

  it('moves nested list items to the right', () => {
    const { pages } = layout('ab\n\u0018ab\n\u0018\u0018ab', lib, { ...S, hasty: 0 });
    const xs = [0, 1, 2].map((i) => pages[0].glyphs[i * 2].m[4]);
    expect(xs[1]).toBeGreaterThan(xs[0] + S.xh);
    expect(xs[2]).toBeGreaterThan(xs[1] + S.xh);
  });

  it('never repeats the same sample back to back', () => {
    const { pages } = layout('aaaaaaaaaaaa', lib, S);
    const srcs = pages[0].glyphs.map((g) => g.g.src);
    for (let i = 1; i < srcs.length; i++) expect(srcs[i]).not.toBe(srcs[i - 1]);
  });

  it('joins letters with a connector that starts at the exit and ends at the entry', () => {
    const { pages } = layout('ab', always, { ...S, seed: 1 });
    // "ab" exists as a pair sample, so no synthetic connector is needed
    expect(pages[0].glyphs).toHaveLength(1);
    const two = layout('ba', lib, { ...S, hasty: 1 });
    const [g1, g2] = two.pages[0].glyphs, c = two.pages[0].connectors[0];
    expect(c).toBeDefined();
    const at = (m: number[], x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const ex = at(g1.m, 58, 95), en = at(g2.m, 2, 98);
    expect(c.p[0][0]).toBeCloseTo(ex[0]); expect(c.p[0][1]).toBeCloseTo(ex[1]);
    expect(c.p[3][0]).toBeCloseTo(en[0]); expect(c.p[3][1]).toBeCloseTo(en[1]);
    expect(en[0]).toBeGreaterThan(ex[0]); // entry lies to the right of the exit
  });

  it('tucks a letter under an overhang and keeps word gaps clear', () => {
    // "T": bar across the top bands, stem in the middle; "e": only in the x-height bands
    const T: GlyphMeta = { ...glyph('T', 0), entry: null, exit: null, prof: { l: [null, null, 0, 0, 25, 25, 25, 25, null, null], r: [null, null, 60, 60, 35, 35, 35, 35, null, null] } };
    const e: GlyphMeta = { ...glyph('e', 0), entry: null, exit: null, prof: { l: [null, null, null, null, null, 0, 0, 0, null, null], r: [null, null, null, null, null, 40, 40, 40, null, null] } };
    const lib = new Map([['T', [T]], ['e', [e]]]);
    const { pages } = layout('Te Te', lib, { ...S, hasty: 0 });
    const [gT, gE, gT2] = pages[0].glyphs;
    const rightT = gT.m[0] * 60 + gT.m[4];
    expect(gE.m[4]).toBeLessThan(rightT); // e starts under the T bar
    expect(gT2.m[4] - (gE.m[0] * 40 + gE.m[4])).toBeGreaterThan(0.7 * S.xh); // word gap measured ink to ink
    expect(gT2.m[4] - (gE.m[0] * 40 + gE.m[4])).toBeLessThan(1.3 * S.xh); // … not from the empty bitmap edge
    expect(pages[0].lines).toEqual([expect.objectContaining({ text: 'Te Te' })]);
  });

  it('joins every letter inside a word in cursive mode, even without detected strokes, and uses word parts', () => {
    const e: GlyphMeta = { ...glyph('e', 0), entry: null, exit: null, prof: { l: [null, null, null, null, null, 0, 0, 0, null, null], r: [null, null, null, null, null, 40, 40, 40, null, null] } };
    const lib = new Map([['e', [e]], ['keit', [{ ...e, key: 'keit', src: 'keit' }]]]);
    expect(layout('eee', lib, S).pages[0].connectors).toHaveLength(0);
    expect(layout('eee ee', lib, { ...S, cursive: true }).pages[0].connectors).toHaveLength(3); // not across the space
    expect(segment('heiterkeit', lib)).toEqual([...'heiter', 'keit']);
    // a word part in a wide box (empty space on the right): the next letter follows its ink, not the bitmap edge
    const wide: GlyphMeta = { ...e, key: 'ver', src: 'ver', w: 300, prof: { l: e.prof!.l, r: e.prof!.r } };
    const lib2 = new Map([['e', [e]], ['ver', [wide]]]);
    const [a, b] = layout('vere', lib2, { ...S, cursive: true, hasty: 0 }).pages[0].glyphs;
    expect(b.m[4] - a.m[4]).toBeLessThan(60 * a.m[0]); // ink ends at x = 40 px, the bitmap at 300 px
  });

  it('underlines emphasised words with one pen stroke below the baseline', () => {
    const plain = new Map([...'abcdefghijklmnopqrstuvwxyz'].map((k) => [k, [{ ...glyph(k, 0), entry: null, exit: null }]]));
    const { pages } = layout(`${EMPH[0]}hallo welt${EMPH[1]} ende`, plain, { ...S, hasty: 0 });
    const [u, ...more] = pages[0].connectors;
    expect(more).toHaveLength(0);
    const first = pages[0].glyphs[0], ende = pages[0].glyphs[9]; // "hallo" + "welt" = 9 letters
    expect(Math.abs(u.p[0][0] - first.m[4])).toBeLessThan(1);
    expect(u.p[3][0]).toBeLessThan(ende.m[4]);
    expect(u.p[0][1]).toBeGreaterThan(S.margin + S.lineH);
    expect(pages[0].lines[0].text).toBe('hallo welt ende');
  });

  it('writes heading lines bigger', () => {
    const plain = new Map([...'abcdefghijklmnopqrstuvwxyz'].map((k) => [k, [{ ...glyph(k, 0), entry: null, exit: null }]]));
    const { pages } = layout(`${HEAD}titel\ntext`, plain, { ...S, hasty: 0 });
    const [head, body] = [pages[0].glyphs[0], pages[0].glyphs[5]];
    expect(head.m[3] / body.m[3]).toBeGreaterThan(1.2);
    expect(pages[0].lines.map((l) => l.text)).toEqual(['titel', 'text']);
  });

  it('draws a structural formula with pen-stroke bonds and letters, then continues below it', () => {
    const plain = new Map([...'abcdefghijklmnopqrstuvwxyzCHO'].map((k) => [k, [{ ...glyph(k, 0), entry: null, exit: null }]]));
    const { pages } = layout(`eins\n${STRUCT[0]}Ethanol${STRUCT[1]}\nzwei`, plain, { ...S, hasty: 0 });
    const pg = pages[0];
    expect(pg.connectors).toHaveLength(8 + 2); // 8 single bonds, 2 free electron pairs on O
    expect(pg.glyphs.length).toBe(4 + 9 + 4); // eins, C C O + 6 H, zwei
    expect(pg.lines.map((l) => l.text)).toEqual(['eins', 'Ethanol', 'zwei']);
    const top = Math.min(...pg.connectors.flatMap((c) => c.p.map((q) => q[1])));
    const bottom = Math.max(...pg.connectors.flatMap((c) => c.p.map((q) => q[1])));
    expect(top).toBeGreaterThan(pg.glyphs[0].m[5]); // pushed below "eins"
    expect(pg.glyphs.at(-1)!.m[5]).toBeGreaterThan(bottom + S.xh);
    expect(layout(`${STRUCT[0]}Quatsch${STRUCT[1]}`, plain, S).pages[0].lines[0].text).toBe('Quatsch');
  });

  it('writes a reaction in one line: molecules side by side with + and arrow', () => {
    const plain = new Map([...'abcdefghijklmnopqrstuvwxyzCHO+→2'].map((k) => [k, [{ ...glyph(k, 0), entry: null, exit: null }]]));
    const m = (n: string) => `${STRUCT[0]}${n}${STRUCT[1]}`;
    const { pages } = layout(`${m('Methan')} + 2 ${m('Sauerstoff')} → ${m('Kohlenstoffdioxid')} + 2 ${m('Wasser')}`, plain, { ...S, hasty: 0 });
    expect(pages[0].lines.map((l) => l.text)).toEqual(['Methan + 2 Sauerstoff → Kohlenstoffdioxid + 2 Wasser']);
    const plus = pages[0].glyphs.filter((g) => g.g.key === '+').map((g) => g.m[4]);
    expect(plus).toHaveLength(2);
    expect(plus[1]).toBeGreaterThan(plus[0] + 20); // CO2 sits between them
  });

  it('draws every arrow as pen strokes at mid x-height, as long as marked or as its label', () => {
    const plain = new Map([...'abcdefghijklmnopqrstuvwxyzAB'].map((k) => [k, [{ ...glyph(k, 0), entry: null, exit: null }]])); // no arrow, no - = < >
    const run = (t: string) => layout(clean(t, (c) => plain.has(c)), plain, { ...S, hasty: 0 }).pages[0];
    const span = (t: string) => { const x = run(t).connectors.flatMap((c) => c.p.map((q) => q[0])); return Math.max(...x) - Math.min(...x); };
    // shaft(s) + barbs: → ← 1+2, ⇒ 2+2 (was written as a bare dash), ⇔ 2+4, ↔ 1+4, ⇌ 2+2 half heads
    for (const [a, n] of [['->', 3], ['→', 3], ['<-', 3], ['=>', 4], ['⇒', 4], ['<=>', 6], ['<->', 5], ['⇌', 4]] as const) {
      const pg = run(`A ${a} B`);
      expect([a, pg.connectors.length, pg.glyphs.length, pg.missing.length]).toEqual([a, n, 2, 0]);
      for (const c of pg.connectors) for (const q of c.p) expect(Math.abs(q[1] - (S.margin + S.lineH - 0.5 * S.xh))).toBeLessThan(0.75 * S.xh);
    }
    expect(inkStrokes(run('⇒'), () => { throw new Error('no glyphs here'); })).toHaveLength(4); // real ink in the GoodNotes file
    expect(span('A -> B')).toBeLessThan(span('A --> B'));
    expect(span('A --> B')).toBeLessThan(span('A ---> B'));
    const pg = run('$\\ce{A ->[bei hoher temperatur] B}$'), lx = pg.glyphs.slice(1, -1).map((g) => g.m[4]);
    expect(lx).toHaveLength(18);
    expect(span('$\\ce{A ->[bei hoher temperatur] B}$')).toBeGreaterThan(Math.max(...lx) - Math.min(...lx)); // the label fits on its arrow
    for (const g of pg.glyphs.slice(1, -1)) expect(g.m[5]).toBeLessThan(pg.glyphs[0].m[5]); // and stands above the shaft
  });

  it('puts one highlighter stroke behind marked words, centred on the x-height', () => {
    const plain = new Map([...'abcdefghijklmnopqrstuvwxyz'].map((k) => [k, [{ ...glyph(k, 0), entry: null, exit: null }]]));
    const { pages } = layout(`eins ${MARK[0]}zwei drei${MARK[1]} vier`, plain, { ...S, hasty: 0 });
    const [k, ...more] = pages[0].marks;
    expect(more).toHaveLength(0);
    const zwei = pages[0].glyphs[4], vier = pages[0].glyphs[13];
    expect(k.x0).toBeLessThan(zwei.m[4]);
    expect(k.x1).toBeLessThan(vier.m[4]);
    expect(Math.abs(k.y0 - (S.margin + S.lineH - 0.5 * S.xh))).toBeLessThan(0.5);
    expect(pages[0].lines[0].text).toBe('eins zwei drei vier');
    expect(pages[0].connectors).toHaveLength(0);
  });

  it('wraps lines inside the margins, breaks pages and flags missing characters', () => {
    const text = Array(400).fill('hallo welt').join(' ') + ' Ä';
    const { pages, missing } = layout(text, lib, S);
    expect(pages.length).toBeGreaterThan(1);
    for (const pg of pages) for (const { g, m } of pg.glyphs) {
      const right = Math.max(m[4], m[0] * g.w + m[4], m[0] * g.w + m[2] * g.h + m[4]);
      expect(right).toBeLessThan(S.pageW - S.margin + 3);
      expect(m[5]).toBeLessThan(S.pageH);
    }
    expect([...missing]).toEqual(['Ä']);
    expect(pages.at(-1)!.missing).toHaveLength(1);
  });
});

describe('swap one letter', () => {
  it('keeps the baseline start and finds the letter under a point', async () => {
    const { swapVariant, glyphAt } = await import('../src/renderer/layout');
    const a = { ...glyph('a', 0), entry: null, exit: null }, b = { ...a, src: 'b', baseline: a.baseline + 10, scale: 1.2 };
    const page = { glyphs: [{ g: a, m: [0.1, 0, -0.01, 0.1, 20, 30] as [number, number, number, number, number, number] }], connectors: [], missing: [], lines: [], marks: [] };
    const s = swapVariant(page.glyphs[0], b);
    const base = (p: typeof s) => [p.m[2] * p.g.baseline + p.m[4], p.m[3] * p.g.baseline + p.m[5]];
    expect(base(s)[0]).toBeCloseTo(base(page.glyphs[0])[0]);
    expect(base(s)[1]).toBeCloseTo(base(page.glyphs[0])[1]);
    expect(s.m[0]).toBeCloseTo(0.12);
    expect(glyphAt(page, 20 + 0.05 * a.w, 30 + 0.05 * a.h)).toBe(0);
    expect(glyphAt(page, 20 + 0.1 * a.w + 1, 30 + 0.05 * a.h)).toBe(0); // a finger 1 mm beside it
    expect(glyphAt(page, 5, 5)).toBe(-1);
  });
});
