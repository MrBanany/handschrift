/** Smallest values of the "Größe" and "Zeilenabstand" sliders (index.html); the fitted size never goes below them. */
const XH_MIN = 1.1, LINE_MIN = 3.6;
/** Fitting may shrink the writing to this part of its size, not further (smaller gets hard to read). */
export const FIT_MIN = 0.6;

const step = (v: number) => Math.floor(v * 10 + 1e-6) / 10; // the sliders move in 0.1 mm

/**
 * Size and line spacing (shrunk together) so that the text takes at most one page: the largest scale between FIT_MIN and 1
 * for which pages(xh, lineH) <= 1, by bisection. The same size if it already fits, null if even the smallest does not.
 * pages() only has to count pages (layout() without drawing); it should not get smaller as the writing gets bigger.
 */
export function fitSize(xh: number, lineH: number, pages: (xh: number, lineH: number) => number): { xh: number; lineH: number } | null {
  const at = (k: number) => ({ xh: step(xh * k), lineH: step(lineH * k) });
  const fits = (k: number) => { const v = at(k); return pages(v.xh, v.lineH) <= 1; };
  const lo0 = Math.max(FIT_MIN, XH_MIN / xh, LINE_MIN / lineH);
  if (fits(1)) return { xh, lineH };
  if (lo0 >= 1 || !fits(lo0)) return null;
  let lo = lo0, hi = 1;
  for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  return at(lo);
}
