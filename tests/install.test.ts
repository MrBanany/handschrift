import { expect, test } from 'vitest';
import { iosSafariHint } from '../src/install';

const iPadSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const iPhoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const iPhoneChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const pcChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

test('home-screen tip only in iOS/iPadOS Safari outside the home-screen app', () => {
  expect(iosSafariHint(iPadSafari, 'MacIntel', 5, false)).toBe(true); // iPad reports as Mac, but has touch
  expect(iosSafariHint(iPhoneSafari, 'iPhone', 5, false)).toBe(true);
  expect(iosSafariHint(iPhoneSafari, 'iPhone', 5, true)).toBe(false); // already the home-screen app
  expect(iosSafariHint(iPadSafari, 'MacIntel', 0, false)).toBe(false); // real Mac
  expect(iosSafariHint(iPhoneChrome, 'iPhone', 5, false)).toBe(false);
  expect(iosSafariHint(pcChrome, 'Win32', 0, false)).toBe(false);
});
