import { del } from '@vercel/blob';

function isTemporaryImageTailorUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' &&
      url.hostname.toLowerCase().endsWith('.blob.vercel-storage.com') &&
      url.pathname.startsWith('/image-tailor-temp/');
  } catch {
    return false;
  }
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.blob_read_write_id;
  if (!blobToken) return Response.json({ error: 'Connect a Vercel Blob store and set BLOB_READ_WRITE_TOKEN.' }, { status: 503 });
  try {
    const body = await request.json();
    const url = String(body?.url || '');
    if (!isTemporaryImageTailorUrl(url)) {
      return Response.json({ error: 'Invalid temporary image URL.' }, { status: 400 });
    }
    await del(url, { token: blobToken });
    return Response.json({ deleted: true });
  } catch (error) {
    console.error('Temporary Blob delete failed:', error?.message || error);
    return Response.json({ error: 'Could not delete the temporary image.' }, { status: 500 });
  }
}
