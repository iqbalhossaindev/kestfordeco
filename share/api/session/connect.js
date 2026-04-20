import { json, readJson } from '../_lib/http.js';
import { connectReceiver, publicSession } from '../_lib/session-service.js';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } });
  }
  try {
    const body = await readJson(request);
    const session = await connectReceiver(body.code || '');
    return json({ ok: true, code: session.code, session: publicSession(session, 'receiver') });
  } catch (error) {
    const status = error.message === 'session_expired' ? 410 : 404;
    return json({ ok: false, error: error.message || 'connect_failed' }, { status });
  }
}
