# Image Tailor — SD-Turbo WebGPU build

This build removes FLUX.2 Klein and uses SD-Turbo, a distilled Stable Diffusion 2.1 model designed for fast low-step browser generation. The documented `web-txt2img` browser library reports an approximately 2.3 GB first model download and requires WebGPU.

## Generation
Generation runs in the user's browser using WebGPU. It does not send prompts to Pollinations, fal.ai, or a hosted AI inference API. First use downloads model files which may be cached by the browser.

## Editing status — not finished
The chosen SD-Turbo browser library currently exposes text-to-image, not image-to-image. This build deliberately disables the edit action with an explanatory status rather than falsely claiming the uploaded image was used. The temporary Vercel Blob upload/delete endpoints are retained for the future img2img integration, but they are not invoked until a real local image-to-image pipeline is wired in. **Do not treat this ZIP as a completed editing release.**

## Vercel
No `FAL_KEY` or Pollinations variable is needed for generation. Keep your Blob store and read-write token unchanged until the local img2img pipeline is implemented.
