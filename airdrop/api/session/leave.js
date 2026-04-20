const store = require('../_lib/store');
const {
  ensureRoleToken,
  json,
  methodNotAllowed,
  normalizeCode,
  nowIso,
  readJson,
  validateRole
} = require('../_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const body = await readJson(req);
    const code = normalizeCode(body.code);
    const role = String(body.role || '');
    const token = String(body.token || '');
    if (!code || !validateRole(role) || !token) {
      return json(res, 400, { ok: false, error: 'invalid_body' });
    }

    const session = await store.getSession(code);
    if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
    if (!ensureRoleToken(session, role, token)) {
      return json(res, 403, { ok: false, error: 'forbidden' });
    }

    if (role === 'sender') {
      await store.enqueue(code, 'receiver', {
        id: `sender-left-${Date.now()}`,
        kind: 'session-closed',
        from: 'sender',
        payload: { at: nowIso() },
        createdAt: nowIso()
      }).catch(() => null);
      await store.deleteSession(code);
      return json(res, 200, { ok: true, deleted: true });
    }

    const updated = await store.updateSession(code, (current) => ({
      ...current,
      receiverToken: null,
      receiverName: '',
      receiverLastSeenAt: null,
      status: 'waiting',
      transferStartedAt: null,
      transferCompletedAt: null
    }));

    if (updated.nearbyEnabled) {
      await store.announceNearby(updated.networkHash, {
        code: updated.code,
        displayName: updated.senderName,
        seenAt: nowIso(),
        expiresAt: updated.expiresAt
      });
    }
    await store.enqueue(code, 'sender', {
      id: `receiver-left-${Date.now()}`,
      kind: 'receiver-left',
      from: 'receiver',
      payload: { at: nowIso() },
      createdAt: nowIso()
    });

    return json(res, 200, { ok: true, deleted: false });
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'bad_request' });
  }
};
