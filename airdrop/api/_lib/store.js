const {
  NEARBY_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  isExpired,
  nowIso
} = require('./utils');

const REST_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';

const globalState = globalThis.__KFORD_AIRDROP_V3_STORE__ || {
  sessions: new Map(),
  queues: new Map(),
  nearby: new Map(),
  rates: new Map()
};
globalThis.__KFORD_AIRDROP_V3_STORE__ = globalState;

function redisEnabled() {
  return Boolean(REST_URL && REST_TOKEN);
}

function mode() {
  return redisEnabled() ? 'upstash-redis' : 'memory';
}

function baseUrl() {
  return REST_URL.replace(/\/$/, '');
}

async function upstashCommand(command) {
  const response = await fetch(baseUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const json = await response.json();
  if (!response.ok || json.error) {
    throw new Error(json.error || `upstash_${response.status}`);
  }
  return json.result;
}

async function upstashPipeline(commands) {
  const response = await fetch(`${baseUrl()}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`upstash_${response.status}`);
  }
  return json.map((item) => {
    if (item.error) throw new Error(item.error);
    return item.result;
  });
}

function sessionKey(code) {
  return `airdrop:v3:session:${code}`;
}

function queueKey(code, role) {
  return `airdrop:v3:queue:${code}:${role}`;
}

function nearbyKey(hash) {
  return `airdrop:v3:nearby:${hash}`;
}

function rateKey(key) {
  return `airdrop:v3:rate:${key}`;
}

async function getJsonValue(key) {
  if (redisEnabled()) {
    const result = await upstashCommand(['GET', key]);
    if (!result) return null;
    try {
      return JSON.parse(result);
    } catch (error) {
      return null;
    }
  }
  if (globalState.sessions.has(key)) return structuredClone(globalState.sessions.get(key));
  if (globalState.nearby.has(key)) return structuredClone(globalState.nearby.get(key));
  return null;
}

async function setJsonValue(key, value, ttlSeconds) {
  if (redisEnabled()) {
    await upstashCommand(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]);
    return value;
  }
  if (key.includes(':session:')) globalState.sessions.set(key, structuredClone(value));
  else globalState.nearby.set(key, structuredClone(value));
  return value;
}

async function deleteKey(key) {
  if (redisEnabled()) {
    await upstashCommand(['DEL', key]);
    return;
  }
  globalState.sessions.delete(key);
  globalState.nearby.delete(key);
  globalState.queues.delete(key);
  globalState.rates.delete(key);
}

function memoryQueue(key) {
  if (!globalState.queues.has(key)) globalState.queues.set(key, []);
  return globalState.queues.get(key);
}

function clone(value) {
  return value ? structuredClone(value) : value;
}

async function getSession(code) {
  const key = sessionKey(code);
  const session = await getJsonValue(key);
  if (!session) return null;
  if (isExpired(session.expiresAt)) {
    await deleteSession(code);
    return null;
  }
  return session;
}

async function setSession(code, session) {
  await setJsonValue(sessionKey(code), session, SESSION_TTL_SECONDS);
  return session;
}

async function createSession(session) {
  await setSession(session.code, session);
  return session;
}

async function updateSession(code, updater) {
  const current = await getSession(code);
  if (!current) return null;
  const next = updater(clone(current));
  if (!next) return null;
  next.updatedAt = nowIso();
  if (!next.expiresAt || isExpired(next.expiresAt)) {
    next.expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  }
  await setSession(code, next);
  return next;
}

async function touchSession(code) {
  if (redisEnabled()) {
    await upstashPipeline([
      ['EXPIRE', sessionKey(code), SESSION_TTL_SECONDS],
      ['EXPIRE', queueKey(code, 'sender'), SESSION_TTL_SECONDS],
      ['EXPIRE', queueKey(code, 'receiver'), SESSION_TTL_SECONDS]
    ]);
    return;
  }
}

async function deleteSession(code) {
  const key = sessionKey(code);
  const current = await getJsonValue(key).catch(() => null);
  if (redisEnabled()) {
    await upstashPipeline([
      ['DEL', key],
      ['DEL', queueKey(code, 'sender')],
      ['DEL', queueKey(code, 'receiver')]
    ]);
  } else {
    globalState.sessions.delete(key);
    globalState.queues.delete(queueKey(code, 'sender'));
    globalState.queues.delete(queueKey(code, 'receiver'));
  }
  if (current && current.networkHash) {
    await removeNearby(current.networkHash, code);
  }
}

async function enqueue(code, role, message) {
  const key = queueKey(code, role);
  if (redisEnabled()) {
    await upstashPipeline([
      ['RPUSH', key, JSON.stringify(message)],
      ['EXPIRE', key, SESSION_TTL_SECONDS]
    ]);
    return;
  }
  const queue = memoryQueue(key);
  queue.push(clone(message));
}

async function drainQueue(code, role, limit = 100) {
  const key = queueKey(code, role);
  if (redisEnabled()) {
    const [items] = await upstashPipeline([
      ['LRANGE', key, 0, limit - 1],
      ['LTRIM', key, limit, -1]
    ]);
    return (items || []).map((item) => JSON.parse(item));
  }
  const queue = memoryQueue(key);
  return queue.splice(0, limit).map((item) => clone(item));
}

function pruneNearbyItems(items) {
  const cutoff = Date.now() - NEARBY_TTL_SECONDS * 1000;
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item || !item.code || !item.seenAt) return false;
    const valid = Date.parse(item.seenAt) >= cutoff;
    const fresh = !item.expiresAt || Date.parse(item.expiresAt) >= Date.now();
    const unique = !seen.has(item.code);
    seen.add(item.code);
    return valid && fresh && unique;
  });
}

async function getNearby(hash) {
  const key = nearbyKey(hash);
  const items = await getJsonValue(key);
  const pruned = pruneNearbyItems(items);
  if ((items || []).length !== pruned.length) {
    if (pruned.length) await setJsonValue(key, pruned, NEARBY_TTL_SECONDS);
    else await deleteKey(key);
  }
  return pruned;
}

async function announceNearby(hash, entry) {
  const key = nearbyKey(hash);
  const items = await getNearby(hash);
  const filtered = items.filter((item) => item.code !== entry.code);
  filtered.unshift(entry);
  await setJsonValue(key, filtered.slice(0, 20), NEARBY_TTL_SECONDS);
  return filtered.slice(0, 20);
}

async function removeNearby(hash, code) {
  const key = nearbyKey(hash);
  const items = await getNearby(hash);
  const filtered = items.filter((item) => item.code !== code);
  if (!filtered.length) {
    await deleteKey(key);
    return [];
  }
  await setJsonValue(key, filtered, NEARBY_TTL_SECONDS);
  return filtered;
}

async function rateLimit(id, limit, windowSeconds) {
  const key = rateKey(id);
  if (redisEnabled()) {
    const [count, ttl] = await upstashPipeline([
      ['INCR', key],
      ['TTL', key]
    ]);
    if (Number(ttl) < 0) {
      await upstashCommand(['EXPIRE', key, windowSeconds]);
    }
    const current = Number(count);
    return {
      allowed: current <= limit,
      count: current,
      remaining: Math.max(0, limit - current),
      resetSeconds: Number(ttl) > 0 ? Number(ttl) : windowSeconds
    };
  }

  const existing = globalState.rates.get(key);
  const now = Date.now();
  if (!existing || existing.expiresAt <= now) {
    const next = { count: 1, expiresAt: now + windowSeconds * 1000 };
    globalState.rates.set(key, next);
    return { allowed: true, count: 1, remaining: limit - 1, resetSeconds: windowSeconds };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    count: existing.count,
    remaining: Math.max(0, limit - existing.count),
    resetSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000))
  };
}

module.exports = {
  announceNearby,
  createSession,
  deleteSession,
  drainQueue,
  enqueue,
  getNearby,
  getSession,
  mode,
  rateLimit,
  removeNearby,
  setSession,
  touchSession,
  updateSession
};
