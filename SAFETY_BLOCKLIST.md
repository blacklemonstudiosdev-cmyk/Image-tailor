# Image Tailor safety blocklist and enforcement notes

## Enforcement order

1. **Prompt gate before any generation/edit request.** A conservative keyword/pattern gate runs before both the browser WebGPU route and the optional local image-server route.
2. **Mandatory negative prompt.** A fixed safety-oriented negative prompt is always prepended to the user's optional negative prompt. This is only a generation hint, not a security boundary.
3. **Output image classifier.** Every generated image and every image returned from the optional local image server is checked with NSFWJS before it is applied to the editor. Porn/Hentai scores at or above 0.08 or Sexy at or above 0.18 cause rejection.
4. **Fail closed.** If the classifier fails to load, errors, or returns invalid/empty output, the image is not applied. The user must not be able to bypass this by switching to the local server path.
5. **No guarantee.** This is defense-in-depth, not a guarantee of detection. Classifiers can miss content and produce false positives. It needs red-team testing before public launch.

## Blocked prompt categories

- Pornography, hentai, explicit sexual content, erotic content, sexual acts, fetish/BDSM requests.
- Nudity, explicit exposure, genitalia, topless/bottomless requests, sexualized depictions.
- Any sexual content involving minors, children, teens, school-age subjects, or age-ambiguous young-looking subjects; sexualized child-coded terms.
- Rape, sexual assault, coercion, incest, non-consensual sexual imagery, deepfake nudes, and revenge porn.
- Graphic gore, dismemberment, decapitation, mutilation, torture, and snuff-style imagery.
- Self-harm and suicide depictions or instructions, and terrorist-attack/bomb-making requests.
- Common separator/leet-obfuscated variants of selected blocked terms.

## Required manual QA before publishing

- Verify benign portraits, fashion, medical/educational illustrations, landscapes, and ordinary artwork still work.
- Verify blocked prompts fail before model initialization and do not call the local image server.
- Verify explicit outputs are discarded and never appear on the canvas, layer list, preview, or export.
- Disable network access to the classifier/model host and confirm generation fails closed rather than bypassing checks.
- Test in each supported browser. The classifier and diffusion model are browser-downloaded dependencies; model hosting, CORS, WebGPU support, and memory constraints can affect operation.
- Test with adversarial spelling, separators, misspellings, multilingual requests, image-based prompt injection, and outputs that are borderline rather than clearly explicit.

## Known limitations

The prompt gate is not a semantic moderation model and can be evaded. NSFWJS is a classifier, not a perfect policy oracle. Its hosted model must be reachable; if it is unavailable the app intentionally blocks generation. A robust public service should add independent server-side moderation, rate limiting, abuse reporting, and an appeals/review path. The app currently performs browser-side inference, so no central server-side policy enforcement exists.
