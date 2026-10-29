# Image Tailor img2img implementation

Changed in this build:
- `package.json`: adds `@aislamov/diffusers.js` for a browser-local Stable Diffusion img2img pipeline.
- `src/app.js`: implements the real editing path, Blob staging/retrieval, 512×512 tensor preprocessing, img2img inference, output decoding, safety approval, and finally-based Blob cleanup.
- `vite.config.js`: excludes worker/model packages from dependency prebundling while retaining Vite worker bundling.
- `vercel.json`: declares the Vite build and `dist` output.
- `DEPLOYMENT.md`, `WEBGPU-MODEL-NOTES.md`: deployment/model notes.

The app does not use Pollinations or fal.ai for inference. The temporary Blob URL is used only to stage the source image and is deleted after the edit attempt. If the browser closes mid-request or Vercel is unavailable, cleanup can still fail; inspect Blob storage occasionally.

Model size and WebGPU support are the key risks. SD 2.1 ONNX img2img is heavier than SD-Turbo generation; it is a real pipeline, but low-end devices may not have enough GPU memory.
