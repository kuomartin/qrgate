import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

const channelPrefixes = new Map([
  ['physical', 'PHY'],
  ['online', 'ONL'],
]);

export function registerChannel(channel, prefix) {
  channelPrefixes.set(channel, prefix);
}

function prefixForChannel(channel) {
  const prefix = channelPrefixes.get(channel);
  if (!prefix) throw new Error(`Unknown channel: ${channel}`);
  return prefix;
}

function channelForPrefix(prefix) {
  for (const [channel, candidate] of channelPrefixes) {
    if (candidate === prefix) return channel;
  }
  return null;
}

function sign(eventSecret, payload) {
  return createHmac('sha256', eventSecret).update(payload).digest('hex').slice(0, 16);
}

function signaturesMatch(expected, actual) {
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export function generateSerial(channel, eventSecret) {
  const prefix = prefixForChannel(channel);
  const random = randomBytes(8).toString('hex');
  const payload = `${prefix}-${random}`;
  const signature = sign(eventSecret, payload);
  return `${payload}-${signature}`;
}

export function verifySerial(serialCode, eventSecret) {
  const parts = typeof serialCode === 'string' ? serialCode.split('-') : [];
  if (parts.length !== 3) return { valid: false, channel: null };

  const [prefix, random, signature] = parts;
  const channel = channelForPrefix(prefix);
  if (!channel) return { valid: false, channel: null };

  const expected = sign(eventSecret, `${prefix}-${random}`);
  if (!signaturesMatch(expected, signature)) return { valid: false, channel: null };

  return { valid: true, channel };
}

export function checkIn(serialCode, ticketStore, gateId) {
  const record = ticketStore.findBySerial(serialCode);
  if (!record) return { outcome: 'invalid' };

  const claimed = ticketStore.markCheckedIn(serialCode, gateId);
  if (claimed) return { outcome: 'success', channel: record.channel };

  const current = ticketStore.findBySerial(serialCode);
  const outcome = current.checkedInBy === gateId ? 'already-used' : 'used-elsewhere';
  return { outcome, channel: record.channel };
}
