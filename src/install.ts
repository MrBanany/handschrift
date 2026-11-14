/**
 * Should the "Zum Home-Bildschirm" tip show? Only in Safari on iPhone/iPad, and not inside the home-screen app itself.
 * iPadOS Safari reports itself as a Mac, so a Mac with a touch screen counts as an iPad.
 */
export function iosSafariHint(ua: string, platform: string, maxTouchPoints: number, standalone: boolean) {
  if (standalone) return false;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  // Chrome, Firefox, Edge and Opera on iOS name themselves in the UA; only Safari is left without such a tag.
  return iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}
