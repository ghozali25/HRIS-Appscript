function setupInit(spreadsheetId) {
  if (spreadsheetId) {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', String(spreadsheetId));
  }
  var ss = _dbSs_();

  _dbEnsureSheet_('Settings', ['key', 'value']);
  _dbEnsureSheet_('WorkSchedule', ['day_of_week', 'start_time', 'end_time', 'enabled']);
  _dbEnsureSheet_('Locations', ['location_id', 'name', 'lat', 'lng', 'radius_m', 'active']);
  _dbEnsureSheet_('Employees', ['employee_id', 'full_name', 'email', 'ptkp_status', 'bpjs_health_member', 'bpjs_health_number', 'bpjs_tk_member', 'bpjs_tk_number', 'basic_salary', 'fixed_allowance', 'transport_allowance', 'position_allowance', 'laptop_allowance', 'active']);
  _dbEnsureSheet_('Users', ['email', 'role', 'username', 'password_hash', 'password_salt', 'force_reset', 'active', 'created_at']);
  _dbEnsureSheet_('Attendance', ['attendance_id', 'employee_id', 'date', 'clock_in_ts', 'clock_in_lat', 'clock_in_lng', 'clock_in_accuracy_m', 'clock_in_location_id', 'clock_out_ts', 'clock_out_lat', 'clock_out_lng', 'clock_out_accuracy_m', 'clock_out_location_id', 'status', 'suspicious_flag', 'suspicious_reason', 'admin_review_status', 'device_fingerprint', 'ip_hash', 'selfie_in_file_id', 'selfie_out_file_id', 'created_at']);
  _dbEnsureSheet_('AuditLog', ['ts', 'actor_email', 'action', 'entity', 'entity_id', 'detail_json']);
  _dbEnsureSheet_('PayrollPeriods', ['period_id', 'start_date', 'end_date', 'closed']);
  _dbEnsureSheet_('Payroll', ['period_id', 'employee_id', 'days_present', 'late_count', 'early_out_count', 'deduction_amount', 'bpjs_health_employee', 'bpjs_health_company', 'bpjs_tk_employee', 'bpjs_tk_company', 'pph21_amount', 'net_pay', 'created_at']);
  _dbEnsureSheet_('Overtime', ['period_id', 'employee_id', 'overtime_days', 'updated_at']);
  _dbEnsureSheet_('Assets', ['asset_id', 'asset_code', 'name', 'category', 'serial_number', 'location', 'condition', 'qr_payload', 'active', 'created_at']);
  _dbEnsureSheet_('AssetAssignments', ['assignment_id', 'asset_id', 'employee_id', 'handover_date', 'return_date', 'notes', 'created_at']);

  _settingsUpsert_('company_name', 'Company');
  _settingsUpsert_('timezone', 'Asia/Jakarta');
  _settingsUpsert_('late_tolerance_minutes', '10');
  _settingsUpsert_('early_out_tolerance_minutes', '0');
  _settingsUpsert_('min_gps_accuracy_m', '50');
  _settingsUpsert_('max_speed_mps', '30');
  _settingsUpsert_('default_radius_m', '100');

  _settingsUpsert_('require_selfie', 'N');
  _settingsUpsert_('selfie_folder_id', '');
  _settingsUpsert_('payroll_folder_id', '');

  _settingsUpsert_('overtime_rate_per_day', '0');

  _settingsUpsert_('enable_absent_deduction', 'N');
  _settingsUpsert_('deduction_per_absent_day', '0');
  _settingsUpsert_('biaya_jabatan_rate', '0.05');
  _settingsUpsert_('biaya_jabatan_cap_month', '500000');

  _settingsUpsert_('bpjs_health_emp_rate', '0.01');
  _settingsUpsert_('bpjs_health_company_rate', '0.04');
  _settingsUpsert_('bpjs_health_ceiling', '12000000');

  _settingsUpsert_('bpjs_jht_emp_rate', '0.02');
  _settingsUpsert_('bpjs_jht_company_rate', '0.037');
  _settingsUpsert_('bpjs_jp_emp_rate', '0.01');
  _settingsUpsert_('bpjs_jp_company_rate', '0.02');
  _settingsUpsert_('bpjs_jp_ceiling', '10042300');
  _settingsUpsert_('bpjs_jkk_company_rate', '0.0024');
  _settingsUpsert_('bpjs_jkm_company_rate', '0.003');

  var me = Session.getActiveUser().getEmail();
  if (me) {
    var existing = _userGetByEmail_(me);
    if (!existing) {
      _userUpsert_({
        email: me,
        role: 'ADMIN',
        username: 'admin',
        password: 'admin123',
        forceReset: 'Y',
        active: 'Y'
      });
    }
  }

  ss.toast('Setup complete');
}
