import { json } from '../_lib/http.js';
import { getStatus, publicSession } from '../_lib/session-service.js';

export default async function handler(request) {
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'GET' } });
  }
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const role = url.searchParams.get('role') || 'receiver';
  const token = url.searchParams.get('token') || '';
  try {
    const session = await getStatus(code, role, token);
    return json({ ok: true, session: publicSession(session, role) });
  } catch (error) {
    const status = error.message === 'forbidden' ? 403 : error.message === 'session_expired' ? 410 : 404;
    return json({ ok: false, error: error.message || 'status_failed' }, { status });
  }
}
