import { describe, expect, it } from 'vitest';
import { clean } from '../src/renderer/clean';
import { MAP, decodeMap, planMindmap, type MapTree } from '../src/renderer/mindmap';

const has = () => true;
const SRC = 'Vorher.\nMindmap: Zellatmung\n- Glykolyse\n  - Zytoplasma\n  - 2 ATP\n- **Citratzyklus**\n- Atmungskette\nDanach.';

describe('mind map', () => {
  it('clean keeps the block as one token on its own line', () => {
    const lines = clean(SRC, has).split('\n');
    const token = lines.find((l) => l.startsWith(MAP[0]))!;
    expect(/\s/.test(token)).toBe(false);
    expect(lines[0]).toBe('Vorher.');
    expect(lines.at(-1)).toBe('Danach.');
    expect(decodeMap(token)).toEqual({ bullet: '•', topic: 'Zellatmung', branches: [
      { title: 'Glykolyse', items: ['• Zytoplasma', '• 2 ATP'] }, { title: 'Citratzyklus', items: [] }, { title: 'Atmungskette', items: [] },
    ] });
  });
  it('leaves "Mindmap:" without a list alone', () => {
    expect(clean('Mindmap: nur ein Wort', has)).toBe('Mindmap: nur ein Wort');
  });

  const measure = (t: string, size: number) => t.length * 1.6 * size;
  const opts = { width: 140, xh: 2.6, maxRows: 26, wordGap: 1.4, measure };
  const tree = (n: number): MapTree => ({ bullet: '-', topic: 'Zellatmung der Zelle', branches: Array.from({ length: n }, (_, i) => ({ title: `Ast Nummer ${i}`, items: i % 2 ? [] : ['- ein Unterpunkt', '- noch ein etwas längerer Unterpunkt hier'] })) });

  it('plans 1 to 8 branches without any overlap, inside the width', () => {
    for (let n = 1; n <= 8; n++) {
      const p = planMindmap(tree(n), opts)!;
      expect(p, `${n} branches`).not.toBeNull();
      expect(p.links).toHaveLength(n);
      const topic = p.texts.filter((t) => t.size === p.box.size);
      for (const t of p.texts) {
        const end = t.x + measure(t.text, t.size);
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual(p.width);
        expect(t.row).toBeGreaterThanOrEqual(1);
        expect(t.row).toBeLessThanOrEqual(p.rows);
        if (!topic.includes(t)) expect(end <= p.box.x0 || t.x >= p.box.x1).toBe(true); // side columns stay clear of the box
        for (const u of p.texts) if (u !== t && u.row === t.row) expect(end <= u.x || u.x + measure(u.text, u.size) <= t.x).toBe(true);
      }
    }
  });
  it('gives up on more than 8 branches or too little room (written as a list then)', () => {
    expect(planMindmap(tree(9), opts)).toBeNull();
    expect(planMindmap(tree(8), { ...opts, maxRows: 5 })).toBeNull();
  });
});
