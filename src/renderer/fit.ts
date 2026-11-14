/** Smallest value of the "Größe" slider (index.html); the fitted size never goes below it. */
const XH_MIN = 1.1;
/** Fitting may shrink the writing to this part of its size, not further (smaller gets hard to read). */
export const FIT_MIN = 0.6;

const step = (v: number) => Math.floor(v * 10 + 1e-6) / 10; // the slider moves in 0.1 mm
const stepUp = (v: number) => Math.ceil(v * 10 - 1e-6) / 10;

/**
 * Size (x-height, mm) so that the text takes at most one page: the largest between FIT_MIN x the current size and the current size
 * for which pages(xh) <= 1, by bisection. The line spacing stays as set (it belongs to the paper's lines); smaller letters
 * only fit more words on a line. The same size if it already fits, null if even the smallest does not.
 * pages() only has to count pages (layout() without drawing); it should not get smaller as the writing gets bigger.
 */
export function fitSize(xh: number, pages: (xh: number) => number): number | null {
  if (pages(xh) <= 1) return xh;
  const lo0 = Math.max(stepUp(xh * FIT_MIN), XH_MIN);
  if (lo0 >= xh || pages(lo0) > 1) return null;
  let lo = lo0, hi = xh;
  for (let i = 0; i < 8; i++) { const mid = step((lo + hi) / 2); if (mid <= lo) break; if (pages(mid) <= 1) lo = mid; else hi = mid; }
  return lo;
}
