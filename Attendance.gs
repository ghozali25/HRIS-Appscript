function apiEmployeeBootstrap(token) {
  var sess = _requireSession_(token);
  var locations = _dbReadAll_('Locations').filter(function (x) { return String(x.active || 'Y') === 'Y'; });
  var settings = {
    companyName: _settingsGet_('company_name', 'Company'),
    lateToleranceMinutes: Number(_settingsGet_('late_tolerance_minutes', '10')),
    earlyOutToleranceMinutes: Number(_settingsGet_('early_out_tolerance_minutes', '0')),
    minGpsAccuracyM: Number(_settingsGet_('min_gps_accuracy_m', '50')),
    defaultRadiusM: Number(_settingsGet_('default_radius_m', '100')),
    requireSelfie: String(_settingsGet_('require_selfie', 'N'))
  };
  return { me: sess, locations: locations, settings: settings };
}

function _getScheduleForDate_(dateObj) {
  var tz = _settingsGet_('timezone', Session.getScriptTimeZone());
  var dow = Utilities.formatDate(dateObj, tz, 'EEE');
  var map = { Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun' };
  var key = map[dow] || dow;
  var rows = _dbReadAll_('WorkSchedule');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].day_of_week) === key && String(rows[i].enabled) === 'TRUE') return rows[i];
  }
  return null;
}

function _parseTimeToDate_(dateObj, hhmm) {
  var tz = _settingsGet_('timezone', Session.getScriptTimeZone());
  var day = Utilities.formatDate(dateObj, tz, 'yyyy-MM-dd');
  var parts = String(hhmm || '').split(':');
  if (parts.length < 2) return null;
  var h = Number(parts[0]);
  var m = Number(parts[1]);
  if (!isFinite(h) || !isFinite(m)) return null;
  var dt = new Date(day + 'T00:00:00');
  dt.setHours(h, m, 0, 0);
  return dt;
}

function _computeAttendanceStatus_(clockInTs, clockOutTs) {
  if (!clockInTs || !clockOutTs) return '';
  var lateTol = Number(_settingsGet_('late_tolerance_minutes', '10'));
  var earlyTol = Number(_settingsGet_('early_out_tolerance_minutes', '0'));

  var sched = _getScheduleForDate_(new Date(clockInTs));
  if (!sched) return 'OK';
  var start = _parseTimeToDate_(new Date(clockInTs), sched.start_time);
  var end = _parseTimeToDate_(new Date(clockInTs), sched.end_time);
  if (!start || !end) return 'OK';

  var status = 'OK';
  var inMs = new Date(clockInTs).getTime();
  var outMs = new Date(clockOutTs).getTime();
  if (inMs > start.getTime() + lateTol * 60000) status = 'LATE';
  if (outMs < end.getTime() - earlyTol * 60000) status = (status === 'LATE') ? 'LATE_EARLY_OUT' : 'EARLY_OUT';
  return status;
}

function _getLastAttendancePoint_(employeeId) {
  var rows = _dbReadAll_('Attendance');
  var best = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].employee_id) !== String(employeeId)) continue;
    var ts = rows[i].clock_out_ts || rows[i].clock_in_ts;
    if (!ts) continue;
    var lat = rows[i].clock_out_lat || rows[i].clock_in_lat;
    var lng = rows[i].clock_out_lng || rows[i].clock_in_lng;
    if (lat === '' || lng === '' || lat === null || lng === null) continue;
    var t = new Date(ts).getTime();
    if (!best || t > best.tsMs) {
      best = { tsMs: t, lat: Number(lat), lng: Number(lng) };
    }
  }
  return best;
}

function _speedSuspicious_(employeeId, nowTs, lat, lng) {
  var maxSpeed = Number(_settingsGet_('max_speed_mps', '30'));
  if (!isFinite(maxSpeed) || maxSpeed <= 0) return null;
  var last = _getLastAttendancePoint_(employeeId);
  if (!last) return null;

  var dtSec = (new Date(nowTs).getTime() - last.tsMs) / 1000;
  if (!isFinite(dtSec) || dtSec <= 0) return null;
  if (dtSec < 60) return null;

  var distM = _haversineM_(Number(last.lat), Number(last.lng), Number(lat), Number(lng));
  var speed = distM / dtSec;
  if (speed > maxSpeed) {
    return 'SPEED:' + speed.toFixed(1) + 'mps dist=' + Math.round(distM) + 'm dt=' + Math.round(dtSec) + 's';
  }
  return null;
}

function _haversineM_(lat1, lon1, lat2, lon2) {
  function toRad(x) { return x * Math.PI / 180; }
  var R = 6371000;
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function _pickNearestLocation_(lat, lng, locations) {
  var best = null;
  for (var i = 0; i < locations.length; i++) {
    var L = locations[i];
    var d = _haversineM_(lat, lng, Number(L.lat), Number(L.lng));
    var radius = Number(L.radius_m || _settingsGet_('default_radius_m', '100'));
    var inside = d <= radius;
    if (!best || d < best.distanceM) {
      best = { location: L, distanceM: d, inside: inside, radiusM: radius };
    }
  }
  return best;
}

function _employeeGetOrCreateByEmail_(email) {
  var rows = _dbReadAll_('Employees');
  email = String(email).toLowerCase().trim();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].email).toLowerCase().trim() === email) return rows[i];
  }
  var id = _dbUuid_();
  var obj = {
    employee_id: id,
    full_name: email,
    email: email,
    ptkp_status: '',
    bpjs_health_member: 'N',
    bpjs_health_number: '',
    bpjs_tk_member: 'N',
    bpjs_tk_number: '',
    basic_salary: '',
    fixed_allowance: '',
    transport_allowance: '',
    position_allowance: '',
    laptop_allowance: '',
    active: 'Y'
  };
  _dbAppend_('Employees', obj);
  return _dbReadAll_('Employees').filter(function (x) { return String(x.employee_id) === id; })[0];
}

function _todayKey_() {
  var tz = _settingsGet_('timezone', Session.getScriptTimeZone());
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

function apiClockIn(token, payload) {
  var sess = _requireSession_(token);
  var email = String(sess.email);
  var emp = _employeeGetOrCreateByEmail_(email);
  var dateKey = _todayKey_();

  var requireSelfie = String(_settingsGet_('require_selfie', 'N')) === 'Y';
  if (requireSelfie && !payload.selfie_in_file_id) throw new Error('Selfie required');

  var minAcc = Number(_settingsGet_('min_gps_accuracy_m', '50'));
  var acc = Number(payload.accuracy_m);
  if (!isFinite(acc) || acc <= 0) throw new Error('Invalid accuracy');
  if (acc > minAcc) throw new Error('GPS accuracy too low');

  var lat = Number(payload.lat);
  var lng = Number(payload.lng);
  if (!isFinite(lat) || !isFinite(lng)) throw new Error('Invalid location');

  var locations = _dbReadAll_('Locations').filter(function (x) { return String(x.active || 'Y') === 'Y'; });
  if (locations.length === 0) throw new Error('No office locations configured');

  var nearest = _pickNearestLocation_(lat, lng, locations);
  var suspicious = 'N';
  var suspiciousReason = '';
  var reviewStatus = '';

  if (!nearest.inside) {
    suspicious = 'Y';
    suspiciousReason = 'OUTSIDE_GEOFENCE:' + Math.round(nearest.distanceM) + 'm';
    reviewStatus = 'PENDING';
  }

  var speedReason = _speedSuspicious_(emp.employee_id, _dbNow_(), lat, lng);
  if (speedReason) {
    suspicious = 'Y';
    suspiciousReason = (suspiciousReason ? suspiciousReason + ';' : '') + speedReason;
    reviewStatus = 'PENDING';
  }

  var existing = _dbReadAll_('Attendance').filter(function (x) {
    return String(x.employee_id) === String(emp.employee_id) && String(x.date) === dateKey;
  });
  if (existing.length > 0 && existing[0].clock_in_ts) throw new Error('Already clocked in');

  var id = existing.length > 0 ? String(existing[0].attendance_id) : _dbUuid_();
  var obj = {
    attendance_id: id,
    employee_id: emp.employee_id,
    date: dateKey,
    clock_in_ts: _dbNow_(),
    clock_in_lat: lat,
    clock_in_lng: lng,
    clock_in_accuracy_m: acc,
    clock_in_location_id: String(nearest.location.location_id),
    status: '',
    suspicious_flag: suspicious,
    suspicious_reason: suspiciousReason,
    admin_review_status: reviewStatus,
    device_fingerprint: String(payload.device_fingerprint || ''),
    ip_hash: _ipHash_(payload.ip || ''),
    selfie_in_file_id: String(payload.selfie_in_file_id || ''),
    created_at: _dbNow_()
  };

  if (existing.length > 0 && existing[0]._row) {
    _dbUpdateRow_('Attendance', existing[0]._row, obj);
  } else {
    _dbAppend_('Attendance', obj);
  }

  _audit_('CLOCK_IN', 'Attendance', id, JSON.stringify({ lat: lat, lng: lng, acc: acc, suspicious: suspicious, reason: suspiciousReason }));
  return { ok: true, attendance_id: id, suspicious: suspicious, suspicious_reason: suspiciousReason };
}

function apiClockOut(token, payload) {
  var sess = _requireSession_(token);
  var email = String(sess.email);
  var emp = _employeeGetOrCreateByEmail_(email);
  var dateKey = _todayKey_();

  var requireSelfie = String(_settingsGet_('require_selfie', 'N')) === 'Y';
  if (requireSelfie && !payload.selfie_out_file_id) throw new Error('Selfie required');

  var minAcc = Number(_settingsGet_('min_gps_accuracy_m', '50'));
  var acc = Number(payload.accuracy_m);
  if (!isFinite(acc) || acc <= 0) throw new Error('Invalid accuracy');
  if (acc > minAcc) throw new Error('GPS accuracy too low');

  var lat = Number(payload.lat);
  var lng = Number(payload.lng);
  if (!isFinite(lat) || !isFinite(lng)) throw new Error('Invalid location');

  var rows = _dbReadAll_('Attendance').filter(function (x) {
    return String(x.employee_id) === String(emp.employee_id) && String(x.date) === dateKey;
  });
  if (rows.length === 0) throw new Error('No clock-in record for today');
  var row = rows[0];
  if (!row.clock_in_ts) throw new Error('No clock-in record for today');
  if (row.clock_out_ts) throw new Error('Already clocked out');

  var locations = _dbReadAll_('Locations').filter(function (x) { return String(x.active || 'Y') === 'Y'; });
  if (locations.length === 0) throw new Error('No office locations configured');

  var nearest = _pickNearestLocation_(lat, lng, locations);
  var suspicious = String(row.suspicious_flag || 'N');
  var suspiciousReason = String(row.suspicious_reason || '');
  var reviewStatus = String(row.admin_review_status || '');

  if (!nearest.inside) {
    suspicious = 'Y';
    suspiciousReason = (suspiciousReason ? suspiciousReason + ';' : '') + 'OUTSIDE_GEOFENCE_OUT:' + Math.round(nearest.distanceM) + 'm';
    reviewStatus = 'PENDING';
  }

  var speedReason = _speedSuspicious_(emp.employee_id, _dbNow_(), lat, lng);
  if (speedReason) {
    suspicious = 'Y';
    suspiciousReason = (suspiciousReason ? suspiciousReason + ';' : '') + speedReason;
    reviewStatus = 'PENDING';
  }

  var newStatus = _computeAttendanceStatus_(row.clock_in_ts, _dbNow_());

  var obj = {
    clock_out_ts: _dbNow_(),
    clock_out_lat: lat,
    clock_out_lng: lng,
    clock_out_accuracy_m: acc,
    clock_out_location_id: String(nearest.location.location_id),
    status: newStatus,
    suspicious_flag: suspicious,
    suspicious_reason: suspiciousReason,
    admin_review_status: reviewStatus,
    selfie_out_file_id: String(payload.selfie_out_file_id || '')
  };
  _dbUpdateRow_('Attendance', row._row, obj);

  _audit_('CLOCK_OUT', 'Attendance', row.attendance_id, JSON.stringify({ lat: lat, lng: lng, acc: acc, suspicious: suspicious, reason: suspiciousReason }));
  return { ok: true, attendance_id: row.attendance_id, suspicious: suspicious, suspicious_reason: suspiciousReason };
}
