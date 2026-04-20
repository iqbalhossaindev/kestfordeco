const PROVIDERS = [
  'https://cobalt-api.meowing.de',
  'https://cobalt-backend.canine.tools',
  'https://capi.3kh0.net',
  'https://blossom.imput.net',
  'https://nachos.imput.net',
  'https://sunny.imput.net',
  'https://kityune.imput.net',
  'https://downloadapi.stuff.solutions',
  'https://api.cobalt.tools'
];

const PATHS = ['', '/api/json'];
const SUCCESS_STATUSES = new Set(['redirect', 'tunnel', 'picker', 'local-processing', 'stream']);

function send(res, statusCode, payload) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(statusCode).json(payload);
}

function tryJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function trimText(text, n) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, n);
}

function decodeBase64UrlSafe(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  try {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '==='.slice((normalized.length + 3) % 4);
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function readInput(req) {
  if (req.method === 'GET') {
    const q = req.query || {};
    return {
      url: q.url || decodeBase64UrlSafe(q.u),
      downloadMode: q.m || q.downloadMode,
      audioFormat: q.a || q.audioFormat,
      videoQuality: q.q || q.videoQuality,
      filenameStyle: q.filenameStyle || 'pretty',
      action: q.action || '',
      filename: q.f || q.filename || ''
    };
  }

  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    const body = req.body;
    return {
      url: body.url || decodeBase64UrlSafe(body.u),
      downloadMode: body.downloadMode || body.m || 'auto',
      audioFormat: body.audioFormat || body.a || 'mp3',
      videoQuality: body.videoQuality || body.q || '720',
      filenameStyle: body.filenameStyle || 'pretty',
      action: body.action || '',
      filename: body.f || body.filename || ''
    };
  }

  const raw = await readRawBody(req);
  if (!raw) return {};

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) return tryJsonParse(raw) || {};

  const params = new URLSearchParams(raw);
  return {
    url: params.get('url') || decodeBase64UrlSafe(params.get('u')),
    downloadMode: params.get('downloadMode') || params.get('m') || 'auto',
    audioFormat: params.get('audioFormat') || params.get('a') || 'mp3',
    videoQuality: params.get('videoQuality') || params.get('q') || '720',
    filenameStyle: params.get('filenameStyle') || 'pretty',
    action: params.get('action') || '',
    filename: params.get('f') || params.get('filename') || ''
  };
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

function normalizeQuality(q) {
  const raw = String(q || '720').toLowerCase().trim();
  return ['max', '1080', '720', '480', '360', '240', '144'].includes(raw) ? raw : '720';
}

function fallbackQualities(start) {
  const order = ['max', '1080', '720', '480', '360', '240', '144'];
  const idx = order.indexOf(start);
  return idx >= 0 ? order.slice(idx) : ['720', '480', '360', '240', '144'];
}

function normalizeMode(m) {
  return String(m || '').toLowerCase() === 'audio' ? 'audio' : 'auto';
}

function isYouTubeUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /(^|\.)youtube\.com$/.test(host) || host === 'youtu.be' || /(^|\.)youtube-nocookie\.com$/.test(host);
  } catch {
    return false;
  }
}

async function callProvider(provider, path, payload) {
  const target = provider + path;
  const t = timeoutSignal(15000);
  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'user-agent': 'KestFordDownloader/1.2'
      },
      body: JSON.stringify(payload),
      signal: t.signal
    });

    const text = await response.text();
    const data = tryJsonParse(text);

    if (!data) {
      return {
        ok: false,
        type: 'invalid',
        attempt: {
          provider,
          path: path || '/',
          http: response.status,
          note: trimText(text, 140) || 'non-json response'
        }
      };
    }

    return {
      ok: true,
      data,
      attempt: {
        provider,
        path: path || '/',
        http: response.status,
        status: data.status || 'unknown',
        code: data && data.error ? String(data.error.code || '') : ''
      }
    };
  } catch (error) {
    return {
      ok: false,
      type: 'network',
      attempt: {
        provider,
        path: path || '/',
        note: error && error.name === 'AbortError' ? 'request timed out' : 'network error'
      }
    };
  } finally {
    t.done();
  }
}

function mergeAttempts(payload, attempts) {
  payload.attemptedProviders = attempts;
  payload.attemptCount = attempts.length;
  return payload;
}

async function runProviders(payload) {
  const attempts = [];
  let lastStructuredError = null;

  for (const provider of PROVIDERS) {
    for (const path of PATHS) {
      const result = await callProvider(provider, path, payload);
      attempts.push(result.attempt);

      if (!result.ok) continue;

      const data = result.data;
      if (SUCCESS_STATUSES.has(data.status)) {
        data.provider = provider;
        data.resolutionPath = path || '/';
        return mergeAttempts(data, attempts);
      }

      if (data.status === 'error') {
        lastStructuredError = {
          status: 'error',
          error: data.error || {
            code: 'provider_error',
            message: 'Provider returned an error.'
          },
          provider,
          lastProvider: provider,
          resolutionPath: path || '/'
        };
      }
    }
  }

  if (lastStructuredError) return mergeAttempts(lastStructuredError, attempts);

  return {
    status: 'error',
    error: {
      code: 'all_providers_failed',
      message: 'All download providers failed for this request.'
    },
    attemptedProviders: attempts,
    attemptCount: attempts.length
  };
}


function looksPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;
  return false;
}

function safeFilename(input, fallbackName) {
  const raw = String(input || '').trim() || String(fallbackName || 'kestford-media').trim();
  let name = raw.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  if (!name) name = 'kestford-media';
  return name.slice(0, 180);
}

function extFromContentType(type) {
  const t = String(type || '').toLowerCase();
  if (t.includes('video/mp4')) return '.mp4';
  if (t.includes('video/webm')) return '.webm';
  if (t.includes('audio/mpeg')) return '.mp3';
  if (t.includes('audio/mp4')) return '.m4a';
  if (t.includes('audio/webm')) return '.webm';
  if (t.includes('image/jpeg')) return '.jpg';
  if (t.includes('image/png')) return '.png';
  return '';
}

async function proxyDownload(req, res, input) {
  const rawUrl = String(input.url || '').trim();
  if (!rawUrl) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Missing file URL.');
    return true;
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Invalid file URL.');
    return true;
  }

  if (!/^https?:$/.test(parsed.protocol) || looksPrivateHost(parsed.hostname)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Blocked file URL.');
    return true;
  }

  const t = timeoutSignal(45000);
  try {
    const upstream = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'KestFordDownloader/1.3',
        'accept': '*/*'
      },
      signal: t.signal
    });

    if (!upstream.ok) {
      res.statusCode = upstream.status || 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Could not fetch download file.');
      return true;
    }

    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    const ext = extFromContentType(type);
    let filename = safeFilename(input.filename || input.f || 'kestford-media', 'kestford-media');
    if (ext && !/\.[a-z0-9]{2,5}$/i.test(filename)) filename += ext;

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename.replace(/"/g, '') + '"');
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    res.end(buf);
    return true;
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Could not stream download.');
    return true;
  } finally {
    t.done();
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!['GET', 'POST'].includes(req.method)) {
    send(res, 405, { status: 'error', error: { code: 'method_not_allowed', message: 'Only GET and POST are allowed.' } });
    return;
  }

  const input = await readInput(req);

  if (req.method === 'GET' && input.action === 'file') {
    await proxyDownload(req, res, input);
    return;
  }

  if (req.method === 'GET' && input.action !== 'download' && !input.url) {
    send(res, 200, {
      ok: true,
      health: 'download-endpoint-ready',
      providerCount: PROVIDERS.length,
      youtubeEnabled: false,
      time: new Date().toISOString()
    });
    return;
  }

  const url = String(input.url || '').trim();
  if (!url) {
    send(res, 200, { status: 'error', error: { code: 'link.empty', message: 'Please paste a media link first.' } });
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    send(res, 200, { status: 'error', error: { code: 'link.invalid', message: 'This URL is not valid.' } });
    return;
  }

  if (isYouTubeUrl(parsedUrl.toString())) {
    send(res, 200, {
      status: 'error',
      error: { code: 'youtube_disabled', message: 'YouTube is temporarily unavailable on this server.' }
    });
    return;
  }

  const mode = normalizeMode(input.downloadMode);
  const filenameStyle = input.filenameStyle || 'pretty';

  if (mode === 'audio') {
    const audioPayload = {
      url: parsedUrl.toString(),
      filenameStyle,
      downloadMode: 'audio',
      audioFormat: String(input.audioFormat || 'mp3').trim() || 'mp3'
    };
    send(res, 200, await runProviders(audioPayload));
    return;
  }

  const requestedQuality = normalizeQuality(input.videoQuality);
  let bestError = null;

  for (const quality of fallbackQualities(requestedQuality)) {
    const payload = {
      url: parsedUrl.toString(),
      filenameStyle,
      downloadMode: 'auto',
      videoQuality: quality
    };

    const result = await runProviders(payload);
    if (SUCCESS_STATUSES.has(result.status)) {
      if (quality !== requestedQuality) {
        result.originalQuality = requestedQuality;
        result.fallbackQuality = quality;
        result.warning = 'Requested quality was not available. Lower quality was used automatically.';
      }
      send(res, 200, result);
      return;
    }

    if (!bestError || (Array.isArray(result.attemptedProviders) && result.attemptedProviders.length > (bestError.attemptedProviders || []).length)) {
      bestError = result;
      bestError.requestedQuality = requestedQuality;
      bestError.lastTriedQuality = quality;
    }
  }

  send(res, 200, bestError || {
    status: 'error',
    error: { code: 'all_providers_failed', message: 'All providers failed.' }
  });
};
