# Deployment

- Build command: `npm run build`
- Output directory: `dist`
- Root directory: repository root (`.`)
- Environment variable: `BLOB_READ_WRITE_TOKEN` must be available to the Vercel Functions for temporary editing uploads/deletes.

Text-to-image uses SD-Turbo locally in the browser. Image-to-image uses Stable Diffusion 2.1 ONNX locally in the browser. The source image is temporarily stored in Vercel Blob and deleted after the editing attempt. Neither Pollinations nor fal.ai is used for inference.

First use downloads model weights. WebGPU must be available in the user's browser and GPU. Editing uses a heavier model than text-to-image and may fail on low-memory devices; the app reports the failure instead of contacting a remote AI service.
