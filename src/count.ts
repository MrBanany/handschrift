// Usage counts with GoatCounter (https://www.goatcounter.com): only event names and page numbers, never text, file names or handwriting names.
// The script is only in the page when vite.config.ts has a GC_CODE; without it (or offline, or blocked) every call here does nothing.
interface GoatCounter { count?: (v: { path: string; title: string; event: boolean }) => void }

/** Counts one event. Never throws: a counter must not break the app. */
export function count(path: string, title: string) {
  try { (globalThis as { goatcounter?: GoatCounter }).goatcounter?.count?.({ path, title, event: true }); } catch { /* nothing to do */ }
}

/** Exports: which kind and how many pages (10 and more together, so the dashboard stays readable). */
export function countExport(kind: 'goodnotes' | 'pdf' | 'bild', pages: number) {
  const label = { goodnotes: 'GoodNotes', pdf: 'PDF', bild: 'Bild kopiert' }[kind];
  count(`export-${kind}`, `Export: ${label}`);
  count(`export-seiten-${pages >= 10 ? '10-und-mehr' : pages}`, `Export: ${pages >= 10 ? '10 und mehr Seiten' : pages === 1 ? '1 Seite' : `${pages} Seiten`}`);
  count('text-erzeugt', 'Text in Handschrift erzeugt');
}
