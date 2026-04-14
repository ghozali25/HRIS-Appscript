function _ptkpAnnual_(status) {
  status = String(status || '').toUpperCase().trim();
  var base = 54000000;
  var married = 0;
  var dep = 0;
  if (status.indexOf('K/') === 0) {
    married = 4500000;
    dep = Number(status.split('/')[1] || 0);
  } else if (status.indexOf('TK/') === 0) {
    dep = Number(status.split('/')[1] || 0);
  } else {
    dep = 0;
  }
  if (!isFinite(dep) || dep < 0) dep = 0;
  if (dep > 3) dep = 3;
  return base + married + dep * 4500000;
}

function _pph21Annual_(pkpAnnual) {
  var x = Math.max(0, Number(pkpAnnual || 0));
  var tax = 0;
  var bands = [
    { cap: 60000000, rate: 0.05 },
    { cap: 250000000, rate: 0.15 },
    { cap: 500000000, rate: 0.25 },
    { cap: 5000000000, rate: 0.30 },
    { cap: Infinity, rate: 0.35 }
  ];
  var prev = 0;
  for (var i = 0; i < bands.length; i++) {
    var cap = bands[i].cap;
    var amt = Math.min(x, cap) - prev;
    if (amt > 0) tax += amt * bands[i].rate;
    prev = cap;
    if (x <= cap) break;
  }
  return tax;
}

function _num_(v, def) {
  var n = Number(v);
  return isFinite(n) ? n : (def !== undefined ? def : 0);
}

function _upsertPayrollRow_(obj) {
  var rows = _dbReadAll_('Payroll');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].period_id) === String(obj.period_id) && String(rows[i].employee_id) === String(obj.employee_id)) {
      _dbUpdateRow_('Payroll', rows[i]._row, obj);
      return;
    }
  }
  _dbAppend_('Payroll', obj);
}

function _isWorkday_(dateObj) {
  var tz = _settingsGet_('timezone', Session.getScriptTimeZone());
  var dow = Utilities.formatDate(dateObj, tz, 'EEE');
  var map = { Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun' };
  var key = map[dow] || dow;
  var rows = _dbReadAll_('WorkSchedule');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].day_of_week) === key && String(rows[i].enabled) === 'TRUE') return true;
  }
  return false;
}

function _countWorkdaysInRange_(startDate, endDate) {
  var s = new Date(startDate);
  var e = new Date(endDate);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  var c = 0;
  for (var d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (_isWorkday_(d)) c++;
  }
  return c;
}

function apiComputePayrollPeriod(token, periodId) {
  _requireAdmin_(token);
  if (!periodId) throw new Error('periodId required');
  var periods = _dbReadAll_('PayrollPeriods');
  var period = null;
  for (var i = 0; i < periods.length; i++) {
    if (String(periods[i].period_id) === String(periodId)) { period = periods[i]; break; }
  }
  if (!period) throw new Error('Period not found');

  var start = new Date(period.start_date);
  var end = new Date(period.end_date);
  var employees = _dbReadAll_('Employees').filter(function (x) { return String(x.active || 'Y') === 'Y'; });
  var attendance = _dbReadAll_('Attendance');

  var enableAbsentDeduction = String(_settingsGet_('enable_absent_deduction', 'N')) === 'Y';
  var deductionPerAbsentDay = _num_(_settingsGet_('deduction_per_absent_day', '0'), 0);
  var biayaJabatanRate = _num_(_settingsGet_('biaya_jabatan_rate', '0.05'), 0.05);
  var biayaJabatanCap = _num_(_settingsGet_('biaya_jabatan_cap_month', '500000'), 500000);

  var overtimeRatePerDay = _num_(_settingsGet_('overtime_rate_per_day', '0'), 0);
  var overtimeMap = _dbReadAll_('Overtime');
  var ot = {};
  for (var o = 0; o < overtimeMap.length; o++) {
    if (String(overtimeMap[o].period_id) !== String(periodId)) continue;
    ot[String(overtimeMap[o].employee_id)] = _num_(overtimeMap[o].overtime_days, 0);
  }

  var bpjsHealthEmpRate = _num_(_settingsGet_('bpjs_health_emp_rate', '0.01'), 0.01);
  var bpjsHealthCompanyRate = _num_(_settingsGet_('bpjs_health_company_rate', '0.04'), 0.04);
  var bpjsHealthCeiling = _num_(_settingsGet_('bpjs_health_ceiling', '12000000'), 12000000);

  var bpjsJhtEmpRate = _num_(_settingsGet_('bpjs_jht_emp_rate', '0.02'), 0.02);
  var bpjsJhtCompanyRate = _num_(_settingsGet_('bpjs_jht_company_rate', '0.037'), 0.037);
  var bpjsJpEmpRate = _num_(_settingsGet_('bpjs_jp_emp_rate', '0.01'), 0.01);
  var bpjsJpCompanyRate = _num_(_settingsGet_('bpjs_jp_company_rate', '0.02'), 0.02);
  var bpjsJpCeiling = _num_(_settingsGet_('bpjs_jp_ceiling', '10042300'), 10042300);
  var bpjsJkkCompanyRate = _num_(_settingsGet_('bpjs_jkk_company_rate', '0.0024'), 0.0024);
  var bpjsJkmCompanyRate = _num_(_settingsGet_('bpjs_jkm_company_rate', '0.003'), 0.003);

  var map = {};
  for (var a = 0; a < attendance.length; a++) {
    var d = new Date(attendance[a].date);
    if (d < start || d > end) continue;
    var eid = String(attendance[a].employee_id);
    if (!map[eid]) map[eid] = [];
    map[eid].push(attendance[a]);
  }

  for (var e = 0; e < employees.length; e++) {
    var emp = employees[e];
    var eid2 = String(emp.employee_id);
    var rows = map[eid2] || [];

    var present = 0;
    var lateCount = 0;
    var earlyCount = 0;
    for (var r = 0; r < rows.length; r++) {
      if (rows[r].clock_in_ts && rows[r].clock_out_ts) present++;
      var st = String(rows[r].status || '');
      if (st === 'LATE' || st === 'LATE_EARLY_OUT') lateCount++;
      if (st === 'EARLY_OUT' || st === 'LATE_EARLY_OUT') earlyCount++;
    }

    var basicSalary = _num_(emp.basic_salary, 0);
    var fixedAllowance = _num_(emp.fixed_allowance, 0);
    var transportAllowance = _num_(emp.transport_allowance, 0);
    var positionAllowance = _num_(emp.position_allowance, 0);
    var laptopAllowance = _num_(emp.laptop_allowance, 0);
    var overtimeDays = _num_(ot[eid2], 0);
    var overtimePay = overtimeDays * overtimeRatePerDay;

    var gross = basicSalary + fixedAllowance + transportAllowance + positionAllowance + laptopAllowance + overtimePay;

    var workdays = _countWorkdaysInRange_(start, end);
    var absentDays = Math.max(0, workdays - present);
    var deductionAmount = enableAbsentDeduction ? (absentDays * deductionPerAbsentDay) : 0;

    var bpjsHealthEmp = 0, bpjsHealthCompany = 0;
    var bpjsTkEmp = 0, bpjsTkCompany = 0;

    var baseHealth = Math.min(gross, bpjsHealthCeiling);
    var baseJp = Math.min(gross, bpjsJpCeiling);

    if (String(emp.bpjs_health_member || 'N') === 'Y') {
      bpjsHealthEmp = baseHealth * bpjsHealthEmpRate;
      bpjsHealthCompany = baseHealth * bpjsHealthCompanyRate;
    }
    if (String(emp.bpjs_tk_member || 'N') === 'Y') {
      var jhtEmp = gross * bpjsJhtEmpRate;
      var jhtCompany = gross * bpjsJhtCompanyRate;
      var jpEmp = baseJp * bpjsJpEmpRate;
      var jpCompany = baseJp * bpjsJpCompanyRate;
      var jkkCompany = gross * bpjsJkkCompanyRate;
      var jkmCompany = gross * bpjsJkmCompanyRate;

      bpjsTkEmp = jhtEmp + jpEmp;
      bpjsTkCompany = jhtCompany + jpCompany + jkkCompany + jkmCompany;
    }

    var biayaJabatan = Math.min(gross * biayaJabatanRate, biayaJabatanCap);
    var iuranPensiun = 0;
    var netoMonth = Math.max(0, gross - biayaJabatan - bpjsTkEmp - iuranPensiun);
    var netoAnnual = netoMonth * 12;
    var ptkp = _ptkpAnnual_(emp.ptkp_status);
    var pkpAnnual = Math.max(0, netoAnnual - ptkp);
    pkpAnnual = Math.floor(pkpAnnual / 1000) * 1000;
    var pphAnnual = _pph21Annual_(pkpAnnual);
    var pphMonth = pphAnnual / 12;

    var netPay = gross - deductionAmount - bpjsHealthEmp - bpjsTkEmp - pphMonth;

    _upsertPayrollRow_({
      period_id: String(periodId),
      employee_id: eid2,
      days_present: present,
      late_count: lateCount,
      early_out_count: earlyCount,
      deduction_amount: deductionAmount,
      bpjs_health_employee: Math.round(bpjsHealthEmp),
      bpjs_health_company: Math.round(bpjsHealthCompany),
      bpjs_tk_employee: Math.round(bpjsTkEmp),
      bpjs_tk_company: Math.round(bpjsTkCompany),
      pph21_amount: Math.round(pphMonth),
      net_pay: Math.round(netPay),
      created_at: _dbNow_()
    });
  }

  _audit_('COMPUTE_PAYROLL', 'PayrollPeriods', periodId, JSON.stringify({ employees: employees.length }));
  return true;
}

function apiAdminListPayrollPeriods(token) {
  _requireAdmin_(token);
  return _dbReadAll_('PayrollPeriods');
}

function apiAdminUpsertPayrollPeriod(token, payload) {
  _requireAdmin_(token);
  var periodId = String(payload.period_id || '').trim();
  if (!periodId) throw new Error('period_id required');
  var startDate = payload.start_date;
  var endDate = payload.end_date;
  if (!startDate || !endDate) throw new Error('start_date and end_date required');
  var closed = payload.closed ? String(payload.closed) : 'FALSE';

  var rows = _dbReadAll_('PayrollPeriods');
  var obj = {
    period_id: periodId,
    start_date: startDate,
    end_date: endDate,
    closed: closed
  };
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].period_id) === periodId) {
      _dbUpdateRow_('PayrollPeriods', rows[i]._row, obj);
      _audit_('UPSERT_PAYROLL_PERIOD', 'PayrollPeriods', periodId, JSON.stringify(obj));
      return obj;
    }
  }
  _dbAppend_('PayrollPeriods', obj);
  _audit_('UPSERT_PAYROLL_PERIOD', 'PayrollPeriods', periodId, JSON.stringify(obj));
  return obj;
}

function apiAdminListPayrollRows(token, periodId) {
  _requireAdmin_(token);
  if (!periodId) throw new Error('periodId required');
  var rows = _dbReadAll_('Payroll');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].period_id) === String(periodId)) out.push(rows[i]);
  }
  return out;
}

function apiAdminExportPayrollCsv(token, periodId) {
  _requireAdmin_(token);
  if (!periodId) throw new Error('periodId required');
  var payroll = apiAdminListPayrollRows(token, periodId);
  var employees = _dbReadAll_('Employees');
  var empMap = {};
  for (var i = 0; i < employees.length; i++) empMap[String(employees[i].employee_id)] = employees[i];

  var overtimeRatePerDay = _num_(_settingsGet_('overtime_rate_per_day', '0'), 0);
  var otRows = _dbReadAll_('Overtime');
  var ot = {};
  for (var o = 0; o < otRows.length; o++) {
    if (String(otRows[o].period_id) !== String(periodId)) continue;
    ot[String(otRows[o].employee_id)] = _num_(otRows[o].overtime_days, 0);
  }

  var headers = [
    'period_id', 'employee_id', 'employee_name', 'employee_email',
    'basic_salary', 'fixed_allowance', 'transport_allowance', 'position_allowance', 'laptop_allowance', 'overtime_days', 'overtime_pay', 'gross',
    'days_present', 'late_count', 'early_out_count',
    'deduction_amount',
    'bpjs_health_employee', 'bpjs_health_company',
    'bpjs_tk_employee', 'bpjs_tk_company',
    'pph21_amount', 'net_pay'
  ];

  var lines = [];
  lines.push(headers.join(','));
  function q(v) {
    var s = String(v === undefined || v === null ? '' : v);
    s = s.replace(/"/g, '""');
    return '"' + s + '"';
  }

  for (var r = 0; r < payroll.length; r++) {
    var row = payroll[r];
    var emp = empMap[String(row.employee_id)] || {};

    var basic = _num_(emp.basic_salary, 0);
    var fixed = _num_(emp.fixed_allowance, 0);
    var tr = _num_(emp.transport_allowance, 0);
    var pos = _num_(emp.position_allowance, 0);
    var lap = _num_(emp.laptop_allowance, 0);
    var otDays = _num_(ot[String(row.employee_id)], 0);
    var otPay = otDays * overtimeRatePerDay;
    var gross = basic + fixed + tr + pos + lap + otPay;

    var vals = [
      row.period_id,
      row.employee_id,
      emp.full_name || '',
      emp.email || '',
      Math.round(basic),
      Math.round(fixed),
      Math.round(tr),
      Math.round(pos),
      Math.round(lap),
      Math.round(otDays),
      Math.round(otPay),
      Math.round(gross),
      row.days_present,
      row.late_count,
      row.early_out_count,
      row.deduction_amount,
      row.bpjs_health_employee,
      row.bpjs_health_company,
      row.bpjs_tk_employee,
      row.bpjs_tk_company,
      row.pph21_amount,
      row.net_pay
    ];
    lines.push(vals.map(q).join(','));
  }

  var folder = _getOrCreateFolder_(_settingsGet_('payroll_folder_id', ''), 'HRIS_Payroll');
  var name = 'payroll_' + String(periodId) + '_' + Utilities.formatDate(new Date(), _settingsGet_('timezone', Session.getScriptTimeZone()), 'yyyyMMdd_HHmmss') + '.csv';
  var blob = Utilities.newBlob(lines.join('\n'), 'text/csv', name);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  _audit_('EXPORT_PAYROLL_CSV', 'Drive', file.getId(), JSON.stringify({ periodId: periodId, name: name }));
  return { fileId: file.getId(), name: name, url: file.getUrl() };
}

function apiAdminGeneratePayslipsPdf(token, periodId) {
  _requireAdmin_(token);
  if (!periodId) throw new Error('periodId required');

  var rows = apiAdminListPayrollRows(token, periodId);
  var employees = _dbReadAll_('Employees');
  var empMap = {};
  for (var i = 0; i < employees.length; i++) empMap[String(employees[i].employee_id)] = employees[i];

  var overtimeRatePerDay = _num_(_settingsGet_('overtime_rate_per_day', '0'), 0);
  var otRows = _dbReadAll_('Overtime');
  var ot = {};
  for (var o = 0; o < otRows.length; o++) {
    if (String(otRows[o].period_id) !== String(periodId)) continue;
    ot[String(otRows[o].employee_id)] = _num_(otRows[o].overtime_days, 0);
  }

  var folder = _getOrCreateFolder_(_settingsGet_('payroll_folder_id', ''), 'HRIS_Payroll');
  var companyName = _settingsGet_('company_name', 'Company');
  var tz = _settingsGet_('timezone', Session.getScriptTimeZone());
  var out = [];

  for (var r = 0; r < rows.length; r++) {
    var p = rows[r];
    var emp = empMap[String(p.employee_id)] || {};

    var basic = _num_(emp.basic_salary, 0);
    var allow = _num_(emp.fixed_allowance, 0);
    var tr = _num_(emp.transport_allowance, 0);
    var pos = _num_(emp.position_allowance, 0);
    var lap = _num_(emp.laptop_allowance, 0);
    var otDays = _num_(ot[String(p.employee_id)], 0);
    var otPay = otDays * overtimeRatePerDay;
    var gross = basic + allow + tr + pos + lap + otPay;

    var t = HtmlService.createTemplateFromFile('Ui_Payslip');
    t.companyName = companyName;
    t.periodId = String(periodId);
    t.employeeName = String(emp.full_name || '');
    t.employeeEmail = String(emp.email || '');
    t.employeeId = String(p.employee_id);
    t.basicSalary = Math.round(basic);
    t.fixedAllowance = Math.round(allow);
    t.transportAllowance = Math.round(tr);
    t.positionAllowance = Math.round(pos);
    t.laptopAllowance = Math.round(lap);
    t.overtimeDays = Math.round(otDays);
    t.overtimePay = Math.round(otPay);
    t.gross = Math.round(gross);
    t.deductionAmount = Math.round(_num_(p.deduction_amount, 0));
    t.bpjsHealthEmployee = Math.round(_num_(p.bpjs_health_employee, 0));
    t.bpjsTkEmployee = Math.round(_num_(p.bpjs_tk_employee, 0));
    t.pph21 = Math.round(_num_(p.pph21_amount, 0));
    t.netPay = Math.round(_num_(p.net_pay, 0));
    t.generatedAt = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');

    var html = t.evaluate().getContent();
    var pdfBlob = Utilities.newBlob(html, 'text/html').getAs('application/pdf');
    var safeName = String(emp.full_name || emp.email || p.employee_id).replace(/[^a-zA-Z0-9._-]/g, '_');
    var fileName = 'slip_' + String(periodId) + '_' + safeName + '.pdf';
    pdfBlob.setName(fileName);
    var file = folder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    out.push({ employee_id: String(p.employee_id), fileId: file.getId(), name: fileName, url: file.getUrl() });
  }

  _audit_('GENERATE_PAYSLIPS', 'Drive', String(periodId), JSON.stringify({ count: out.length }));
  return out;
}
