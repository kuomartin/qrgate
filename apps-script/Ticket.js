// Apps Script port of src/ticket.js. Same shape and behavior, but signing/randomness
// use Utilities (Node's crypto module isn't available in the Apps Script V8 runtime).
// Keep this in sync with src/ticket.js when the serial format or checkIn logic changes.

var TICKET_CHANNEL_PREFIXES = {
  physical: 'PHY',
  online: 'ONL',
};

function registerChannel(channel, prefix) {
  TICKET_CHANNEL_PREFIXES[channel] = prefix;
}

function prefixForChannel_(channel) {
  var prefix = TICKET_CHANNEL_PREFIXES[channel];
  if (!prefix) throw new Error('Unknown channel: ' + channel);
  return prefix;
}

function channelForPrefix_(prefix) {
  for (var channel in TICKET_CHANNEL_PREFIXES) {
    if (TICKET_CHANNEL_PREFIXES[channel] === prefix) return channel;
  }
  return null;
}

function randomHex_(byteLength) {
  var hex = '';
  while (hex.length < byteLength * 2) {
    hex += Utilities.getUuid().replace(/-/g, '');
  }
  return hex.slice(0, byteLength * 2);
}

function sign_(eventSecret, payload) {
  var signatureBytes = Utilities.computeHmacSha256Signature(payload, eventSecret);
  var hex = signatureBytes
    .map(function (byte) {
      return ((byte + 256) % 256).toString(16).padStart(2, '0');
    })
    .join('');
  return hex.slice(0, 16);
}

function generateSerial(channel, eventSecret) {
  var prefix = prefixForChannel_(channel);
  var random = randomHex_(8);
  var payload = prefix + '-' + random;
  var signature = sign_(eventSecret, payload);
  return payload + '-' + signature;
}

function verifySerial(serialCode, eventSecret) {
  var parts = typeof serialCode === 'string' ? serialCode.split('-') : [];
  if (parts.length !== 3) return { valid: false, channel: null };

  var prefix = parts[0];
  var random = parts[1];
  var signature = parts[2];
  var channel = channelForPrefix_(prefix);
  if (!channel) return { valid: false, channel: null };

  var expected = sign_(eventSecret, prefix + '-' + random);
  if (expected !== signature) return { valid: false, channel: null };

  return { valid: true, channel: channel };
}

function checkIn(serialCode, ticketStore, gateId) {
  var record = ticketStore.findBySerial(serialCode);
  if (!record) return { outcome: 'invalid' };

  var claimed = ticketStore.markCheckedIn(serialCode, gateId);
  if (claimed) return { outcome: 'success', channel: record.channel };

  var current = ticketStore.findBySerial(serialCode);
  var outcome = current.checkedInBy === gateId ? 'already-used' : 'used-elsewhere';
  return { outcome: outcome, channel: record.channel };
}
