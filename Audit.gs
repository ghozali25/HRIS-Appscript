function _audit_(action, entity, entityId, detailJson) {
  var email = Session.getActiveUser().getEmail();
  _dbAppend_('AuditLog', {
    ts: _dbNow_(),
    actor_email: email || '',
    action: String(action || ''),
    entity: String(entity || ''),
    entity_id: String(entityId || ''),
    detail_json: detailJson || ''
  });
}
