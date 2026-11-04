export const toPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG-Export fehlgeschlagen'))), 'image/png'));

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Share sheet on iPad/Android (e.g. straight into GoodNotes), download elsewhere. */
export async function sharePngs(blobs: Blob[]) {
  const files = blobs.map((b, i) => new File([b], `handschrift-${i + 1}.png`, { type: 'image/png' }));
  if (navigator.canShare?.({ files })) await navigator.share({ files });
  else files.forEach((f) => download(f, f.name));
}

/** Safari needs the ClipboardItem created synchronously inside the tap, with a pending blob. */
export const copyPng = (blob: Promise<Blob>) => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
