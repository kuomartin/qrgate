import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import nacl from 'tweetnacl';
import '../src/serial.js';

const serial = globalThis.Serial.create(nacl);
const seed = new Uint8Array(randomBytes(32));
const keys = serial.keyPairFromSeed(seed);

function issue() {
  return serial.issue(keys.secretKey, new Uint8Array(randomBytes(8)));
}

test('base64url round-trips every length', () => {
  for (let n = 0; n <= 70; n++) {
    const bytes = new Uint8Array(randomBytes(n));
    const text = serial.toBase64url(bytes);
    assert.match(text, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual(serial.fromBase64url(text), bytes);
  }
});

test('token shape is <11 chars>.<86 chars>', () => {
  const token = issue();
  assert.match(token, /^[A-Za-z0-9_-]{11}\.[A-Za-z0-9_-]{86}$/);
});

test('verifies with the matching public key', () => {
  const token = issue();
  const result = serial.verify(keys.publicKey, token);
  assert.equal(result.valid, true);
  assert.equal(result.id, token.split('.')[0]);
});

test('rejects another key pair', () => {
  const other = serial.keyPairFromSeed(new Uint8Array(randomBytes(32)));
  assert.equal(serial.verify(other.publicKey, issue()).valid, false);
});

test('rejects a tampered id or signature', () => {
  const [id, sig] = issue().split('.');
  const flip = (s) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  assert.equal(serial.verify(keys.publicKey, `${flip(id)}.${sig}`).valid, false);
  assert.equal(serial.verify(keys.publicKey, `${id}.${flip(sig)}`).valid, false);
});

test('rejects malformed input', () => {
  for (const bad of [null, '', 'abc', 'a.b.c', 'AAAAAAAAAAA.' + 'A'.repeat(85), 'AAAAAAAAAAA.' + '*'.repeat(86)]) {
    assert.deepEqual(serial.verify(keys.publicKey, bad), { valid: false, id: null });
  }
});

test('same seed gives same key pair (Apps Script re-derives from stored seed)', () => {
  const again = serial.keyPairFromSeed(seed);
  assert.deepEqual(again.publicKey, keys.publicKey);
  assert.deepEqual(again.secretKey, keys.secretKey);
});
