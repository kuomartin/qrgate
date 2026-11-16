// 金鑰存在這個 container-bound 專案的 Script Properties：
//   SIGNING_SEED — Ed25519 32 bytes 種子（base64url），私鑰由它重新推導
//   PUBLIC_KEY   — 對應公鑰（base64url），給掃描連結用
var PROP_SEED = 'SIGNING_SEED';
var PROP_PUBLIC_KEY = 'PUBLIC_KEY';
var SCAN_BASE_URL = 'https://kuomartin.github.io/qrgate/';
var QR_ROW_HEIGHT_PX = 120;

var serial = Serial.create(nacl);

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('QRGate')
    .addItem('產生序號（從選取的儲存格開始）', 'generateSerialsFromSelection')
    .addItem('產生掃描連結', 'showScanLinkDialog')
    .addSeparator()
    .addItem('產生新金鑰對', 'generateKeyPair')
    .addToUi();
}

// Apps Script 沒有 CSPRNG；Utilities.getUuid() 每次給 122 bits 的隨機值，
// 把多個 UUID 與時間戳一起過 SHA-512 後取所需長度。
function randomBytes_(n) {
  var out = new Uint8Array(n);
  var filled = 0;
  var counter = 0;
  while (filled < n) {
    var material =
      Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid() + Date.now() + ':' + counter++;
    var digest = nacl.hash(new Uint8Array(Utilities.newBlob(material).getBytes().map(function (b) { return b & 255; })));
    for (var i = 0; i < digest.length && filled < n; i++) out[filled++] = digest[i];
  }
  return out;
}

function loadKeyPair_() {
  var props = PropertiesService.getScriptProperties();
  var seedText = props.getProperty(PROP_SEED);
  if (!seedText) return null;
  return serial.keyPairFromSeed(Serial.fromBase64url(seedText));
}

function generateKeyPair() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_SEED)) {
    var answer = ui.alert(
      '已經有金鑰對',
      '產生新金鑰對後，先前用舊金鑰簽發的序號全部無法再通過驗證，掃描連結也要重新發放。確定要覆寫？',
      ui.ButtonSet.YES_NO,
    );
    if (answer !== ui.Button.YES) return;
  }
  var seed = randomBytes_(nacl.sign.seedLength);
  var keys = serial.keyPairFromSeed(seed);
  props.setProperties({
    SIGNING_SEED: Serial.toBase64url(seed),
    PUBLIC_KEY: Serial.toBase64url(keys.publicKey),
  });
  ui.alert('金鑰對已產生', '公鑰：\n' + Serial.toBase64url(keys.publicKey), ui.ButtonSet.OK);
}

function generateSerialsFromSelection() {
  var ui = SpreadsheetApp.getUi();
  var keys = loadKeyPair_();
  if (!keys) {
    ui.alert('尚未產生金鑰對，請先執行「QRGate → 產生新金鑰對」。');
    return;
  }

  var range = SpreadsheetApp.getActiveRange();
  var sheet = range.getSheet();
  var startRow = range.getRow();
  var startCol = range.getColumn();

  var response = ui.prompt(
    '產生序號',
    '將從 ' + sheet.getName() + '!' + range.getA1Notation().split(':')[0] +
      ' 往下寫入：此欄放序號文字，右邊一欄放 QR Code。\n請輸入要產生的張數：',
    ui.ButtonSet.OK_CANCEL,
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var count = parseInt(response.getResponseText(), 10);
  if (!count || count <= 0) {
    ui.alert('請輸入大於 0 的整數張數。');
    return;
  }

  var target = sheet.getRange(startRow, startCol, count, 2);
  if (target.getValues().some(function (row) { return row[0] !== '' || row[1] !== ''; })) {
    var overwrite = ui.alert('目標範圍已有內容', '要覆寫 ' + target.getA1Notation() + ' 嗎？', ui.ButtonSet.YES_NO);
    if (overwrite !== ui.Button.YES) return;
  }

  var rows = [];
  for (var i = 0; i < count; i++) {
    var token = serial.issue(keys.secretKey, randomBytes_(serial.ID_LENGTH));
    rows.push([token, qrCellImage_(token)]);
  }
  target.setValues(rows);
  sheet.setRowHeightsForced(startRow, count, QR_ROW_HEIGHT_PX);
  if (sheet.getColumnWidth(startCol + 1) < QR_ROW_HEIGHT_PX) sheet.setColumnWidth(startCol + 1, QR_ROW_HEIGHT_PX);
}

function qrCellImage_(text) {
  var qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return SpreadsheetApp.newCellImage().setSourceUrl(qr.createDataURL(4, 2)).setAltTextTitle(text).build();
}

function showScanLinkDialog() {
  var ui = SpreadsheetApp.getUi();
  var publicKey = PropertiesService.getScriptProperties().getProperty(PROP_PUBLIC_KEY);
  if (!publicKey) {
    ui.alert('尚未產生金鑰對，請先執行「QRGate → 產生新金鑰對」。');
    return;
  }
  // 公鑰放 hash：不會送到 GitHub Pages 伺服器，不留在存取紀錄。
  var template = HtmlService.createTemplateFromFile('ScanLinkDialog');
  template.scanUrl = SCAN_BASE_URL + '#pk=' + publicKey;
  ui.showModalDialog(template.evaluate().setWidth(360).setHeight(420), '掃描連結與 QR Code');
}
