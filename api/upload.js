import { json } from './_lib/http.js';
import { attachUploadedFile, publicSession } from './_lib/session-service.js';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, { status: 405, headers: { Allow: 'POST' } });
  }
  try {
    const formData = await request.formData();
    const code = formData.get('code') || '';
    const token = formData.get('token') || '';
    const file = formData.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return json({ ok: false, error: 'file_required' }, { status: 400 });
    }
    const result = await attachUploadedFile(String(code), String(token), file);
    return json({
      ok: true,
      file: {
        id: result.file.id,
        name: result.file.name,
        size: result.file.size,
        type: result.file.type,
        uploadedAt: result.file.uploadedAt
      },
      session: publicSession(result.session, 'sender')
    });
  } catch (error) {
    const status = error.message === 'file_too_large' ? 413 : error.message === 'forbidden' ? 403 : 400;
    return json({ ok: false, error: error.message || 'upload_failed' }, { status });
  }
}
