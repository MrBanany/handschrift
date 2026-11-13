import { expect, test } from 'vitest';
import { TEXT_MAX, takeText } from '../src/handover';

const BASE = 'https://example.org/handschrift/';

test('takes #text= and ?text= and removes them from the address', () => {
  expect(takeText(`${BASE}#text=Hallo%20Welt%0AZeile%202`)).toEqual({ text: 'Hallo Welt\nZeile 2', rest: BASE });
  expect(takeText(`${BASE}?text=a%20%2B%20b%20%3D%20c&x=1`)).toEqual({ text: 'a + b = c', rest: `${BASE}?x=1` });
  expect(takeText(`${BASE}?text=query#text=hash`).text).toBe('hash'); // the hash wins: it never leaves the device
});

test('no text in the address: null, address unchanged', () => {
  expect(takeText(BASE)).toEqual({ text: null, rest: BASE });
  expect(takeText(`${BASE}?x=1#teil`)).toEqual({ text: null, rest: `${BASE}?x=1#teil` });
});

test('cuts overlong text', () => {
  expect(takeText(`${BASE}#text=${'a'.repeat(TEXT_MAX + 500)}`).text).toHaveLength(TEXT_MAX);
});
