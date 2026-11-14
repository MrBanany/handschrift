/**
 * Export page by page: draw one page, encode it, free its canvas, then the next.
 * A full A4 canvas at export resolution is ~36 MB; the iPad only tolerates a few of them at once.
 */
export async function forEachPage<C extends { width: number }, T>(
  count: number,
  draw: (i: number) => C,
  encode: (canvas: C, i: number) => Promise<T>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const c = draw(i);
    try { out.push(await encode(c, i)); } finally { c.width = 0; } // 0 px: Safari gives the memory back right away
  }
  return out;
}
