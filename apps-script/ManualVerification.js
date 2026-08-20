// One-shot acceptance check for #3, run manually from the Apps Script editor
// (select runAcceptanceChecks in the function dropdown, click Run, then check
// View > Logs). Not part of the shipped RPC surface — safe to delete once verified.
function runAcceptanceChecks() {
  var results = [];
  function check(label, condition) {
    results.push((condition ? 'PASS' : 'FAIL') + ' - ' + label);
  }

  setup();
  var secret = getEventSecret_();

  var physicalSerials = batchGenerateTickets('physical', 3);
  check('batchGenerateTickets("physical", 3) 產生 3 筆序號', physicalSerials.length === 3);

  var batchVerify = verifySerial(physicalSerials[0], secret);
  check('批次序號可通過 verifySerial 且通路為 physical', batchVerify.valid && batchVerify.channel === 'physical');

  var onlineResult = issueOnlineTicket({ name: 'test-registrant' });
  var onlineVerify = verifySerial(onlineResult.serial, secret);
  check('issueOnlineTicket 回傳可驗證、通路為 online 的序號', onlineVerify.valid && onlineVerify.channel === 'online');

  var reuseSerial = physicalSerials[1];
  var first = checkInTicket(reuseSerial, 'gate-1');
  check('第一次 checkInTicket 回傳 success', first.outcome === 'success');
  var second = checkInTicket(reuseSerial, 'gate-1');
  check('對同一序號再次 checkInTicket 回傳 already-used', second.outcome === 'already-used');
  check('already-used 沒有覆蓋原本的 gate/時間記錄', sheetTicketStore.findBySerial(reuseSerial).checkedInBy === 'gate-1');

  var tamperedSerial = physicalSerials[2].slice(0, -1) + (physicalSerials[2].slice(-1) === '0' ? '1' : '0');
  var tamperedResult = checkInTicket(tamperedSerial, 'gate-1');
  check('竄改過的序號 checkInTicket 回傳 invalid', tamperedResult.outcome === 'invalid');

  var unknownResult = checkInTicket('PHY-deadbeefdeadbeef-0000000000000000', 'gate-1');
  check('未知序號 checkInTicket 回傳 invalid', unknownResult.outcome === 'invalid');

  var log = results.join('\n');
  Logger.log(log);
  return log;
}
