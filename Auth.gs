function _hashPassword_(password, salt) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ':' + password,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

function _randomSalt_() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
  return Utilities.base64EncodeWebSafe(bytes).substring(0, 22);
}

function _userGetByEmail_(email) {
  if (!email) return null;
  var users = _dbReadAll_('Users');
  email = String(email).toLowerCase().trim();
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].email).toLowerCase().trim() === email) return users[i];
  }
  return null;
}

function _userGetByUsername_(username) {
  if (!username) return null;
  var users = _dbReadAll_('Users');
  username = String(username).toLowerCase().trim();
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].username).toLowerCase().trim() === username) return users[i];
  }
  return null;
}

function _userUpsert_(payload) {
  var email = String(payload.email || '').toLowerCase().trim();
  if (!email) throw new Error('email required');
  var role = String(payload.role || 'EMPLOYEE').toUpperCase();
  var username = String(payload.username || '').trim();
  if (!username) throw new Error('username required');

  var existing = _userGetByEmail_(email);
  var salt = existing ? String(existing.password_salt || '') : '';
  var hash = existing ? String(existing.password_hash || '') : '';

  if (payload.password) {
    salt = _randomSalt_();
    hash = _hashPassword_(String(payload.password), salt);
  } else if (!existing) {
    throw new Error('password required for new user');
  }

  var obj = {
    email: email,
    role: role,
    username: username,
    password_hash: hash,
    password_salt: salt,
    force_reset: payload.forceReset ? String(payload.forceReset) : (existing ? existing.force_reset : ''),
    active: payload.active ? String(payload.active) : (existing ? existing.active : 'Y'),
    created_at: existing ? existing.created_at : _dbNow_()
  };

  if (existing && existing._row) {
    _dbUpdateRow_('Users', existing._row, obj);
  } else {
    _dbAppend_('Users', obj);
  }
}

function apiLogin(username, password, deviceFingerprint) {
  var googleEmail = Session.getActiveUser().getEmail();
  if (!googleEmail) throw new Error('Google session email not available');

  var user = _userGetByUsername_(username);
  if (!user) throw new Error('Invalid credentials');
  if (String(user.active || 'Y') !== 'Y') throw new Error('User inactive');

  var expectedHash = String(user.password_hash || '');
  var salt = String(user.password_salt || '');
  var gotHash = _hashPassword_(String(password), salt);
  if (gotHash !== expectedHash) throw new Error('Invalid credentials');

  if (String(user.email || '').toLowerCase().trim() !== String(googleEmail).toLowerCase().trim()) {
    throw new Error('Email mismatch');
  }

  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  var session = {
    token: token,
    email: String(user.email),
    role: String(user.role),
    dfp: String(deviceFingerprint || ''),
    createdAt: _dbNow_().toISOString()
  };
  cache.put('sess:' + token, JSON.stringify(session), 60 * 60 * 8);

  _audit_('LOGIN', 'Users', user.email, JSON.stringify({ dfp: deviceFingerprint || '' }));
  return { token: token, email: session.email, role: session.role, forceReset: String(user.force_reset || '') };
}

function apiLogout(token) {
  if (!token) return true;
  CacheService.getScriptCache().remove('sess:' + String(token));
  return true;
}

function _requireSession_(token) {
  if (!token) throw new Error('Not authenticated');
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sess:' + String(token));
  if (!raw) throw new Error('Session expired');
  var sess = JSON.parse(raw);
  var googleEmail = Session.getActiveUser().getEmail();
  if (!googleEmail || String(googleEmail).toLowerCase().trim() !== String(sess.email).toLowerCase().trim()) {
    throw new Error('Google session mismatch');
  }
  return sess;
}

function _requireAdmin_(token) {
  var sess = _requireSession_(token);
  if (String(sess.role).toUpperCase() !== 'ADMIN') throw new Error('Admin only');
  return sess;
}
