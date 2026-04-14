function _dbSs_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('SPREADSHEET_ID not set. Run setupInit(spreadsheetId).');
  return SpreadsheetApp.openById(id);
}

function _dbSheet_(name) {
  var ss = _dbSs_();
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Missing sheet: ' + name);
  return sh;
}

function _dbEnsureSheet_(name, headers) {
  var ss = _dbSs_();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  var range = sh.getRange(1, 1, 1, headers.length);
  var values = range.getValues();
  var isEmpty = true;
  for (var i = 0; i < headers.length; i++) {
    if (values[0][i]) { isEmpty = false; break; }
  }
  if (isEmpty) {
    range.setValues([headers]);
    sh.setFrozenRows(1);
  }
}

function _dbReadAll_(sheetName) {
  var sh = _dbSheet_(sheetName);
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var o = {};
    for (var c = 0; c < headers.length; c++) o[String(headers[c])] = row[c];
    o._row = r + 1;
    out.push(o);
  }
  return out;
}

function _dbAppend_(sheetName, obj) {
  var sh = _dbSheet_(sheetName);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) row.push(obj[String(headers[i])] !== undefined ? obj[String(headers[i])] : '');
  sh.appendRow(row);
}

function _dbUpdateRow_(sheetName, rowNumber, obj) {
  var sh = _dbSheet_(sheetName);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) row.push(obj[String(headers[i])] !== undefined ? obj[String(headers[i])] : sh.getRange(rowNumber, i + 1).getValue());
  sh.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function _dbNow_() {
  return new Date();
}

function _dbUuid_() {
  return Utilities.getUuid();
}

function _ipHash_(ip) {
  if (!ip) return '';
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, ip));
}
