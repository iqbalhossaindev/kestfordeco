const store = require('../_lib/store');
const {
  POLL_LIMIT,
  ensureRoleToken,
  json,
  methodNotAllowed,
  normalizeCode,
  nowIso,
  queryFromReq,
  validateRole
} = require('../_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const query = queryFromReq(req);
  const code = normalizeCode(query.get('code'));
  const role = String(query.get('role') || '');
  const token = String(query.get('token') || '');

  if (!code || !validateRole(role) || !token) {
    return json(res, 400, { ok: false, error: 'invalid_query' });
  }

  const session = await store.getSession(code);
  if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
  if (!ensureRoleToken(session, role, token)) {
    return json(res, 403, { ok: false, error: 'forbidden' });
  }

  const seenAt = nowIso();
  const updated = await store.updateSession(code, (current) => ({
    ...current,
    senderLastSeenAt: role === 'sender' ? seenAt : current.senderLastSeenAt,
    receiverLastSeenAt: role === 'receiver' ? seenAt : current.receiverLastSeenAt
  }));

  if (updated.nearbyEnabled && updated.status === 'waiting' && role === 'sender') {
    await store.announceNearby(updated.networkHash, {
      code: updated.code,
      displayName: updated.senderName,
      seenAt,
      expiresAt: updated.expiresAt
    });
  }

  await store.touchSession(code);
  const messages = await store.drainQueue(code, role, POLL_LIMIT);

  return json(res, 200, {
    ok: true,
    session: {
      code: updated.code,
      status: updated.status,
      expiresAt: updated.expiresAt,
      senderName: updated.senderName,
      receiverName: updated.receiverName,
      summary: updated.summary,
      files: updated.files,
      joined: Boolean(updated.receiverToken),
      lastSignalAt: updated.lastSignalAt,
      transferStartedAt: updated.transferStartedAt,
      transferCompletedAt: updated.transferCompletedAt
    },
    messages,
    storageMode: store.mode()
  });
};
