import { describe, expect, it } from 'vitest';
import type { GlyphMeta } from '../src/glyphstore/types';
import { clean } from '../src/renderer/clean';
import { DIAGRAM, boxBottom, boxTop, decodeDiagram, planDiagram, type Diagram, type DiagramPlan } from '../src/renderer/diagram';
import { layout, type Settings } from '../src/renderer/layout';
import { MAP, decodeMap } from '../src/renderer/mindmap';

const has = () => true;
const token = (out: string) => out.split('\n').find((l) => l.startsWith(DIAGRAM[0]));

describe('diagram: recognised in the text', () => {
  it('Ablauf: one token on its own line, the text around it stays', () => {
    const lines = clean('Vorher.\nAblauf: Reiz -> **Sinneszelle** → Nerv --> Gehirn\nDanach.', has).split('\n');
    const t = token(lines.join('\n'))!;
    expect(/\s/.test(t)).toBe(false);
    expect(lines[0]).toBe('Vorher.');
    expect(lines.at(-1)).toBe('Danach.');
    expect(decodeDiagram(t)).toEqual({ kind: 'ablauf', bullet: '•', topic: '', steps: ['Reiz', 'Sinneszelle', 'Nerv', 'Gehirn'], subs: [[], [], [], []] });
  });
  it('Kreislauf: "… -> A" at the end is not a step of its own; a title before the colon stays as a line', () => {
    const out = clean('## Kreislauf des Wassers: Verdunstung -> Wolken -> Regen -> Verdunstung', has);
    expect(out.split('\n')[0]).toBe('\u0002Kreislauf des Wassers\u0003');
    expect(decodeDiagram(token(out)!)!.steps).toEqual(['Verdunstung', 'Wolken', 'Regen']);
    expect(decodeDiagram(token(out)!)!.kind).toBe('kreislauf');
  });
  it('Schaubild: topic and a list with sub-points (an empty line between branches too)', () => {
    const d = decodeDiagram(token(clean('**Schaubild:** Zellorganellen\n- Zellkern\n  - DNA\n\n- $\\text{Mitochondrien}$\n- Ribosomen', has))!)!;
    expect(d).toEqual({ kind: 'schaubild', bullet: '•', topic: 'Zellorganellen', steps: ['Zellkern', 'Mitochondrien', 'Ribosomen'], subs: [['DNA'], [], []] });
  });
  it('leaves other lines alone: prose, no arrow, a reaction in \\ce, a Schaubild without a list', () => {
    for (const src of ['Der Ablauf ist einfach.', 'Ablauf: erst lesen, dann schreiben', 'Ablauf: $\\ce{A -> B}$', 'Schaubild: Zelle']) {
      expect(token(clean(src, has)), src).toBeUndefined();
    }
  });
  it('mind map: an empty line between branches and a) sub-points do not end it', () => {
    const t = decodeMap(clean('Mindmap: Zelle\n- Kern\n  a) DNA\n\n- Plasma', has).split('\n').find((l) => l.startsWith(MAP[0]))!)!;
    expect(t.branches.map((b) => b.title)).toEqual(['Kern', 'Plasma']);
    expect(t.branches[0].items).toEqual(['• DNA']);
  });
});

describe('diagram: planned', () => {
  const measure = (t: string, size: number) => t.length * 1.6 * size;
  const o = { width: 180, xh: 3, lineH: 10, maxRows: 26, wordGap: 1.4, measure };
  const chain = (kind: Diagram['kind'], n: number, word = 'Schritt'): Diagram => ({ kind, bullet: '-', topic: 'Oberbegriff', steps: Array.from({ length: n }, (_, i) => `${word} ${i + 1}`), subs: Array.from({ length: n }, (_, i) => (i % 2 ? [] : ['ein Unterpunkt', 'noch ein längerer Unterpunkt'])) });
  /** Nothing outside the width, no two texts or boxes overlapping, every text inside its box or outside all of them. */
  const sane = (p: DiagramPlan) => {
    const ends = (t: DiagramPlan['texts'][number]) => t.x + measure(t.text, t.size);
    for (const t of p.texts) {
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(ends(t)).toBeLessThanOrEqual(o.width + 1e-9);
      expect(t.row).toBeGreaterThanOrEqual(1);
      expect(t.row).toBeLessThanOrEqual(p.rows);
      for (const u of p.texts) if (u !== t && u.row === t.row) expect(ends(t) <= u.x || ends(u) <= t.x).toBe(true);
    }
    for (const b of p.boxes) for (const c of p.boxes) if (b !== c) {
      const apart = b.x1 <= c.x0 || c.x1 <= b.x0 || boxBottom(b.row1, b.size, o) <= boxTop(c.row0, c.size, o) || boxBottom(c.row1, c.size, o) <= boxTop(b.row0, b.size, o);
      expect(apart).toBe(true);
    }
    for (const k of p.strokes) for (const x of [k.x0, k.x1]) { expect(x).toBeGreaterThanOrEqual(-1e-9); expect(x).toBeLessThanOrEqual(o.width + 1e-9); }
  };

  it('Ablauf: a box per step, an arrow between each two; long ones go on in the next row', () => {
    for (const n of [2, 4, 8, 12]) {
      const p = planDiagram(chain('ablauf', n), o)!;
      expect(p, `${n} steps`).not.toBeNull();
      expect(p.boxes).toHaveLength(n);
      expect(p.strokes.filter((k) => k.head)).toHaveLength(n - 1);
      sane(p);
    }
    expect(new Set(planDiagram(chain('ablauf', 12), o)!.boxes.map((b) => b.row0)).size).toBeGreaterThan(1);
  });
  it('Kreislauf: one row gets the way back below (rows for it), several rows end with the first step again', () => {
    const one = planDiagram(chain('kreislauf', 3), o)!;
    expect(one.boxes).toHaveLength(3);
    expect(one.strokes.filter((k) => k.head)).toHaveLength(3);
    expect(one.rows).toBeGreaterThanOrEqual(2);
    sane(one);
    const many = planDiagram(chain('kreislauf', 9, 'langer Schritt'), o)!;
    expect(many.boxes).toHaveLength(10);
    expect(many.texts.at(-1)!.text).toBe('langer Schritt 1');
    sane(many);
  });
  it('Schaubild: topic on top, a line to each of 2–5 boxes below; 6 or a word too wide is written as a list', () => {
    for (let n = 2; n <= 5; n++) {
      const p = planDiagram(chain('schaubild', n), o)!;
      expect(p, `${n} boxes`).not.toBeNull();
      expect(p.boxes).toHaveLength(n + 1);
      expect(p.strokes).toHaveLength(n);
      expect(p.boxes.slice(1).every((b) => b.row0 > p.boxes[0].row1 + 1)).toBe(true);
      sane(p);
    }
    expect(planDiagram(chain('schaubild', 6), o)).toBeNull();
    const five = chain('schaubild', 5);
    expect(planDiagram({ ...five, steps: ['Donaudampfschifffahrtsgesellschaftskapitänsmütze', ...five.steps.slice(1)] }, o)).toBeNull();
  });
});

describe('diagram: laid out', () => {
  const glyph = (key: string): GlyphMeta => ({ src: `${key}-0`, key, w: 60, h: 120, baseline: 100, strokeW: 5, entry: { x: 2, y: 98, dx: 0.7, dy: -0.7, w: 5 }, exit: { x: 58, y: 95, dx: 0.8, dy: -0.6, w: 5 } });
  const S: Settings = { xh: 3, lineH: 10, margin: 15, pageW: 210, pageH: 297, hasty: 0.3, seed: 7 };
  const run = (src: string) => {
    const text = clean(src, has), lib = new Map([...new Set([...text].filter((c) => !/[\s\u0001-\u001f-]/.test(c)))].map((c) => [c, [glyph(c)]]));
    return layout(text, lib, S).pages;
  };
  it('draws boxes and arrows as pen strokes inside the page, and the next line below the diagram', () => {
    const pages = run('Ablauf: Reiz -> Sinneszelle -> Nerv -> Gehirn\nDanach.');
    expect(pages).toHaveLength(1);
    const p = pages[0], strokes = p.connectors.filter((c) => c.w0 === c.w1);
    expect(strokes.length).toBeGreaterThanOrEqual(4 * 4 + 3 * 3); // 4 boxes of 4 strokes, 3 arrows of shaft and two barbs
    for (const c of p.connectors) for (const [x] of c.p) { expect(x).toBeGreaterThan(S.margin - 2); expect(x).toBeLessThan(S.pageW - S.margin + 2); }
    const diagramBottom = Math.max(...strokes.flatMap((c) => c.p.map(([, y]) => y)));
    const after = p.glyphs.filter((g) => g.g.key === 'D').map((g) => g.m[5]);
    expect(Math.min(...after)).toBeGreaterThan(diagramBottom);
  });
  it('a Schaubild with 6 sub-points is written as a list, a token never reaches the page as text', () => {
    const pages = run('Schaubild: Zelle\n- a\n- b\n- c\n- d\n- e\n- f');
    expect(pages[0].lines.map((l) => l.text).join('\n')).toContain('Zelle');
    expect(pages[0].glyphs.some((g) => /[-]/.test(g.g.key))).toBe(false);
  });
});
