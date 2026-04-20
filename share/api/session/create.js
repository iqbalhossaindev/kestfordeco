const store = require('../_lib/store');
const {
  RATE_WINDOWS,
  createCode,
  createToken,
  fileSummary,
  getClientIp,
  getIceServers,
  getNetworkHash,
  json,
  methodNotAllowed,
  nowIso,
  readJson,
  sanitizeDisplayName,
  sanitizeFiles,
  sendRateLimited
} = require('../_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const rate = await store.rateLimit(`create:${getClientIp(req)}`, RATE_WINDOWS.create.limit, RATE_WINDOWS.create.windowSeconds);
    if (!rate.allowed) return sendRateLimited(res, { resetSeconds: rate.resetSeconds });

    const body = await readJson(req);
    const files = sanitizeFiles(body.files);
    const senderName = sanitizeDisplayName(body.displayName, 'Sender device');
    const networkHash = getNetworkHash(req);

    let code = '';
    for (let i = 0; i < 20; i += 1) {
      const candidate = createCode();
      const existing = await store.getSession(candidate);
      if (!existing) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      return json(res, 500, { ok: false, error: 'could_not_create_session' });
    }

    const createdAt = nowIso();
    const session = {
      code,
      senderToken: createToken(),
      receiverToken: null,
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      status: 'waiting',
      files,
      summary: fileSummary(files),
      senderName,
      receiverName: '',
      networkHash,
      nearbyEnabled: body.announceNearby !== false,
      iceServers: getIceServers(),
      senderLastSeenAt: createdAt,
      receiverLastSeenAt: null,
      transferStartedAt: null,
      transferCompletedAt: null,
      lastSignalAt: null
    };

    await store.createSession(session);
    if (session.nearbyEnabled) {
      await store.announceNearby(networkHash, {
        code: session.code,
        displayName: session.senderName,
        seenAt: createdAt,
        expiresAt: session.expiresAt
      });
    }

    return json(res, 200, {
      ok: true,
      session: {
        code: session.code,
        senderToken: session.senderToken,
        expiresAt: session.expiresAt,
        senderName: session.senderName,
        summary: session.summary,
        files: session.files,
        nearbyEnabled: session.nearbyEnabled,
        iceServers: session.iceServers
      },
      storageMode: store.mode()
    });
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'bad_request' });
  }
};
