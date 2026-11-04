import { MM, XH } from '../template/layout';
import type { Variant } from './types';

const xhPx = XH * MM;
// Characters whose ink should end on the baseline (no descenders).
const SITS = /^[a-eh-ik-orstuvwxzäöüA-IK-PR-ZÄÖÜ0-9.!?]+$/u;

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };

function inkRows(v: Variant) {
  let top = v.h, bottom = -1;
  for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) if (v.alpha[y * v.w + x] >= 128) { top = Math.min(top, y); bottom = y; break; }
  return { top, bottom };
}

/** Gap (px) between the two letters of a non-joined pair: longest run of empty columns in the middle. */
export function pairGap(v: Variant): number {
  const used = Array.from({ length: v.w }, (_, x) => { for (let y = 0; y < v.h; y++) if (v.alpha[y * v.w + x] >= 128) return true; return false; });
  let best = 0, run = 0;
  for (let x = 0; x < v.w; x++) {
    run = used[x] ? 0 : run + 1;
    const start = x - run + 1;
    if (run > best && start > 0.2 * v.w && x < 0.8 * v.w) best = run;
  }
  return best;
}

export interface Tuned { variants: Variant[]; excluded: Set<string>; letterGap: number | null }

/** Default gap between unjoined letters (x-heights) when nothing was learned. */
export const DEFAULT_LETTER_GAP = 0.16;

/**
 * Clean up a handwriting set so text looks like normal writing. strength 0 = untouched, 1 = full:
 * - letters that float above or sink below the baseline are pulled back to it,
 * - variants of one character are evened out in size; far-off ones are left out (at least two stay),
 * - the writer's own letter spacing is learned from the pairs that are not joined.
 */
export function optimize(vs: Variant[], strength = 1): Tuned {
  const s = Math.max(0, Math.min(1, strength));
  if (s === 0) return { variants: vs, excluded: new Set(), letterGap: null };
  const fixed = vs.map((v) => {
    if (!SITS.test(v.key)) return v;
    const { bottom } = inkRows(v);
    return bottom < 0 ? v : { ...v, baseline: v.baseline + s * (bottom - v.baseline) };
  });

  const excluded = new Set<string>();
  const byKey = new Map<string, Variant[]>();
  for (const v of fixed) byKey.set(v.key, [...(byKey.get(v.key) ?? []), v]);
  const scaled = new Map<string, number>();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const size = group.map((v) => ({ v, h: v.baseline - inkRows(v).top, w: v.w }));
    const mh = median(size.map((x) => x.h)), mw = median(size.map((x) => x.w));
    for (const x of size) if (x.h > 0) scaled.set(x.v.src, 1 + (mh / x.h - 1) * 0.6 * s);
    if (group.length < 3) continue;
    const limit = 1.6 - 0.6 * s; // gentle settings only drop extreme outliers
    const off = size
      .map((x) => ({ v: x.v, d: Math.max(Math.abs(x.h / mh - 1) / 0.35, Math.abs(x.w / mw - 1) / 0.45) }))
      .filter((x) => x.d > limit)
      .sort((a, b) => b.d - a.d)
      .slice(0, group.length - 2);
    for (const x of off) excluded.add(x.v.src);
  }

  const gaps = fixed.filter((v) => [...v.key].length === 2 && v.connected === false).map(pairGap);
  const learned = gaps.length >= 5 ? Math.min(0.6, Math.max(0.05, median(gaps) / xhPx)) : null;
  return {
    variants: fixed.filter((v) => !excluded.has(v.src)).map((v) => (scaled.has(v.src) ? { ...v, scale: scaled.get(v.src) } : v)),
    excluded,
    letterGap: learned === null ? null : DEFAULT_LETTER_GAP + (learned - DEFAULT_LETTER_GAP) * s,
  };
}
