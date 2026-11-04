/** Stroke anchor in glyph pixel space (MM px/mm). dx/dy: pen direction (unit). w: local stroke width (px). */
export interface Anchor { x: number; y: number; dx: number; dy: number; w: number }

export interface GlyphMeta {
  src: string; // template box id, unique per variant
  key: string; // "a", "ch", "und"
  w: number; h: number;
  baseline: number; // pixel row of the baseline in the bitmap
  entry: Anchor | null; // where the pen arrives from the left
  exit: Anchor | null; // where the pen leaves to the right
  strokeW: number; // mean stroke width (px)
  connected?: boolean; // multi-letter units: were the letters joined?
}

export interface Variant extends GlyphMeta { alpha: Uint8Array }
