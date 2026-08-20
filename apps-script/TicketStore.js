var TICKETS_SHEET_NAME = 'Tickets';
var TICKET_HEADERS = ['序號', '通路', '狀態', '發放時間', '入場時間', '入場閘道'];

function getEventSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not set — run setup() first.');
  return SpreadsheetApp.openById(id);
}

function getTicketsSheet_() {
  var ss = getEventSpreadsheet_();
  var sheet = ss.getSheetByName(TICKETS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TICKETS_SHEET_NAME);
    sheet.appendRow(TICKET_HEADERS);
  }
  return sheet;
}

function findTicketRow_(sheet, serial) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var found = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(serial)
    .matchEntireCell(true)
    .findNext();
  return found ? found.getRow() : null;
}

function rowToTicketRecord_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, TICKET_HEADERS.length).getValues()[0];
  return {
    serial: values[0],
    channel: values[1],
    status: values[2],
    checkedInBy: values[5] || null,
  };
}

var sheetTicketStore = {
  findBySerial: function (serial) {
    var sheet = getTicketsSheet_();
    var row = findTicketRow_(sheet, serial);
    return row ? rowToTicketRecord_(sheet, row) : null;
  },
  markCheckedIn: function (serial, gateId) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = getTicketsSheet_();
      var row = findTicketRow_(sheet, serial);
      if (!row) return false;
      if (sheet.getRange(row, 3).getValue() === 'checked-in') return false;

      sheet.getRange(row, 3).setValue('checked-in');
      sheet.getRange(row, 5).setValue(new Date());
      sheet.getRange(row, 6).setValue(gateId);
      return true;
    } finally {
      lock.releaseLock();
    }
  },
};

// Writes all entries in a single setValues() call rather than one appendRow()
// per ticket — batch-generating hundreds of physical tickets one row at a
// time was slow enough to be noticeable in the Sheet menu.
function appendIssuedTickets_(entries) {
  var sheet = getTicketsSheet_();
  var now = new Date();
  var rows = entries.map(function (entry) {
    return [entry.serial, entry.channel, 'issued', now, '', ''];
  });
  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, TICKET_HEADERS.length).setValues(rows);
}
