// Single source of truth for the template sheet. Both the PDF generator and the
// segmentation read from here, so every box can be located exactly.
// All units are millimetres, origin top-left of an A4 page.

export const TEMPLATE_VERSION = 1;
export const PAGE = { w: 210, h: 297 };
/** Sample resolution: pixels per mm used for imported pages and stored glyphs. */
export const MM = 10;

export const CELL = { w: 15.5, h: 22 };
const COLS = 12;
const LEFT = 12;
const TOP = 22;
const LABEL = 4; // label strip above each box row
const ROWS = 9;

/** Guide lines, mm from box top. */
export const GUIDES = { asc: 4, xh: 10, base: 15, desc: 20 };
export const XH = GUIDES.base - GUIDES.xh; // template x-height (5 mm)

/** Registration marks: centres, square size. */
export const MARK_SIZE = 6;
export const MARKS: [number, number][] = [
  [12, 12], [198, 12], [12, 285], [198, 285],
];
/** Page code: 8 squares (5 bits page, 3 bits version), bottom centre. */
export const CODE_SIZE = 3;
export const CODE_BITS: [number, number][] = Array.from({ length: 8 }, (_, i) => [105 - 15.75 + i * 4.5, 285]);

export const SINGLES = [
  ...'abcdefghijklmnopqrstuvwxyz', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'äöüÄÖÜß',
  ...'0123456789', ...'.,;:!?-–"\'()/&@€%',
];
export const PAIRS = [
  'ch', 'sch', 'ck', 'st', 'ei', 'ie', 'en', 'er', 'un', 'ge', 'te', 'de', 'in', 'an', 'nd', 'ng',
  'ss', 'll', 'tt', 'au', 'eu', 'be', 'es', 're', 'he', 'ic', 'it', 'ne', 'nt', 'li', 'le', 'se',
  'ar', 'ra', 'or', 'el', 'al', 'ht', 'ur', 'we', 'ich', 'cht', 'ung',
];
export const WORDS = ['und', 'der', 'die', 'das', 'ist', 'nicht', 'mit', 'ein', 'zu', 'auf', 'für', 'sich', 'auch', 'oder'];
/** Arrows and symbols for notes and AI answers: their own last page, so it can be filled in and imported alone. */
export const SYMBOL_KEYS = [...'→←↑↓⇒⇔↔', ...'+=≠≈<>≤≥±×÷·²³√π°Δ∞', ...'✓✗•*§~[]#|'];
/** Optional pages for joined-up writing: more joined pairs and word parts, so the joins come from real samples. */
export const CURSIVE_KEYS = [
  'ab', 'am', 'as', 'at', 'bi', 'da', 'di', 'ed', 'em', 'et', 'fe', 'fi', 'ha', 'hi', 'ig', 'is', 'ke', 'la',
  'ma', 'me', 'mi', 'na', 'ni', 'no', 'on', 'os', 'ri', 'ro', 'sa', 'si', 'so', 'ta', 'ti', 'tr', 've', 'wi',
  'ver', 'gen', 'ten', 'ter', 'men', 'ent', 'ber', 'lich', 'keit', 'heit',
];

export interface Box {
  id: string; // stable id, e.g. "1-3-17" (version-page-index)
  key: string;
  page: number;
  x: number; y: number; w: number; h: number; // box rect (mm)
}

interface Item { key: string; cells: number; variants: number }

// Each group starts on a new page. New groups only ever go at the end: existing boxes must never move (v1 imports).
const GROUPS: Item[][] = [
  [
    ...SINGLES.map((key) => ({ key, cells: 1, variants: 4 })),
    ...PAIRS.map((key) => ({ key, cells: 2, variants: 3 })),
    ...WORDS.map((key) => ({ key, cells: key.length <= 3 ? 3 : 4, variants: 3 })),
  ],
  SYMBOL_KEYS.map((key) => ({ key, cells: 1, variants: 3 })),
  CURSIVE_KEYS.map((key) => ({ key, cells: Math.max(2, key.length), variants: 2 })),
];

function buildPages(): Box[][] {
  const pages: Box[][] = [];
  let col = 0, row = 0;
  for (const group of GROUPS) {
    pages.push([]); col = 0; row = 0;
    for (const item of group) {
      for (let v = 0; v < item.variants; v++) {
        if (col + item.cells > COLS) { col = 0; row++; }
        if (row >= ROWS) { row = 0; pages.push([]); }
        const page = pages.length - 1;
        const list = pages[page];
        list.push({
          id: `${TEMPLATE_VERSION}-${page}-${list.length}`,
          key: item.key, page,
          x: LEFT + col * CELL.w,
          y: TOP + row * (CELL.h + LABEL) + LABEL,
          w: item.cells * CELL.w, h: CELL.h,
        });
        col += item.cells;
      }
    }
  }
  return pages;
}

export const TEMPLATE_PAGES = buildPages();
export const TEMPLATE_KEYS = GROUPS.flat().map((i) => i.key);
/** Index of the page with arrows and symbols. */
export const SYMBOL_PAGE = TEMPLATE_PAGES.findIndex((p) => p[0].key === SYMBOL_KEYS[0]);
/** Pages with the joined-up writing extras (the last ones). */
export const CURSIVE_PAGES = TEMPLATE_PAGES.map((_, i) => i).filter((i) => i > SYMBOL_PAGE);

export function pageCode(page: number): number {
  return (TEMPLATE_VERSION << 5) | page;
}
export function decodePageCode(code: number): { version: number; page: number } {
  return { version: code >> 5, page: code & 31 };
}
