const store = require('../_lib/store');
const {
  RATE_WINDOWS,
  buildSignalMessage,
  ensureRoleToken,
  getClientIp,
  json,
  methodNotAllowed,
  normalizeCode,
  nowIso,
  oppositeRole,
  readJson,
  sendRateLimited,
  validateRole
} = require('../_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const rate = await store.rateLimit(`signal:${getClientIp(req)}`, RATE_WINDOWS.signal.limit, RATE_WINDOWS.signal.windowSeconds);
    if (!rate.allowed) return sendRateLimited(res, { resetSeconds: rate.resetSeconds });

    const body = await readJson(req);
    const code = normalizeCode(body.code);
    const role = String(body.role || '');
    const token = String(body.token || '');
    const kind = String(body.kind || '');
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

    if (!code || !validateRole(role) || !token || !kind) {
      return json(res, 400, { ok: false, error: 'invalid_body' });
    }

    if (JSON.stringify(payload).length > 400000) {
      return json(res, 413, { ok: false, error: 'payload_too_large' });
    }

    const session = await store.getSession(code);
    if (!session) return json(res, 404, { ok: false, error: 'session_not_found' });
    if (!ensureRoleToken(session, role, token)) {
      return json(res, 403, { ok: false, error: 'forbidden' });
    }

    const message = buildSignalMessage({ kind, payload, from: role });
    await store.enqueue(code, oppositeRole(role), message);
    await store.touchSession(code);

    const now = nowIso();
    await store.updateSession(code, (current) => ({
      ...current,
      status: kind === 'channel-open' ? 'connected' : kind === 'transfer-complete' ? 'complete' : 'signaling',
      lastSignalAt: now,
      transferStartedAt: kind === 'transfer-start' && !current.transferStartedAt ? now : current.transferStartedAt,
      transferCompletedAt: kind === 'transfer-complete' ? now : current.transferCompletedAt
    }));

    return json(res, 200, { ok: true, queued: true, messageId: message.id });
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'bad_request' });
  }
};
