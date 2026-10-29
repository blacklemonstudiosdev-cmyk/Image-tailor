# Image Tailor — WebGPU generation and image-to-image editing

## Generation
Text-to-image uses SD-Turbo through `web-txt2img` in the browser with WebGPU. The worker entry is bundled by Vite so the browser does not construct a Worker from a cross-origin `esm.sh` URL.

## Editing
Editing uses the `@aislamov/diffusers.js` Stable Diffusion image-to-image pipeline (`aislamov/stable-diffusion-2-1-base-onnx`) in the browser. The source image is staged temporarily in Vercel Blob, fetched back into the browser, encoded to a latent, edited locally, passed through the existing safety gate, and deleted in a `finally` cleanup path. No Pollinations, fal.ai, or other hosted AI inference service is used. Blob is temporary storage only.

**Hardware caveat:** the img2img model is substantially heavier than SD-Turbo text-to-image and may not run on low-memory laptops. The implementation uses a 512×512 input and a low default step count, but this cannot eliminate model-memory requirements. The first edit downloads model assets. If model load fails, the app reports the error; it does not fall back to a hosted service.

## Vercel
Build command: `npm run build`; output directory: `dist`. The Blob endpoints require `BLOB_READ_WRITE_TOKEN`. No Pollinations or fal.ai keys are used for generation or editing.
