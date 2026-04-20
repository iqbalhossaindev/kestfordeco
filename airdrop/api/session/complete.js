import { json, readJson } from '../_lib/http.js';
import { markComplete, publicSession } from '../_lib/session-service.js';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } });
  }
  try {
    const body = await readJson(request);
    const session = await markComplete(body.code || '');
    return json({ ok: true, session: publicSession(session, 'receiver') });
  } catch (error) {
    const status = error.message === 'session_expired' ? 410 : 404;
    return json({ ok: false, error: error.message || 'complete_failed' }, { status });
  }
}
