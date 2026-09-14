import assert from 'node:assert/strict';
import test from 'node:test';
import { parseByteRange } from '../lib/http-range.ts';

for (const [header, size, expected] of [
  ['bytes=0-0', 10, { offset: 0, length: 1 }],
  ['bytes=2-5', 10, { offset: 2, length: 4 }],
  ['bytes=9-9', 10, { offset: 9, length: 1 }],
  ['bytes=0-9', 10, { offset: 0, length: 10 }],
  ['bytes=5-', 10, { offset: 5, length: 5 }],
  ['bytes=0-', 10, { offset: 0, length: 10 }],
  ['bytes=-3', 10, { offset: 7, length: 3 }],
  ['bytes=-10', 10, { offset: 0, length: 10 }],
  ['bytes=-100', 10, { offset: 0, length: 10 }],
  ['bytes=7-100', 10, { offset: 7, length: 3 }],
  ['bytes=7-999999999999999999999999', 10, { offset: 7, length: 3 }],
  ['bytes=-999999999999999999999999', 10, { offset: 0, length: 10 }],
  [' BYTES=01-02 ', 10, { offset: 1, length: 2 }],
  ['bytes=0-0', 1, { offset: 0, length: 1 }],
]) test(`normalizes ${header} at size ${size}`, () => assert.deepEqual(parseByteRange(header, size), expected));

for (const header of ['', 'bytes=', 'bytes=-', 'bytes=-0', 'bytes=10-', 'bytes=100-200', 'bytes=5-4', 'bytes=0-1,4-5', 'items=0-1', 'bytes= 0-1', 'bytes=1.5-3', 'bytes=+1-3', 'bytes=1--3', 'bytes=999999999999999999999-', 'bytes=0-1\nextra']) {
  test(`rejects ${JSON.stringify(header)}`, () => assert.equal(parseByteRange(header, 10), null));
}
test('no byte range is satisfiable for an empty object', () => {
  for (const header of ['bytes=0-', 'bytes=-1', 'bytes=0-0']) assert.equal(parseByteRange(header, 0), null);
});
test('rejects invalid object sizes', () => {
  for (const size of [-1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.equal(parseByteRange('bytes=0-', size), null);
});
