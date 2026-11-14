import type { Library } from '../connectors/connect';
import type { GlyphMeta, Variant } from '../glyphstore/types';
import { MM, XH } from '../template/layout';

/**
 * Widest empty stretch inside a sample, between its first and last inked column, in glyph px (cached).
 * 0 for single letters of one stroke and for samples without a bitmap.
 */
const cache = new WeakMap<GlyphMeta, number>();
export function innerGap(g: GlyphMeta): number {
  let v = cache.get(g);
  if (v !== undefined) return v;
  const { alpha, w, h } = g as Partial<Variant> & GlyphMeta;
  v = 0;
  if (alpha && alpha.length === w * h) {
    const inked = new Uint8Array(w);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[y * w + x] >= 128) inked[x] = 1;
    let run = 0, seen = false;
    for (let x = 0; x < w; x++) {
      if (inked[x]) { seen = true; v = Math.max(v, run); run = 0; } else if (seen) run++;
    }
  }
  cache.set(g, v);
  return v;
}

/** A wider hole than this inside a word part or pair reads as a word gap ("s teht"), in x-heights. */
export const MAX_INNER_GAP = 0.45;

/**
 * The library without word parts and pairs that were written with a wide hole between their letters. Those fall
 * back to the single letters, which the layout spaces itself; a part is only dropped when every one of its letters
 * exists alone (else it stays, a hole is better than a missing letter), and only the offending samples go.
 */
export function withoutWideGaps(lib: Library): Library {
  let out: Library | null = null;
  for (const [key, vs] of lib) {
    if ([...key].length < 2 || ![...key].every((c) => lib.has(c))) continue;
    const ok = vs.filter((g) => innerGap(g) * (g.scale ?? 1) <= MAX_INNER_GAP * XH * MM);
    if (ok.length === vs.length) continue;
    out ??= new Map(lib);
    if (ok.length) out.set(key, ok); else out.delete(key);
  }
  return out ?? lib;
}
