/** Longest text taken from a link or the clipboard: about ten written pages, far below what a URL can carry. */
export const TEXT_MAX = 20_000;

/**
 * Text handed over in the address by a link or an iOS shortcut: `#text=…` (stays on the device) or `?text=…`.
 * Returns the text (null if there is none) and the address without it, so a reload does not bring it back.
 */
export function takeText(href: string) {
  const url = new URL(href), hash = new URLSearchParams(url.hash.slice(1));
  const text = hash.get('text') ?? url.searchParams.get('text');
  url.searchParams.delete('text');
  if (hash.has('text')) { hash.delete('text'); url.hash = hash.toString(); } // any other #anchor stays as it is
  return { text: text === null ? null : text.slice(0, TEXT_MAX), rest: url.href };
}
