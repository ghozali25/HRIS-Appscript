function apiAdminUpsertAsset(token, asset) {
  _requireAdmin_(token);
  var rows = _dbReadAll_('Assets');
  var id = asset.asset_id ? String(asset.asset_id) : _dbUuid_();
  var qrPayload = asset.qr_payload ? String(asset.qr_payload) : ('ASSET:' + id);

  var obj = {
    asset_id: id,
    asset_code: String(asset.asset_code || ''),
    name: String(asset.name || ''),
    category: String(asset.category || ''),
    serial_number: String(asset.serial_number || ''),
    location: String(asset.location || ''),
    condition: String(asset.condition || ''),
    qr_payload: qrPayload,
    active: asset.active ? String(asset.active) : 'Y',
    created_at: _dbNow_()
  };

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].asset_id) === id) {
      obj.created_at = rows[i].created_at;
      _dbUpdateRow_('Assets', rows[i]._row, obj);
      _audit_('UPSERT_ASSET', 'Assets', id, JSON.stringify(obj));
      return obj;
    }
  }

  _dbAppend_('Assets', obj);
  _audit_('UPSERT_ASSET', 'Assets', id, JSON.stringify(obj));
  return obj;
}

function apiAdminListAssets(token) {
  _requireAdmin_(token);
  return _dbReadAll_('Assets');
}

function apiAdminListAssetAssignments(token, assetId) {
  _requireAdmin_(token);
  var rows = _dbReadAll_('AssetAssignments');
  if (!assetId) return rows;
  assetId = String(assetId);
  return rows.filter(function (x) { return String(x.asset_id) === assetId; });
}

function _findActiveAssignmentRow_(assetId) {
  var rows = _dbReadAll_('AssetAssignments');
  assetId = String(assetId);
  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    if (String(r.asset_id) !== assetId) continue;
    var ret = r.return_date;
    if (ret === '' || ret === null) return r;
  }
  return null;
}

function apiAdminAssignAsset(token, assignment) {
  _requireAdmin_(token);
  if (!assignment || !assignment.asset_id) throw new Error('asset_id required');
  if (!assignment.employee_id) throw new Error('employee_id required');
  if (!assignment.handover_date) throw new Error('handover_date required');

  var active = _findActiveAssignmentRow_(assignment.asset_id);
  if (active) {
    throw new Error('Asset already assigned. Return it first. Active assignment_id=' + String(active.assignment_id));
  }

  var id = assignment.assignment_id ? String(assignment.assignment_id) : _dbUuid_();
  var obj = {
    assignment_id: id,
    asset_id: String(assignment.asset_id || ''),
    employee_id: String(assignment.employee_id || ''),
    handover_date: assignment.handover_date || '',
    return_date: assignment.return_date || '',
    notes: String(assignment.notes || ''),
    created_at: _dbNow_()
  };
  _dbAppend_('AssetAssignments', obj);
  _audit_('ASSIGN_ASSET', 'AssetAssignments', id, JSON.stringify(obj));
  return obj;
}

function apiAdminReturnAsset(token, assignmentId, returnDate) {
  _requireAdmin_(token);
  if (!assignmentId) throw new Error('assignmentId required');
  if (!returnDate) throw new Error('returnDate required');
  var rows = _dbReadAll_('AssetAssignments');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].assignment_id) !== String(assignmentId)) continue;
    if (rows[i].return_date) throw new Error('Already returned');
    _dbUpdateRow_('AssetAssignments', rows[i]._row, { return_date: String(returnDate) });
    _audit_('RETURN_ASSET', 'AssetAssignments', assignmentId, JSON.stringify({ return_date: String(returnDate) }));
    return true;
  }
  throw new Error('Assignment not found');
}
