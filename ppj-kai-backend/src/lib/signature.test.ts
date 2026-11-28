import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_SIGNATURE_LENGTH, parseSignature } from './signature';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';

test('signatures are bounded PNG data URLs drawn on screen', () => {
  assert.deepEqual(parseSignature(png), { ok: true, value: png });
  for (const bad of ['', null, undefined, 42, 'data:image/jpeg;base64,/9j/4AAQ', 'data:image/png;base64,***', 'https://x/y.png'])
    assert.equal(parseSignature(bad).ok, false, String(bad));
  assert.equal(parseSignature('data:image/png;base64,' + 'A'.repeat(MAX_SIGNATURE_LENGTH)).ok, false);
});
