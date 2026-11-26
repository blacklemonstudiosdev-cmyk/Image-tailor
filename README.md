# Image Tailor

A professional image editor that runs entirely in the browser. Layers, colour grading, masks,
typography, multi-page documents and live collaboration — no account, no upload, no server.

A product by [BlackLemon Studios](https://blacklemonstudios.vercel.app).

---

## What it does

**Dashboard.** Every document you have made opens into a gallery with a live thumbnail, its size
and when you last touched it. Right-click a card (or use the `⋯` button) for a native-feeling menu:
open, duplicate, rename, export as PNG, delete.

**New Project.** Two choices — `Import an Image` (one or many files; the first sets the canvas
size, the rest land as layers) or `Start Fresh` (any size, any background, transparent allowed).

**Importing into a project.** Three ways, any time: the `+ Image` button in the toolbar or the
Layers panel, dropping files anywhere in the editor, or ⌘V to paste an image straight from the
clipboard. Each lands centred, fitted to the canvas, as its own editable layer.

**Layers.** Images, text, shapes and gradients stack in one list. Per layer: visibility, lock,
opacity, all sixteen canvas blend modes, position, size, rotation, flip, 90° rotation, and its own
independent grade. Reorder, duplicate, delete. Layers can sit above or below each other, so type can
drop behind a photograph. Select several with shift and align or distribute them.

**Layer styles.** Drop shadow (colour, blur, offset, opacity) and outline (colour, width) on any
layer — image, type, shape or gradient.

**Selections.** Rectangle, ellipse, freehand lasso and a magic wand with a tolerance slider.
Shift adds to a selection, Option subtracts. From a selection you can delete content out of a layer,
mask a layer down to it, fill it with the picked colour, invert it, or crop the canvas to it.
Marching-ants outline with a live tint over the selected region.

**Retouch.** A clone stamp: Option-click to set the source, then paint. Strokes are sampled from a
full-resolution composite and land as their own layer, so they stay editable.

**Colour grading.** Exposure, contrast, highlights, shadows, whites, blacks, temperature, tint,
saturation, vibrance, hue rotation, fade, clarity, sharpen, blur, glow, chromatic aberration,
vignette, grain, motion blur, tilt-shift, edge detect, emboss, posterize, threshold, pixelate,
halftone and scanlines. Plus:

- **Levels** — input black/white, gamma, output range.
- **Curves** — a draggable monotone spline editor with an S-curve shortcut.
- **Histogram** — live 64-bin read-out of the composite.
- **Auto tone and auto white balance** — percentile stretch and grey-world neutralisation.
- **Colour mixer** — eight hue bands (red through magenta), each with its own hue, saturation and
  luminance shift, so one colour in a photograph can be pushed without touching the rest.
- **Split toning** — separate shadow and highlight tints.
- **Duotone** — map luminance between two colours.
- **Looks** — sixteen ready-made grades (Cinema, Teal / Orange, Bleach Bypass, Kodachrome, Noir,
  Matte Pastel, Cyber, Halftone Print and more).

Grading applies to the selected layer or to the whole canvas, whichever you point it at.

**Masks and erasing.** The eraser paints into a layer's mask to cut it away; the brush paints it
back. Strokes are stored as vectors, so they stay sharp at any export resolution and can be undone
one at a time. Selections can also become a layer mask, so a wand-click removes a background in one
step.

**Retouch.** A clone stamp: Option-click (Alt-click) to set the source, then paint. Strokes are
sampled from a full-resolution composite and land as their own layer, so they stay editable.

**Gradients and shapes.** Drag with the gradient tool to place a linear or radial gradient layer at
any angle. Shapes include rectangles, ellipses, triangles, polygons, stars, arrows and rules, each
with fill, stroke, stroke width and corner radius.

**Crop.** Drag a frame on the canvas, apply, and every layer shifts with the new page box. Crop to a
selection, too.

**Upscale.** `2×` and `4×` rebuild the canvas and re-sample each image with a separable Lanczos-3
kernel plus a detail pass (a high-quality canvas resample with an unsharp pass above eight
megapixels, to stay inside browser limits).

**Type.** Any family from Indian Type Foundry (streamed from Fontshare) or Google Fonts, plus any
font file you drag in yourself (`.ttf`, `.otf`, `.woff`, `.woff2`, kept in your browser). Size,
weight, italic, underline, letter spacing, line height, alignment, case, fill, stroke and drop
shadow.

**Pages.** Add, duplicate and delete pages inside one document; each keeps its own layers and grade.

**Export.** PNG, JPG or WebP at 0.5×, 1×, 2× or 4×, current page or every page at once, or copy
straight to the clipboard.

**History.** An undo stack with a clickable list of every step in the properties panel.

**Guides.** A thirds grid overlay and snapping to page edges, centres and other layers, both
toggleable from the canvas HUD.

**Collaboration.** Press `Share` to get a six digit code. Anyone who enters it lands in the same
document: layers, grades, text, pages and new images all sync live, with a cursor showing where the
other person is working.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check, then bundle to dist/
```

## Deploying

The repository is set up for Vercel. `vercel.json` pins the build (`npm run build`, output `dist`)
and rewrites every path to `index.html`. Push the repository, import it in Vercel, deploy — there
are no environment variables and nothing to configure.

Any static host works the same way: run `npm run build` and serve `dist/`.

## How the pieces fit

| Path | Responsibility |
| --- | --- |
| `src/lib/pixels.ts` | The colour pipeline: channel LUTs, luma-masked tone work, HSL bands, split toning, duotone, convolution, Lanczos resampling |
| `src/lib/render.ts` | Layer → canvas → grade → effects → page compositing, text layout, thumbnails |
| `src/lib/doc.ts` | Document, page and layer factories |
| `src/lib/store.ts` | IndexedDB persistence for documents, thumbnails and image blobs |
| `src/lib/fonts.ts` | Fontshare (ITF) and Google Fonts loading, plus user-supplied faces |
| `src/lib/collab.ts` | WebRTC session over PeerJS: document sync, cursor presence, chunked asset transfer |
| `src/components/CanvasStage.tsx` | Canvas painting, selection handles, transform, crop, brush gestures |
| `src/components/Editor.tsx` | Editor state, history, autosave, shortcuts, collaboration wiring |

Documents never leave the machine. Images live in IndexedDB as blobs; collaboration streams a
compressed state over a peer-to-peer data channel, so nothing is stored on anyone's server.

## Keyboard

| Key | Action |
| --- | --- |
| `V` | Move and transform |
| `M` | Rectangle select |
| `L` | Lasso |
| `W` | Magic wand |
| `C` | Crop |
| `B` / `E` | Brush / eraser |
| `S` | Clone stamp |
| `G` | Gradient |
| `T` | Text |
| `I` | Eyedropper |
| `H` / `Z` | Hand / zoom |
| `⌘Z` / `⌘⇧Z` | Undo / redo |
| `⌘A` / `⌘I` | Select all / invert selection |
| `⌘D` | Duplicate layer |
| `⌘S` | Save to this browser now |
| `⌫` | Delete selected layer |
| Arrows (with `⇧`) | Nudge 1px (10px) |
| Space + drag | Pan |
| Wheel | Zoom at the pointer |
| `Esc` | Clear selection / cancel crop |

## Notes

- Collaboration uses PeerJS's public relay only to introduce the two browsers; after that the
  document moves directly between them. A session lives while the host's tab is open.
- Documents and uploaded fonts are stored per browser. Export anything you want to keep.
- Chrome, Edge, Safari 16.4+ and Firefox are supported.
