const store = require('../../_lib/store');
const {
  RATE_WINDOWS,
  getClientIp,
  getNetworkHash,
  json,
  methodNotAllowed,
  sendRateLimited
} = require('../../_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const rate = await store.rateLimit(`nearby-list:${getClientIp(req)}`, RATE_WINDOWS.nearby.limit, RATE_WINDOWS.nearby.windowSeconds);
  if (!rate.allowed) return sendRateLimited(res, { resetSeconds: rate.resetSeconds });

  const hash = getNetworkHash(req);
  const nearby = await store.getNearby(hash);
  const sessions = [];

  for (const item of nearby) {
    const session = await store.getSession(item.code);
    if (!session) continue;
    if (!session.nearbyEnabled || session.status !== 'waiting' || session.receiverToken) continue;
    sessions.push({
      code: session.code,
      displayName: item.displayName || session.senderName,
      summary: session.summary,
      seenAt: item.seenAt,
      expiresAt: session.expiresAt
    });
  }

  return json(res, 200, {
    ok: true,
    nearby: sessions.slice(0, 12)
  });
};
