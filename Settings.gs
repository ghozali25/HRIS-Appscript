function _settingsUpsert_(key, value) {
  key = String(key);
  var rows = _dbReadAll_('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === key) {
      _dbUpdateRow_('Settings', rows[i]._row, { key: key, value: value });
      return;
    }
  }
  _dbAppend_('Settings', { key: key, value: value });
}

function _settingsGet_(key, defaultValue) {
  key = String(key);
  var rows = _dbReadAll_('Settings');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].key) === key) return rows[i].value;
  }
  return defaultValue;
}
