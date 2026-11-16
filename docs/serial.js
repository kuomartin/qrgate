// 序號 = <id>.<sig>
//   id  : 8 bytes 隨機值的 base64url（11 字）
//   sig : 以 Ed25519 私鑰對 id 字串（UTF-8）做的 detached signature，base64url（86 字）
// 這個檔案同時在 Apps Script、瀏覽器與 node 測試載入，所以不用 import/export，
// 只掛一個 globalThis.Serial；nacl（tweetnacl）由呼叫端注入。
(function (root) {
  'use strict';

  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var ID_LENGTH = 8;

  function toBase64url(bytes) {
    var out = '';
    var i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
    }
    var rest = bytes.length - i;
    if (rest === 1) {
      out += ALPHABET[bytes[i] >> 2] + ALPHABET[(bytes[i] & 3) << 4];
    } else if (rest === 2) {
      var m = (bytes[i] << 8) | bytes[i + 1];
      out += ALPHABET[m >> 10] + ALPHABET[(m >> 4) & 63] + ALPHABET[(m & 15) << 2];
    }
    return out;
  }

  function fromBase64url(text) {
    if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
    var bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
    var acc = 0;
    var bits = 0;
    var k = 0;
    for (var i = 0; i < text.length; i++) {
      acc = (acc << 6) | ALPHABET.indexOf(text[i]);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bytes[k++] = (acc >> bits) & 255;
      }
    }
    return bytes;
  }

  function utf8(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }

  function create(nacl) {
    function keyPairFromSeed(seed) {
      return nacl.sign.keyPair.fromSeed(seed);
    }

    // idBytes：由呼叫端提供的 8 bytes 隨機值（Apps Script 與瀏覽器的亂數來源不同）。
    function issue(secretKey, idBytes) {
      if (idBytes.length !== ID_LENGTH) throw new Error('id must be ' + ID_LENGTH + ' bytes');
      var id = toBase64url(idBytes);
      var sig = nacl.sign.detached(utf8(id), secretKey);
      return id + '.' + toBase64url(sig);
    }

    function parse(token) {
      if (typeof token !== 'string') return null;
      var parts = token.trim().split('.');
      if (parts.length !== 2) return null;
      var idBytes = fromBase64url(parts[0]);
      var sig = fromBase64url(parts[1]);
      if (!idBytes || !sig || idBytes.length !== ID_LENGTH || sig.length !== nacl.sign.signatureLength) return null;
      return { id: parts[0], sig: sig };
    }

    function verify(publicKey, token) {
      var parsed = parse(token);
      if (!parsed) return { valid: false, id: null };
      var ok = nacl.sign.detached.verify(utf8(parsed.id), parsed.sig, publicKey);
      return { valid: ok, id: ok ? parsed.id : null };
    }

    return {
      ID_LENGTH: ID_LENGTH,
      keyPairFromSeed: keyPairFromSeed,
      issue: issue,
      parse: parse,
      verify: verify,
      toBase64url: toBase64url,
      fromBase64url: fromBase64url,
    };
  }

  root.Serial = { create: create, toBase64url: toBase64url, fromBase64url: fromBase64url };
})(globalThis);
