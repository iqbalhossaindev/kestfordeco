const store = require('../_lib/store');
const {
  RATE_WINDOWS,
  createToken,
  ensureRoleToken,
  getClientIp,
  json,
  methodNotAllowed,
  normalizeCode,
  nowIso,
  readJson,
  sanitizeDisplayName,
  sendRateLimited
} = require('../_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const rate = await store.rateLimit(`join:${getClientIp(req)}`, RATE_WINDOWS.join.limit, RATE_WINDOWS.join.windowSeconds);
    if (!rate.allowed) return sendRateLimited(res, { resetSeconds: rate.resetSeconds });

    const body = await readJson(req);
    const code = normalizeCode(body.code);
    const receiverName = sanitizeDisplayName(body.displayName, 'Receiver device');
    if (!code) return json(res, 400, { ok: false, error: 'invalid_code' });

    const session = await store.getSession(code);
    if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });

    if (session.receiverToken && !ensureRoleToken(session, 'receiver', body.token || '')) {
      return json(res, 409, { ok: false, error: 'session_in_use' });
    }

    const joinedAt = nowIso();
    const receiverToken = session.receiverToken || createToken();
    const updated = await store.updateSession(code, (current) => ({
      ...current,
      receiverToken,
      receiverName,
      receiverLastSeenAt: joinedAt,
      status: 'paired',
      updatedAt: joinedAt
    }));

    await store.removeNearby(updated.networkHash, updated.code);
    await store.enqueue(code, 'sender', {
      id: `joined-${Date.now()}`,
      kind: 'receiver-joined',
      from: 'receiver',
      payload: { at: joinedAt, receiverName },
      createdAt: joinedAt
    });

    return json(res, 200, {
      ok: true,
      session: {
        code: updated.code,
        receiverToken,
        expiresAt: updated.expiresAt,
        senderName: updated.senderName,
        receiverName: updated.receiverName,
        summary: updated.summary,
        files: updated.files,
        iceServers: updated.iceServers,
        status: updated.status
      }
    });
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'bad_request' });
  }
};
