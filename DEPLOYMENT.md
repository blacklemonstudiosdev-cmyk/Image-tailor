# Image Tailor — deployment notes

## What changed
- Removed the Pollinations API route and the `@vercel/blob` dependency.
- The generation/edit buttons now call a browser-side WebGPU diffusion runtime. Image generation does not call `/api/generate` or upload images to Pollinations.
- Linked “BlackLemon Studios” in the byline to https://blacklemonstudios.vercel.app.
- Seed, inference steps, CFG/guidance scale, and negative prompt are passed to the browser runtime.

## Important model compatibility note
The client is configured for the `aislamov/stable-diffusion-v1-5-onnx` repository through `@aislamov/diffusers.js`. This runtime/model combination has **not been verified in this environment**. Confirm that the repository exists and exposes the ONNX layout expected by that library before publishing. If the repository is unavailable or incompatible, generation will fail at model loading; do not treat a successful Vercel deployment as proof that GPU inference works. The library’s public example documents the `aislamov/stable-diffusion-2-1-base-onnx` model, not this SD 1.5 identifier.

Safety changes: prompts are checked against conservative prohibited-category rules; a fixed negative-prompt list is always added; and generated/local-server images are passed through NSFWJS before being applied to the editor. NSFWJS uses its bundled model definition rather than the retired public model host. If the classifier cannot load, the result is blocked (fail-closed). This is defense-in-depth, not a guarantee: keyword filters and image classifiers can miss unsafe content or flag safe content, so the app still needs adversarial testing and a human reporting/removal process.

Also, the current browser pipeline is text-to-image. The Edit button currently creates a new interpretation from the edit prompt; it does **not** perform true image-to-image diffusion or preserve the source composition. A genuine SD 1.5 img2img workflow needs a runtime/model that supports image conditioning. The existing optional Automatic1111-compatible local server path remains the actual img2img route when configured.

## Vercel: after removing Pollinations environment variables
1. Open **Vercel → your project → Settings → Environment Variables**.
2. Delete any Pollinations-specific variables you previously added (for example `POLLINATIONS_EDIT_MODEL`, or any `POLLINATIONS_*` / Pollinations API key variables). This code no longer reads them.
3. `BLOB_READ_WRITE_TOKEN` is no longer needed for image generation/editing by this code. If this Blob store/token was only created for temporary Pollinations image uploads, you can remove the token and optionally delete that Blob store after checking nothing else in the project uses it.
4. Redeploy the latest commit so the new static HTML and deleted API route take effect.
5. No new Vercel environment variable is required by this implementation. The WebGPU model is fetched by the visitor’s browser from its model host.

## GitHub changes
1. Commit the updated `index.html`, `package.json`, and this README.
2. Delete `api/generate.js` (already removed in this archive) so Pollinations is no longer deployed as `/api/generate`.
3. Remove `@vercel/blob` from `package.json` (already removed).
4. Check repository **Settings → Secrets and variables → Actions** and remove Pollinations-only secrets/variables if any exist. Do not delete unrelated deployment secrets.
5. If GitHub Actions has a workflow that injects Pollinations variables or deploys the old API route, remove those references. No GitHub workflow is present in this ZIP.
6. Push to the same branch connected to Vercel. Confirm the Vercel project’s Git integration points to the correct repository and root directory (`Image-tailor-main` if this folder is the repository root; use `.` if the files are at the repository root).

## Browser/runtime requirements
- Serve the app over HTTPS (Vercel does this) or localhost.
- WebGPU support is required; recent Chromium browsers are the best target. WebGPU may be unavailable on some devices/browsers.
- First use can download large model files and consume substantial GPU memory. Test on the target browsers and devices before announcing the deployment.
- `steps`, `CFG`, and `seed` are forwarded to the runtime; the model/runtime must support those option names for them to affect inference. Seed `-1` means the app runtime should choose a random seed, but the current wrapper passes a generated random seed when the field is negative.
