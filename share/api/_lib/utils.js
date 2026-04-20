const crypto = require('crypto');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_SECONDS = 60 * 10;
const MAX_FILES = 50;
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024 * 2;
const POLL_LIMIT = 150;
const NEARBY_TTL_SECONDS = 90;
const RATE_WINDOWS = {
  create: { limit: 20, windowSeconds: 60 * 10 },
  join: { limit: 50, windowSeconds: 60 * 10 },
  signal: { limit: 1000, windowSeconds: 60 * 10 },
  nearby: { limit: 300, windowSeconds: 60 * 10 }
};

function nowIso() {
  return new Date().toISOString();
}

function expiresAtIso(secondsFromNow = SESSION_TTL_SECONDS) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

function uid(prefix = 'id') {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${crypto.randomBytes(16).toString('hex')}`;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  return json(res, 405, { ok: false, error: 'method_not_allowed' });
}

function queryFromReq(req) {
  const base = `http://${req.headers.host || 'localhost'}`;
  return new URL(req.url || '/', base).searchParams;
}

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim() || '{}';
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function createCode() {
  let out = 'KF';
  for (let i = 0; i < 4; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normalizeCode(code) {
  return String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
}

function sanitizeDisplayName(value, fallback = 'Device') {
  const clean = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return clean || fallback;
}

function sanitizeFiles(files) {
  if (!Array.isArray(files)) return [];
  return files.slice(0, MAX_FILES).map((file, index) => ({
    id: typeof file.id === 'string' && file.id ? file.id.slice(0, 80) : `file-${index + 1}`,
    name: typeof file.name === 'string' && file.name ? file.name.slice(0, 255) : `file-${index + 1}`,
    size: Number.isFinite(file.size) ? Math.max(0, Math.min(file.size, MAX_FILE_SIZE_BYTES)) : 0,
    type: typeof file.type === 'string' && file.type ? file.type.slice(0, 120) : 'application/octet-stream',
    lastModified: Number.isFinite(file.lastModified) ? file.lastModified : Date.now()
  }));
}

function validateRole(role) {
  return role === 'sender' || role === 'receiver';
}

function oppositeRole(role) {
  return role === 'sender' ? 'receiver' : 'sender';
}

function buildSignalMessage({ kind, payload, from }) {
  return {
    id: uid('sig'),
    kind: String(kind || '').slice(0, 50),
    from,
    payload: payload && typeof payload === 'object' ? payload : {},
    createdAt: nowIso()
  };
}

function getClientIp(req) {
  const raw = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['cf-connecting-ip'] || '';
  const first = Array.isArray(raw) ? raw[0] : String(raw).split(',')[0].trim();
  if (first) return first;
  return '0.0.0.0';
}

function getNetworkHash(req) {
  const ip = getClientIp(req);
  let normalized = ip;
  if (ip.includes('.')) {
    const parts = ip.split('.').slice(0, 3).map((part) => part || '0');
    normalized = `${parts.join('.')}.0/24`;
  } else if (ip.includes(':')) {
    normalized = `${ip.split(':').slice(0, 4).join(':')}::/64`;
  }
  return crypto.createHash('sha256').update(`nearby:${normalized}`).digest('hex').slice(0, 20);
}

function getIceServers() {
  const servers = [{ urls: ['stun:stun.l.google.com:19302'] }];
  const turnUrl = process.env.TURN_URL || process.env.KF_TURN_URL || '';
  const turnUsername = process.env.TURN_USERNAME || process.env.KF_TURN_USERNAME || '';
  const turnCredential = process.env.TURN_CREDENTIAL || process.env.KF_TURN_CREDENTIAL || '';
  if (turnUrl && turnUsername && turnCredential) {
    servers.push({
      urls: [turnUrl],
      username: turnUsername,
      credential: turnCredential
    });
  }
  return servers;
}

function ensureRoleToken(session, role, token) {
  const expected = role === 'sender' ? session.senderToken : session.receiverToken;
  return Boolean(expected && token && expected === token);
}

function isExpired(iso) {
  return !iso || Date.parse(iso) <= Date.now();
}

function fileSummary(files) {
  const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
  return { count: files.length, totalBytes };
}

function sendRateLimited(res, details) {
  return json(res, 429, { ok: false, error: 'rate_limited', ...details });
}

module.exports = {
  CODE_CHARS,
  MAX_FILES,
  MAX_FILE_SIZE_BYTES,
  NEARBY_TTL_SECONDS,
  POLL_LIMIT,
  RATE_WINDOWS,
  SESSION_TTL_SECONDS,
  buildSignalMessage,
  createCode,
  createToken,
  ensureRoleToken,
  expiresAtIso,
  fileSummary,
  getClientIp,
  getIceServers,
  getNetworkHash,
  isExpired,
  json,
  methodNotAllowed,
  normalizeCode,
  nowIso,
  oppositeRole,
  queryFromReq,
  readJson,
  sanitizeDisplayName,
  sanitizeFiles,
  sendRateLimited,
  uid,
  validateRole
};
