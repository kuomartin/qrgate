// This script is standalone (not bound to the event's Sheet), so a simple
// onOpen() trigger won't fire when the organizer opens the Sheet — it only
// fires for container-bound scripts. Run installOnOpenTrigger() once (from
// the Apps Script editor) to register onOpen as an installable trigger
// against EVENT_SPREADSHEET_ID instead.
function installOnOpenTrigger() {
  var alreadyInstalled = ScriptApp.getProjectTriggers().some(function (trigger) {
    return (
      trigger.getHandlerFunction() === 'onOpen' &&
      trigger.getEventType() === ScriptApp.EventType.ON_OPEN
    );
  });
  if (alreadyInstalled) return 'already installed';

  ScriptApp.newTrigger('onOpen').forSpreadsheet(getEventSpreadsheet_()).onOpen().create();
  return 'installed';
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('QRGate')
    .addItem('批次產生實體索票', 'showBatchGeneratePhysicalPrompt')
    .addToUi();
}

function showBatchGeneratePhysicalPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    '批次產生實體索票',
    '請輸入要產生的張數：',
    ui.ButtonSet.OK_CANCEL,
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  var count = parseInt(response.getResponseText(), 10);
  if (!count || count <= 0) {
    ui.alert('請輸入大於 0 的整數張數。');
    return;
  }

  var serials = batchGenerateTickets('physical', count);
  ui.alert('已產生 ' + serials.length + ' 筆實體索票序號，可在 Tickets 分頁查看。');
}
