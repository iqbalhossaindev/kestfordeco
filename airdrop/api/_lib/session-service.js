import crypto from 'node:crypto';
import { CODE_CHARS, MAX_FILE_BYTES, SESSION_TTL_MS } from './constants.js';
import { deleteKeys, listKeys, readJsonFile, readBinary, storageMode, writeBinary, writeJson } from './storage.js';

function codePath(code) {
  return `sessions/${code}.json`;
}

function filesPrefix(code) {
  return `files/${code}/`;
}

function normalizeCode(code) {
  return String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
}

function makeCode() {
  let value = 'KF';
  for (let i = 0; i < 4; i += 1) {
    value += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function expiresAtIso() {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120) || 'file';
}

function ensureActive(session) {
  if (!session) throw new Error('session_not_found');
  if (Date.parse(session.expiresAt) <= Date.now()) throw new Error('session_expired');
  return session;
}

export function publicSession(session, role = 'sender') {
  return {
    code: session.code,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    status: session.status,
    completedAt: session.completedAt || null,
    receiverConnectedAt: session.receiverConnectedAt || null,
    files: session.files.map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: file.uploadedAt
    })),
    role,
    storageMode: storageMode()
  };
}

export async function getSession(code) {
  code = normalizeCode(code);
  if (!code) return null;
  const session = await readJsonFile(codePath(code));
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    await cleanupSession(code);
    throw new Error('session_expired');
  }
  return session;
}

export async function createSession() {
  let code = '';
  for (let i = 0; i < 12; i += 1) {
    const candidate = makeCode();
    const existing = await readJsonFile(codePath(candidate));
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error('could_not_create_session');

  const session = {
    code,
    senderToken: crypto.randomUUID(),
    createdAt: nowIso(),
    expiresAt: expiresAtIso(),
    receiverConnectedAt: null,
    completedAt: null,
    status: 'created',
    files: []
  };
  await writeJson(codePath(code), session);
  return session;
}

export async function assertSender(code, token) {
  const session = ensureActive(await getSession(code));
  if (!token || token !== session.senderToken) {
    throw new Error('forbidden');
  }
  return session;
}

export async function connectReceiver(code) {
  const session = ensureActive(await getSession(code));
  if (!session.receiverConnectedAt) {
    session.receiverConnectedAt = nowIso();
  }
  if (session.files.length) session.status = 'ready';
  else session.status = 'waiting_for_upload';
  await writeJson(codePath(session.code), session);
  return session;
}

export async function getStatus(code, role, token = '') {
  let session;
  if (role === 'sender') session = await assertSender(code, token);
  else session = ensureActive(await getSession(code));
  return session;
}

export async function attachUploadedFile(code, token, file) {
  const session = await assertSender(code, token);
  if (!file) throw new Error('file_required');
  if (file.size > MAX_FILE_BYTES) throw new Error('file_too_large');

  const safeName = sanitizeFileName(file.name);
  const fileId = crypto.randomUUID();
  const key = `${filesPrefix(session.code)}${fileId}-${safeName}`;
  await writeBinary(key, file, { contentType: file.type || 'application/octet-stream' });

  const record = {
    id: fileId,
    key,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    uploadedAt: nowIso()
  };
  session.files.push(record);
  session.status = session.receiverConnectedAt ? 'ready' : 'waiting_for_receiver';
  await writeJson(codePath(session.code), session);
  return { session, file: record };
}

export async function readSessionFile(code, fileId) {
  const session = ensureActive(await getSession(code));
  const file = session.files.find((entry) => entry.id === fileId);
  if (!file) throw new Error('file_not_found');
  const binary = await readBinary(file.key);
  if (!binary) throw new Error('file_not_found');
  return { session, file, binary };
}

export async function markComplete(code) {
  const session = ensureActive(await getSession(code));
  session.completedAt = nowIso();
  session.status = 'completed';
  await writeJson(codePath(session.code), session);
  return session;
}

export async function cleanupSession(code) {
  code = normalizeCode(code);
  if (!code) return;
  const fileKeys = await listKeys(filesPrefix(code));
  await deleteKeys([codePath(code), ...fileKeys]);
}
