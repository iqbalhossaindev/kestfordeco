import { json, readJson } from '../_lib/http.js';
import { assertSender, cleanupSession } from '../_lib/session-service.js';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } });
  }
  try {
    const body = await readJson(request);
    const session = await assertSender(body.code || '', body.token || '');
    await cleanupSession(session.code);
    return json({ ok: true, cancelled: true });
  } catch (error) {
    const status = error.message === 'forbidden' ? 403 : 404;
    return json({ ok: false, error: error.message || 'cancel_failed' }, { status });
  }
}
