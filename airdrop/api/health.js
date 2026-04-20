const store = require('./_lib/store');
const { json, methodNotAllowed } = require('./_lib/utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  return json(res, 200, {
    ok: true,
    service: 'kestford-airdrop',
    version: '3.0.0',
    storageMode: store.mode(),
    now: new Date().toISOString()
  });
};
