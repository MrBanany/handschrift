import { describe, expect, it } from 'vitest';
import { forEachPage } from '../src/export/pages';

describe('forEachPage', () => {
  it('returns results in page order, with never more than one canvas alive', async () => {
    let alive = 0, peak = 0;
    const draw = (i: number) => { alive++; peak = Math.max(peak, alive); return { width: 100, i }; };
    const out = await forEachPage(12, draw, async (c, i) => {
      await new Promise((r) => setTimeout(r, 12 - i)); // later pages finish "faster": order must not change
      expect(c.width).toBe(100);
      alive--;
      return c.i;
    });
    expect(out).toEqual([...Array(12).keys()]);
    expect(peak).toBe(1);
  });

  it('frees every canvas, also when encoding fails', async () => {
    const made: { width: number }[] = [];
    const draw = () => { const c = { width: 50 }; made.push(c); return c; };
    await expect(forEachPage(3, draw, async (_c, i) => { if (i === 1) throw new Error('boom'); return i; })).rejects.toThrow('boom');
    expect(made.map((c) => c.width)).toEqual([0, 0]); // the third was never drawn
  });
});
