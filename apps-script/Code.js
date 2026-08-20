var EVENT_SPREADSHEET_ID = '12KNUubtIlAG63Mi0NqxHAVKt9qbnrEhonxRREEeTzB4';

// Run once (e.g. via `clasp run setup`) to initialize this deployment's
// Script Properties: which Sheet backs it, and its own signing secret.
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SPREADSHEET_ID')) {
    props.setProperty('SPREADSHEET_ID', EVENT_SPREADSHEET_ID);
  }
  if (!props.getProperty('EVENT_SECRET')) {
    props.setProperty('EVENT_SECRET', randomHex_(32));
  }
  return {
    spreadsheetId: props.getProperty('SPREADSHEET_ID'),
    hasSecret: !!props.getProperty('EVENT_SECRET'),
  };
}

function getEventSecret_() {
  var secret = PropertiesService.getScriptProperties().getProperty('EVENT_SECRET');
  if (!secret) throw new Error('EVENT_SECRET not set — run setup() first.');
  return secret;
}

function checkInTicket(serial, gateId) {
  var verification = verifySerial(serial, getEventSecret_());
  if (!verification.valid) return { outcome: 'invalid' };
  return checkIn(serial, sheetTicketStore, gateId);
}

function issueOnlineTicket(registrationPayload) {
  var serial = generateSerial('online', getEventSecret_());
  appendIssuedTicket_(serial, 'online');
  return { serial: serial, channel: 'online' };
}

function batchGenerateTickets(channel, count) {
  var secret = getEventSecret_();
  var serials = [];
  for (var i = 0; i < count; i++) {
    var serial = generateSerial(channel, secret);
    appendIssuedTicket_(serial, channel);
    serials.push(serial);
  }
  return serials;
}

function doGet(e) {
  return HtmlService.createHtmlOutput('qrgate backend is running.');
}
