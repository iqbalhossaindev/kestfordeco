const store = require('./_lib/store');
const {
  MAX_FILES,
  MAX_FILE_SIZE_BYTES,
  SESSION_TTL_SECONDS,
  getIceServers,
  json,
  methodNotAllowed
} = require('./_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  return json(res, 200, {
    ok: true,
    storageMode: store.mode(),
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    maxFiles: MAX_FILES,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    nearbyEnabled: true,
    iceServers: getIceServers()
  });
};
