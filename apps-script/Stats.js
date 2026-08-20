var STATS_SHEET_NAME = 'Stats';
var STATS_CHANNELS = ['physical', 'online'];

// One-time setup (run from the editor, same pattern as installOnOpenTrigger).
// Everything here is a formula referencing the Tickets sheet, so once built
// it stays correct on its own — issuing/checking in tickets via #4/#5/#6
// updates these numbers with no manual recalculation step.
function installStatsSheet() {
  var ss = getEventSpreadsheet_();
  var sheet = ss.getSheetByName(STATS_SHEET_NAME);
  if (sheet) {
    sheet.clear();
  } else {
    sheet = ss.insertSheet(STATS_SHEET_NAME);
  }

  var rows = [['通路', '已發放張數', '已入場張數', '入場率']];
  STATS_CHANNELS.forEach(function (channel) {
    rows.push([
      channel,
      '=COUNTIF(Tickets!B2:B,"' + channel + '")',
      '=COUNTIFS(Tickets!B2:B,"' + channel + '",Tickets!C2:C,"checked-in")',
      '',
    ]);
  });
  rows.push(['總計', '=COUNTA(Tickets!A2:A)', '=COUNTIF(Tickets!C2:C,"checked-in")', '']);

  sheet.getRange(1, 1, rows.length, 4).setValues(rows);

  for (var row = 2; row <= rows.length; row++) {
    sheet.getRange(row, 4).setFormula('=IFERROR(C' + row + '/B' + row + ',0)');
  }
  sheet.getRange(2, 4, rows.length - 1, 1).setNumberFormat('0%');
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  sheet.autoResizeColumns(1, 4);

  return 'installed';
}
