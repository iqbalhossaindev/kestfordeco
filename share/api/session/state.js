const store = require('../_lib/store');
const {
  ensureRoleToken,
  json,
  methodNotAllowed,
  normalizeCode,
  queryFromReq,
  validateRole
} = require('../_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const query = queryFromReq(req);
  const code = normalizeCode(query.get('code'));
  const role = String(query.get('role') || '');
  const token = String(query.get('token') || '');
  if (!code) return json(res, 400, { ok: false, error: 'invalid_code' });

  const session = await store.getSession(code);
  if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });

  let authorized = false;
  if (role && token && validateRole(role)) {
    authorized = ensureRoleToken(session, role, token);
  }

  return json(res, 200, {
    ok: true,
    session: {
      code: session.code,
      status: session.status,
      expiresAt: session.expiresAt,
      senderName: session.senderName,
      receiverName: authorized ? session.receiverName : '',
      summary: session.summary,
      files: session.files,
      joined: Boolean(session.receiverToken),
      nearbyEnabled: session.nearbyEnabled,
      transferStartedAt: authorized ? session.transferStartedAt : null,
      transferCompletedAt: authorized ? session.transferCompletedAt : null
    }
  });
};
