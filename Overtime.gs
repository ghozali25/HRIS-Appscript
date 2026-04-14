function apiAdminGetOvertime(token, periodId) {
  _requireAdmin_(token);
  if (!periodId) throw new Error('periodId required');
  var rows = _dbReadAll_('Overtime');
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].period_id) !== String(periodId)) continue;
    out[String(rows[i].employee_id)] = Number(rows[i].overtime_days || 0) || 0;
  }
  return out;
}

function apiAdminUpsertOvertime(token, periodId, employeeId, overtimeDays) {
  _requireAdmin_(token);
  if (!periodId) throw new Error('periodId required');
  if (!employeeId) throw new Error('employeeId required');
  overtimeDays = Number(overtimeDays);
  if (!isFinite(overtimeDays) || overtimeDays < 0) throw new Error('overtimeDays invalid');

  var rows = _dbReadAll_('Overtime');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].period_id) === String(periodId) && String(rows[i].employee_id) === String(employeeId)) {
      _dbUpdateRow_('Overtime', rows[i]._row, {
        period_id: String(periodId),
        employee_id: String(employeeId),
        overtime_days: overtimeDays,
        updated_at: _dbNow_()
      });
      _audit_('UPSERT_OVERTIME', 'Overtime', String(periodId) + ':' + String(employeeId), JSON.stringify({ overtime_days: overtimeDays }));
      return true;
    }
  }

  _dbAppend_('Overtime', {
    period_id: String(periodId),
    employee_id: String(employeeId),
    overtime_days: overtimeDays,
    updated_at: _dbNow_()
  });
  _audit_('UPSERT_OVERTIME', 'Overtime', String(periodId) + ':' + String(employeeId), JSON.stringify({ overtime_days: overtimeDays }));
  return true;
}
