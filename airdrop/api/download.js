import { readSessionFile } from './_lib/session-service.js';
import { json } from './_lib/http.js';

function encodeFileName(name) {
  return encodeURIComponent(name).replace(/['()*]/g, escape).replace(/%(7C|60|5E)/g, unescape);
}

export default async function handler(request) {
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET' } });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const id = url.searchParams.get('id') || '';
  try {
    const { file, binary } = await readSessionFile(code, id);
    return new Response(binary.stream, {
      status: 200,
      headers: {
        'Content-Type': file.type || binary.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeFileName(file.name)}`,
        'Cache-Control': 'no-store',
        ...(file.size ? { 'Content-Length': String(file.size) } : {})
      }
    });
  } catch (error) {
    const status = error.message === 'file_not_found' ? 404 : error.message === 'session_expired' ? 410 : 404;
    return json({ ok: false, error: error.message || 'download_failed' }, { status });
  }
}
