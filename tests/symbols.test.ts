import { describe, expect, it } from 'vitest';
import { symbolVariants } from '../src/glyphstore/symbols';
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

  it('puts the arrow shaft at half the x-height above the baseline', () => {
    const a = symbolVariants([plus]).find((v) => v.key === '→')!;
    let ink = 0, rows = 0;
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { ink += a.alpha[y * a.w + x]; rows += a.alpha[y * a.w + x] * y; }
    expect((a.baseline - rows / ink) / (XH * MM)).toBeCloseTo(0.5, 1);
  });
});
