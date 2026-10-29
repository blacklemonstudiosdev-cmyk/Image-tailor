# Image Tailor — WebGPU + temporary Vercel Blob

## Architecture

- **Generate:** FLUX.2 Klein runs in the visitor's browser through WebGPU. No hosted AI generation API is called.
- **Edit:** the editor image is uploaded to a randomly named object under `image-tailor-temp/` in Vercel Blob. The browser fetches that image back, passes it as a reference image to the local FLUX.2 Klein pipeline, and deletes the temporary object in a `finally` cleanup path after the edit finishes or fails.
- **Safety:** prompt screening runs before inference and the existing client-side image-safety classifier must approve the result before it enters the editor. Safety checks are safeguards, not a guarantee.
- **Model downloads:** the first use downloads FLUX.2 Klein model weights from the model host into the browser. Inference is local; initial model download still requires internet access. Browser cache is used on later visits.

## Vercel setup

1. Open **Vercel → your Image Tailor project → Storage**.
2. Connect the existing Vercel Blob store to this project, or create a Blob store and connect it to the project for Production and Preview.
3. In **Settings → Environment Variables**, confirm Vercel has added `BLOB_READ_WRITE_TOKEN` for the connected store. If it has not, add that variable using the read-write token from the Blob store settings. Never put the token in `index.html` or GitHub.
4. Do **not** add `FAL_KEY` or any Pollinations key/model variable. This build does not use fal.ai or Pollinations.
5. Commit/push the whole project folder contents, including `api/blob-upload.js`, `api/blob-delete.js`, `index.html`, `package.json`, and `SAFETY_BLOCKLIST.md`, to the branch Vercel deploys. Vercel should redeploy automatically.
6. Ensure Vercel's Root Directory points to the folder containing `index.html`, `package.json`, and `api/`. If these files are at repository root, use `.`.

## Existing variables

- `PIllinations_Edit_model`: unused by this build; remove it after the new deployment is live and you have confirmed no other project feature depends on it.
- `Blob_webhook_public_key`, `blob_store_id`, `blob_read_write_id`: these custom names are not read by this code. You can leave them temporarily; the app uses the standard `BLOB_READ_WRITE_TOKEN` supplied by the connected Vercel Blob store. Do not paste secret values into chat.

## Test

1. Open the deployed site in a recent Chrome or Edge browser with hardware acceleration enabled. WebGPU must be available (`navigator.gpu` should exist).
2. Click Generate with a simple prompt such as `a hand holding a blank canvas, studio lighting, plain neutral background`.
3. The first run downloads the local model and may take a while; later runs should reuse cached weights.
4. Load an image, enter an edit instruction, and click Edit. Watch the Blob store during the request: a temporary `image-tailor-temp/` object appears, then the app requests deletion when processing ends.
5. If generation fails, check browser DevTools Console and Network. If Blob upload/delete fails, check Vercel → Deployments → Functions logs and verify `BLOB_READ_WRITE_TOKEN` is present.

## Important behavior / limitations

- The temporary source image is public while it exists because the browser and image pipeline need to fetch it without an authenticated server proxy. The URL is random and short-lived, but anyone who obtains the URL during that window could access it. Do not use this for highly sensitive images.
- Cleanup runs after the edit promise completes or fails. If the user closes the tab, loses connection, or the browser crashes before cleanup runs, the temporary object may remain; check the Blob store and delete any leftovers. A scheduled cleanup job would be needed to guarantee cleanup after abrupt browser termination.
- This is a browser/GPU-heavy model. A compatible browser and enough free RAM/GPU memory are required. If the model cannot load, no remote AI fallback is used.
