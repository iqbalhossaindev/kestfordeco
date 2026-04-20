import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { del, get, list, put } from '@vercel/blob';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localRoot = path.join(__dirname, '..', '..', '.local-store');
const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const hosted = Boolean(process.env.VERCEL);

function storageMode() {
  if (blobConfigured) return 'vercel-blob-private';
  if (hosted) return 'misconfigured';
  return 'local-files';
}

function ensureConfigured() {
  if (storageMode() === 'misconfigured') {
    throw new Error('storage_not_configured');
  }
}

async function ensureLocalDir(filePath) {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function localPath(key) {
  return path.join(localRoot, key);
}

function normalizeKey(key) {
  return String(key || '').replace(/^\/+/, '');
}

function streamFromBlobResult(result) {
  return result?.stream || result?.body || null;
}

function isMissingError(error) {
  return /not found|does not exist|404/i.test(String(error?.message || error));
}

export { storageMode, blobConfigured };

export async function writeJson(key, value) {
  ensureConfigured();
  key = normalizeKey(key);
  const body = JSON.stringify(value, null, 2);
  if (blobConfigured) {
    await put(key, body, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60
    });
    return;
  }
  const filePath = localPath(key);
  await ensureLocalDir(filePath);
  await writeFile(filePath, body, 'utf8');
}

export async function readJsonFile(key) {
  ensureConfigured();
  key = normalizeKey(key);
  if (blobConfigured) {
    try {
      const result = await get(key, { access: 'private' });
      if (!result) return null;
      const text = await new Response(streamFromBlobResult(result)).text();
      return JSON.parse(text);
    } catch (error) {
      if (isMissingError(error)) return null;
      throw error;
    }
  }
  const filePath = localPath(key);
  if (!existsSync(filePath)) return null;
  const text = await readFile(filePath, 'utf8');
  return JSON.parse(text);
}

export async function writeBinary(key, file, { contentType = 'application/octet-stream' } = {}) {
  ensureConfigured();
  key = normalizeKey(key);
  if (blobConfigured) {
    await put(key, file, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      cacheControlMaxAge: 60
    });
    return;
  }
  const filePath = localPath(key);
  await ensureLocalDir(filePath);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);
}

export async function readBinary(key) {
  ensureConfigured();
  key = normalizeKey(key);
  if (blobConfigured) {
    try {
      const result = await get(key, { access: 'private' });
      if (!result) return null;
      return {
        stream: streamFromBlobResult(result),
        contentType: result.contentType || 'application/octet-stream',
        size: result.size || null
      };
    } catch (error) {
      if (isMissingError(error)) return null;
      throw error;
    }
  }
  const filePath = localPath(key);
  if (!existsSync(filePath)) return null;
  const info = await stat(filePath);
  const stream = Readable.toWeb(createReadStream(filePath));
  return {
    stream,
    contentType: 'application/octet-stream',
    size: info.size
  };
}

export async function deleteKeys(keys) {
  ensureConfigured();
  const clean = [...new Set(keys.map(normalizeKey).filter(Boolean))];
  if (!clean.length) return;
  if (blobConfigured) {
    await del(clean);
    return;
  }
  await Promise.all(clean.map(async (key) => {
    const filePath = localPath(key);
    if (existsSync(filePath)) {
      await rm(filePath, { force: true, recursive: false });
    }
  }));
}

export async function listKeys(prefix) {
  ensureConfigured();
  prefix = normalizeKey(prefix);
  if (blobConfigured) {
    const result = await list({ prefix, limit: 1000 });
    return result.blobs.map((item) => item.pathname);
  }
  const base = localPath(prefix);
  if (!existsSync(base)) return [];
  const out = [];
  async function walk(current, relative) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      const nextRelative = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath, nextRelative);
      } else {
        out.push(path.posix.join(prefix, nextRelative).replaceAll('\\', '/'));
      }
    }
  }
  await walk(base, '');
  return out;
}
