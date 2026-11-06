import { describe, expect, it } from 'vitest';
import { connectionModel } from '../src/connectors/connect';
import type { GlyphMeta } from '../src/glyphstore/types';
import { layout, segment, type Settings } from '../src/renderer/layout';
import { EMPH, HEAD, MARK, STRUCT } from '../src/renderer/clean';
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
