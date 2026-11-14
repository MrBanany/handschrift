import { describe, expect, it } from 'vitest';
import { symbolVariants } from '../src/glyphstore/symbols';
import { SUB_LETTERS } from '../src/renderer/clean';
import type { Variant } from '../src/glyphstore/types';
import { MM, XH } from '../src/template/layout';

describe('stroke symbols', () => {
  const plus: Variant = { src: 'p', key: '+', w: 1, h: 1, baseline: 0, entry: null, exit: null, strokeW: 6, alpha: new Uint8Array(1) };

  it('draws only what the set lacks, in its own stroke width, a little different each time', () => {
    const vs = symbolVariants([plus]);
    expect(vs.some((v) => v.key === '+')).toBe(false);
    const arrows = vs.filter((v) => v.key === '→');
    expect(arrows).toHaveLength(3);
    expect(new Set(arrows.map((v) => v.alpha.join())).size).toBe(3);
    expect(arrows[0].strokeW).toBe(6);
    expect(symbolVariants([plus])).toEqual(vs); // the same on every start
  });

  it('keeps drawn symbols for the next call, but not across pen widths or callers', () => {
    const a = symbolVariants([plus]).find((v) => v.key === '→')!;
    a.prof = { l: [], r: [] };
    const b = symbolVariants([plus]).find((v) => v.key === '→')!;
    expect(b.alpha).toBe(a.alpha); // not drawn again
    expect(b.prof).toBeUndefined(); // what a caller hangs on it stays with that caller
    const thick = symbolVariants([{ ...plus, strokeW: 9 }]).find((v) => v.key === '→')!;
    expect(thick.strokeW).toBe(9);
    expect(thick.alpha.join()).not.toBe(a.alpha.join());
  });

  it('makes ² from the writer\'s own 2, smaller and raised, unless ² was filled in', () => {
    const two: Variant = { ...plus, src: '1-2-3', key: '2', baseline: 100, scale: 1.1 };
    const [sq] = symbolVariants([two]).filter((v) => v.key === '²');
    expect(sq).toMatchObject({ src: 'sup:1-2-3', scale: 0.66, entry: null, exit: null, alpha: two.alpha });
    expect((sq.baseline - two.baseline) * sq.scale!).toBeCloseTo(0.8 * XH * MM); // raised by 0.8 x-heights on the page
    expect(symbolVariants([two, { ...two, src: 'x', key: '²' }]).some((v) => v.key === '²')).toBe(false);
  });

  it('lowers capitals and letters Unicode has no subscript for (E_R, v_b) from the writer\'s own, and draws ∴ ∇ ψ', () => {
    const letter = (key: string): Variant => ({ ...plus, src: `l-${key}`, key, baseline: 100 });
    const vs = symbolVariants([letter('R'), letter('b')]);
    expect(vs.filter((v) => v.key === SUB_LETTERS.R)).toHaveLength(1);
    expect(vs.filter((v) => v.key === SUB_LETTERS.b)).toHaveLength(1);
    expect(vs.filter((v) => v.key === SUB_LETTERS.G)).toHaveLength(0); // no G written, nothing to lower
    for (const k of ['∴', '∇', 'ψ', '∈', '∂']) expect(vs.filter((v) => v.key === k)).toHaveLength(3);
  });

  it('puts the arrow shaft at half the x-height above the baseline', () => {
    const a = symbolVariants([plus]).find((v) => v.key === '→')!;
    let ink = 0, rows = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { ink += a.alpha[y * a.w + x]; rows += a.alpha[y * a.w + x] * y; }
    expect((a.baseline - rows / ink) / (XH * MM)).toBeCloseTo(0.5, 1);
  });
});
