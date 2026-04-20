const store = require('../../_lib/store');
const {
  RATE_WINDOWS,
  ensureRoleToken,
  getClientIp,
  json,
  methodNotAllowed,
  normalizeCode,
  nowIso,
  readJson,
  sanitizeDisplayName,
  sendRateLimited
} = require('../../_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const rate = await store.rateLimit(`nearby-announce:${getClientIp(req)}`, RATE_WINDOWS.nearby.limit, RATE_WINDOWS.nearby.windowSeconds);
    if (!rate.allowed) return sendRateLimited(res, { resetSeconds: rate.resetSeconds });

    const body = await readJson(req);
    const code = normalizeCode(body.code);
    const token = String(body.token || '');
    if (!code || !token) return json(res, 400, { ok: false, error: 'invalid_body' });

    const session = await store.getSession(code);
    if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
    if (!ensureRoleToken(session, 'sender', token)) {
      return json(res, 403, { ok: false, error: 'forbidden' });
    }

    if (!session.nearbyEnabled || session.status !== 'waiting') {
      return json(res, 200, { ok: true, announced: false });
    }

    const displayName = sanitizeDisplayName(body.displayName, session.senderName);
    await store.announceNearby(session.networkHash, {
      code: session.code,
      displayName,
      seenAt: nowIso(),
      expiresAt: session.expiresAt
    });

    if (displayName !== session.senderName) {
      await store.updateSession(code, (current) => ({ ...current, senderName: displayName }));
    }

    return json(res, 200, { ok: true, announced: true });
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'bad_request' });
  }
};
