import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSerial, verifySerial, checkIn, registerChannel } from '../src/ticket.js';
import { createFakeTicketStore } from './fakeTicketStore.js';

const EVENT_SECRET = 'event-secret-abc';
const OTHER_EVENT_SECRET = 'event-secret-xyz';

test('generateSerial -> verifySerial round-trips for each channel', () => {
  for (const channel of ['physical', 'online']) {
    const serial = generateSerial(channel, EVENT_SECRET);
    assert.deepEqual(verifySerial(serial, EVENT_SECRET), { valid: true, channel });
  }
});

test('verifySerial rejects a tampered serial', () => {
  const serial = generateSerial('physical', EVENT_SECRET);
  const tampered = serial.slice(0, -1) + (serial.at(-1) === '0' ? '1' : '0');

  assert.equal(verifySerial(tampered, EVENT_SECRET).valid, false);
});

test('verifySerial rejects a serial checked against another event\'s secret', () => {
  const serial = generateSerial('online', EVENT_SECRET);

  assert.equal(verifySerial(serial, OTHER_EVENT_SECRET).valid, false);
});

test('checkIn succeeds on first call, reports already-used on second call from the same gate', () => {
  const serial = generateSerial('physical', EVENT_SECRET);
  const store = createFakeTicketStore([{ serial, channel: 'physical', status: 'issued' }]);

  assert.deepEqual(checkIn(serial, store, 'gate-1'), { outcome: 'success', channel: 'physical' });
  assert.deepEqual(checkIn(serial, store, 'gate-1'), { outcome: 'already-used', channel: 'physical' });
});

test('checkIn reports invalid for a serial not found in the store', () => {
  const serial = generateSerial('online', EVENT_SECRET);
  const store = createFakeTicketStore([]);

  assert.deepEqual(checkIn(serial, store, 'gate-1'), { outcome: 'invalid' });
});

test('checkIn distinguishes used-elsewhere from already-used', () => {
  const serial = generateSerial('online', EVENT_SECRET);
  const store = createFakeTicketStore([{ serial, channel: 'online', status: 'issued' }]);

  assert.deepEqual(checkIn(serial, store, 'gate-1'), { outcome: 'success', channel: 'online' });
  assert.deepEqual(checkIn(serial, store, 'gate-2'), { outcome: 'used-elsewhere', channel: 'online' });
  assert.deepEqual(checkIn(serial, store, 'gate-1'), { outcome: 'already-used', channel: 'online' });
});

test('a new channel value works through generateSerial/verifySerial/checkIn without any logic changes', () => {
  registerChannel('vip', 'VIP');

  const channels = ['physical', 'online', 'vip'];
  for (const channel of channels) {
    const serial = generateSerial(channel, EVENT_SECRET);
    assert.deepEqual(verifySerial(serial, EVENT_SECRET), { valid: true, channel });

    const store = createFakeTicketStore([{ serial, channel, status: 'issued' }]);
    assert.deepEqual(checkIn(serial, store, 'gate-1'), { outcome: 'success', channel });
  }
});
