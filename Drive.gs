function _getOrCreateFolder_(folderId, fallbackName) {
  folderId = String(folderId || '').trim();
  if (folderId) {
    return DriveApp.getFolderById(folderId);
  }
  var root = DriveApp.getRootFolder();
  var it = root.getFoldersByName(String(fallbackName));
  if (it.hasNext()) return it.next();
  return root.createFolder(String(fallbackName));
}

function _decodeBase64DataUrl_(dataUrlOrBase64) {
  var s = String(dataUrlOrBase64 || '');
  var idx = s.indexOf('base64,');
  if (idx >= 0) s = s.substring(idx + 7);
  return Utilities.base64Decode(s);
}

function apiUploadSelfie(token, dataUrlOrBase64, mimeType, filename) {
  var sess = _requireSession_(token);
  var requireSelfie = String(_settingsGet_('require_selfie', 'N')) === 'Y';
  if (!dataUrlOrBase64) {
    if (requireSelfie) throw new Error('Selfie required');
    return { fileId: '' };
  }
  var folder = _getOrCreateFolder_(_settingsGet_('selfie_folder_id', ''), 'HRIS_Selfies');
  var bytes = _decodeBase64DataUrl_(dataUrlOrBase64);
  var mt = mimeType ? String(mimeType) : 'image/jpeg';
  var name = filename ? String(filename) : ('selfie_' + String(sess.email).replace(/[^a-zA-Z0-9._-]/g, '_') + '_' + Utilities.formatDate(new Date(), _settingsGet_('timezone', Session.getScriptTimeZone()), 'yyyyMMdd_HHmmss') + '.jpg');
  var blob = Utilities.newBlob(bytes, mt, name);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  _audit_('UPLOAD_SELFIE', 'Drive', file.getId(), JSON.stringify({ name: name, mime: mt }));
  return { fileId: file.getId(), name: name };
}
