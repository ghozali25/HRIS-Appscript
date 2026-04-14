function apiAdminBootstrap(token) {
  var sess = _requireAdmin_(token);
  var settings = _dbReadAll_('Settings');
  var schedule = _dbReadAll_('WorkSchedule');
  var locations = _dbReadAll_('Locations');
  var users = _dbReadAll_('Users');
  var employees = _dbReadAll_('Employees');
  return {
    me: sess,
    settings: settings,
    schedule: schedule,
    locations: locations,
    users: users,
    employees: employees
  };
}

function apiAdminListSuspiciousAttendance(token, limit) {
  _requireAdmin_(token);
  var rows = _dbReadAll_('Attendance');
  var out = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    if (String(r.suspicious_flag || 'N') !== 'Y') continue;
    if (String(r.admin_review_status || '') !== 'PENDING') continue;
    out.push(r);
    if (limit && out.length >= Number(limit)) break;
  }
  return out;
}

function apiAdminReviewAttendance(token, attendanceId, decision, note) {
  var sess = _requireAdmin_(token);
  if (!attendanceId) throw new Error('attendanceId required');
  decision = String(decision || '').toUpperCase();
  if (decision !== 'APPROVED' && decision !== 'REJECTED') throw new Error('decision must be APPROVED or REJECTED');

  var rows = _dbReadAll_('Attendance');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].attendance_id) !== String(attendanceId)) continue;
    var reason = String(rows[i].suspicious_reason || '');
    if (note) reason = reason + (reason ? ';' : '') + 'ADMIN_NOTE:' + String(note);
    _dbUpdateRow_('Attendance', rows[i]._row, {
      admin_review_status: decision,
      suspicious_reason: reason
    });
    _audit_('REVIEW_ATTENDANCE', 'Attendance', attendanceId, JSON.stringify({ decision: decision, note: note || '', actor: sess.email }));
    return true;
  }
  throw new Error('Attendance not found');
}

function apiAdminListEmployees(token) {
  _requireAdmin_(token);
  return _dbReadAll_('Employees').filter(function (x) { return String(x.active || 'Y') === 'Y'; });
}

function apiAdminUpsertLocation(token, location) {
  _requireAdmin_(token);
  var sh = _dbSheet_('Locations');
  var rows = _dbReadAll_('Locations');
  var id = location.location_id ? String(location.location_id) : _dbUuid_();
  var obj = {
    location_id: id,
    name: String(location.name || ''),
    lat: Number(location.lat),
    lng: Number(location.lng),
    radius_m: location.radius_m !== undefined && location.radius_m !== '' ? Number(location.radius_m) : Number(_settingsGet_('default_radius_m', '100')),
    active: location.active ? String(location.active) : 'Y'
  };
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].location_id) === id) {
      _dbUpdateRow_('Locations', rows[i]._row, obj);
      _audit_('UPSERT_LOCATION', 'Locations', id, JSON.stringify(obj));
      return obj;
    }
  }
  _dbAppend_('Locations', obj);
  _audit_('UPSERT_LOCATION', 'Locations', id, JSON.stringify(obj));
  return obj;
}

function apiAdminUpsertUser(token, user) {
  _requireAdmin_(token);
  _userUpsert_(user);
  _audit_('UPSERT_USER', 'Users', user.email, JSON.stringify({ email: user.email, role: user.role, username: user.username, active: user.active }));
  return true;
}

function apiAdminUpsertSettings(token, kv) {
  _requireAdmin_(token);
  for (var i = 0; i < kv.length; i++) {
    _settingsUpsert_(kv[i].key, kv[i].value);
  }
  _audit_('UPSERT_SETTINGS', 'Settings', '', JSON.stringify(kv));
  return true;
}

function apiAdminUpsertEmployee(token, employee) {
  _requireAdmin_(token);
  if (!employee) throw new Error('employee required');
  var id = String(employee.employee_id || '').trim();
  if (!id) throw new Error('employee_id required');

  var rows = _dbReadAll_('Employees');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].employee_id) !== id) continue;
    var obj = {
      employee_id: id,
      full_name: employee.full_name !== undefined ? String(employee.full_name) : rows[i].full_name,
      email: employee.email !== undefined ? String(employee.email).toLowerCase().trim() : rows[i].email,
      ptkp_status: employee.ptkp_status !== undefined ? String(employee.ptkp_status) : rows[i].ptkp_status,
      bpjs_health_member: employee.bpjs_health_member !== undefined ? String(employee.bpjs_health_member) : rows[i].bpjs_health_member,
      bpjs_health_number: employee.bpjs_health_number !== undefined ? String(employee.bpjs_health_number) : rows[i].bpjs_health_number,
      bpjs_tk_member: employee.bpjs_tk_member !== undefined ? String(employee.bpjs_tk_member) : rows[i].bpjs_tk_member,
      bpjs_tk_number: employee.bpjs_tk_number !== undefined ? String(employee.bpjs_tk_number) : rows[i].bpjs_tk_number,
      basic_salary: employee.basic_salary !== undefined ? employee.basic_salary : rows[i].basic_salary,
      fixed_allowance: employee.fixed_allowance !== undefined ? employee.fixed_allowance : rows[i].fixed_allowance,
      transport_allowance: employee.transport_allowance !== undefined ? employee.transport_allowance : rows[i].transport_allowance,
      position_allowance: employee.position_allowance !== undefined ? employee.position_allowance : rows[i].position_allowance,
      laptop_allowance: employee.laptop_allowance !== undefined ? employee.laptop_allowance : rows[i].laptop_allowance,
      active: employee.active !== undefined ? String(employee.active) : rows[i].active
    };
    _dbUpdateRow_('Employees', rows[i]._row, obj);
    _audit_('UPSERT_EMPLOYEE', 'Employees', id, JSON.stringify({ employee_id: id, email: obj.email }));
    return obj;
  }
  throw new Error('Employee not found');
}

function _fileUrlSafe_(fileId) {
  if (!fileId) return '';
  try {
    return DriveApp.getFileById(String(fileId)).getUrl();
  } catch (e) {
    return '';
  }
}

function apiAdminListAttendance(token, startDate, endDate, limit) {
  _requireAdmin_(token);
  startDate = String(startDate || '').trim();
  endDate = String(endDate || '').trim();
  if (!startDate || !endDate) throw new Error('startDate and endDate required (yyyy-mm-dd)');
  var lim = limit ? Number(limit) : 200;
  if (!isFinite(lim) || lim <= 0) lim = 200;
  lim = Math.min(lim, 1000);

  var att = _dbReadAll_('Attendance');
  var emps = _dbReadAll_('Employees');
  var empMap = {};
  for (var i = 0; i < emps.length; i++) empMap[String(emps[i].employee_id)] = emps[i];

  var out = [];
  for (var a = att.length - 1; a >= 0; a--) {
    var r = att[a];
    var d = String(r.date || '');
    if (!d) continue;
    if (d < startDate || d > endDate) continue;
    var e = empMap[String(r.employee_id)] || {};
    out.push({
      attendance_id: r.attendance_id,
      employee_id: r.employee_id,
      employee_name: e.full_name || '',
      employee_email: e.email || '',
      date: r.date,
      clock_in_ts: r.clock_in_ts,
      clock_out_ts: r.clock_out_ts,
      status: r.status,
      suspicious_flag: r.suspicious_flag,
      suspicious_reason: r.suspicious_reason,
      admin_review_status: r.admin_review_status,
      selfie_in_file_id: r.selfie_in_file_id,
      selfie_out_file_id: r.selfie_out_file_id,
      selfie_in_url: _fileUrlSafe_(r.selfie_in_file_id),
      selfie_out_url: _fileUrlSafe_(r.selfie_out_file_id)
    });
    if (out.length >= lim) break;
  }
  return out;
}

function apiAdminExportAttendanceCsv(token, startDate, endDate) {
  _requireAdmin_(token);
  var rows = apiAdminListAttendance(token, startDate, endDate, 1000);
  var headers = [
    'attendance_id','employee_id','employee_name','employee_email','date',
    'clock_in_ts','clock_out_ts','status',
    'suspicious_flag','admin_review_status','suspicious_reason',
    'selfie_in_file_id','selfie_in_url','selfie_out_file_id','selfie_out_url'
  ];
  function q(v) {
    var s = String(v === undefined || v === null ? '' : v);
    s = s.replace(/"/g, '""');
    return '"' + s + '"';
  }
  var lines = [headers.join(',')];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var vals = headers.map(function (h) { return r[h]; });
    lines.push(vals.map(q).join(','));
  }
  var folder = _getOrCreateFolder_(_settingsGet_('payroll_folder_id', ''), 'HRIS_Reports');
  var name = 'attendance_' + startDate + '_' + endDate + '_' + Utilities.formatDate(new Date(), _settingsGet_('timezone', Session.getScriptTimeZone()), 'yyyyMMdd_HHmmss') + '.csv';
  var blob = Utilities.newBlob(lines.join('\n'), 'text/csv', name);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  _audit_('EXPORT_ATTENDANCE_CSV', 'Drive', file.getId(), JSON.stringify({ startDate: startDate, endDate: endDate, name: name }));
  return { fileId: file.getId(), name: name, url: file.getUrl() };
}

function apiAdminUpsertSchedule(token, rows) {
  _requireAdmin_(token);
  var sh = _dbSheet_('WorkSchedule');
  sh.getRange(2, 1, Math.max(0, sh.getLastRow() - 1), sh.getLastColumn()).clearContent();
  for (var i = 0; i < rows.length; i++) {
    _dbAppend_('WorkSchedule', {
      day_of_week: rows[i].day_of_week,
      start_time: rows[i].start_time,
      end_time: rows[i].end_time,
      enabled: rows[i].enabled
    });
  }
  _audit_('UPSERT_SCHEDULE', 'WorkSchedule', '', JSON.stringify(rows));
  return true;
}
