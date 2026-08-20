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

// ScriptApp.getService().getUrl() is only documented as reliable when called
// from inside doGet/doPost — calling it from a Sheet menu action (see
// Menu.js's showScanLinkDialog) returned a stale/unrelated deployment id in
// practice. So, same as reg_dev's Code.js: doGet is the only place that
// derives it, and it persists what it finds to Script Properties on every
// non-bridge visit; everything else (the menu) just reads that property.
function getDeploymentId_() {
  return PropertiesService.getScriptProperties().getProperty('DEPLOYMENT_ID');
}

function recordDeploymentIdIfChanged_(deploymentId) {
  if (!deploymentId) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('DEPLOYMENT_ID') !== deploymentId) {
    props.setProperty('DEPLOYMENT_ID', deploymentId);
  }
}

function checkInTicket(serial, gateId) {
  var verification = verifySerial(serial, getEventSecret_());
  if (!verification.valid) return { outcome: 'invalid' };
  return checkIn(serial, sheetTicketStore, gateId);
}

function issueOnlineTicket(registrationPayload) {
  var serial = generateSerial('online', getEventSecret_());
  appendIssuedTickets_([{ serial: serial, channel: 'online' }]);
  return { serial: serial, channel: 'online' };
}

function batchGenerateTickets(channel, count) {
  var secret = getEventSecret_();
  var entries = [];
  for (var i = 0; i < count; i++) {
    entries.push({ serial: generateSerial(channel, secret), channel: channel });
  }
  appendIssuedTickets_(entries);
  return entries.map(function (entry) {
    return entry.serial;
  });
}

function doGet(e) {
  var isBridgeMode = e && e.parameter && e.parameter.bridge === '1';
  var serviceUrl = ScriptApp.getService().getUrl();
  var match = serviceUrl && serviceUrl.match(/\/macros\/s\/([^/]+)\/(?:exec|dev)/);
  var deploymentId = match ? match[1] : null;

  // Only record on a direct (non-bridge) visit — matches reg_dev's doGet,
  // which treats an iframe/bridge load as "just relaying", not "this is the
  // canonical URL someone opened".
  if (deploymentId && !isBridgeMode) {
    recordDeploymentIdIfChanged_(deploymentId);
  }

  var template = HtmlService.createTemplateFromFile('Bridge');
  template.deploymentId = deploymentId || '';
  template.isBridgeMode = isBridgeMode;
  return template
    .evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
