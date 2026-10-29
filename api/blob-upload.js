import { handleUpload } from '@vercel/blob/client';

const TEMP_PREFIX = 'image-tailor-temp/';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN || process.env.blob_read_write_id;
  if (!blobToken) return Response.json({ error: 'Connect a Vercel Blob store and set BLOB_READ_WRITE_TOKEN.' }, { status: 503 });
  try {
    const body = await request.json();
    const result = await handleUpload({
      token: blobToken,
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!String(pathname || '').startsWith(TEMP_PREFIX)) {
          throw new Error('Only temporary Image Tailor uploads are allowed.');
        }
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
          access: 'public',
          tokenPayload: JSON.stringify({ purpose: 'temporary-image-edit' })
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Deliberately do not log the public URL or image content.
        console.info('Image Tailor temporary upload completed:', blob.pathname);
      }
    });
    return Response.json(result);
  } catch (error) {
    console.error('Temporary Blob upload setup failed:', error?.message || error);
    return Response.json({ error: 'Could not prepare temporary image upload.' }, { status: 400 });
  }
}
