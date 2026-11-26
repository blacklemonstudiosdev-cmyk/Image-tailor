/* Canvas rendering pipeline: layers -> grade -> effects -> styles -> page. */

import { Doc, GradientSpec, Layer, Page, TextSpec } from '../types';
import { ensureFonts, cssFamily } from './fonts';
import { applyGrade, isNeutral } from './pixels';
import { clamp, hexToRgb, rgbToHex } from './utils';

export type AssetMap = Map<string, ImageBitmap>;

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    measureCtx = c.getContext('2d')!;
  }
  return measureCtx;
}

export function fontString(t: TextSpec, scale = 1): string {
  const size = Math.max(1, t.size * scale);
  return `${t.italic ? 'italic ' : ''}${t.weight} ${size}px ${cssFamily(t.family)}`;
}

function transformText(t: TextSpec): string {
  if (t.transform === 'uppercase') return t.content.toUpperCase();
  if (t.transform === 'lowercase') return t.content.toLowerCase();
  return t.content;
}

function measureLine(ctx: CanvasRenderingContext2D, str: string, ls: number): number {
  if (!ls) return ctx.measureText(str).width;
  let total = 0;
  for (const ch of str) total += ctx.measureText(ch).width + ls;
  return total;
}

export function layoutText(t: TextSpec, maxWidth: number, scale = 1): string[] {
  const ctx = measure();
  ctx.font = fontString(t, scale);
  const ls = t.letterSpacing * scale;
  const w = Math.max(4, maxWidth);
  const content = transformText(t);
  const out: string[] = [];
  for (const para of content.split('\n')) {
    const words = para.split(' ');
    if (words.length === 1 && words[0] === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (measureLine(ctx, test, ls) <= w || !line) {
        line = test;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

export function measureTextLayer(layer: Layer): { w: number; h: number } {
  if (!layer.text) return { w: layer.w, h: layer.h };
  const lines = layoutText(layer.text, layer.w, 1);
  const lh = layer.text.size * layer.text.lineHeight;
  return { w: layer.w, h: Math.max(lh, lines.length * lh + layer.text.size * 0.18) };
}

/* ------------------------------------------------------------------ */

function drawImageFit(
  ctx: CanvasRenderingContext2D,
  bmp: CanvasImageSource,
  w: number,
  h: number,
  fit: 'cover' | 'contain' | 'fill',
  natW: number,
  natH: number,
) {
  const iw = natW || 1;
  const ih = natH || 1;
  if (fit === 'fill') {
    ctx.drawImage(bmp, 0, 0, w, h);
    return;
  }
  const s = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(bmp, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#131313';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.fillStyle = '#4b4b4b';
  ctx.font = `500 ${Math.max(9, Math.min(14, w / 20))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Loading image', w / 2, h / 2);
}

function drawText(ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number, scale: number) {
  const t = layer.text;
  if (!t) return;
  const lines = layoutText(t, layer.w * scale, scale);
  const size = t.size * scale;
  const lh = size * t.lineHeight;
  const ls = t.letterSpacing * scale;

  ctx.font = fontString(t, scale);
  ctx.textBaseline = 'top';
  ctx.textAlign = t.align === 'center' ? 'center' : t.align === 'right' ? 'right' : 'left';

  const totalH = lines.length * lh;
  const startY = Math.max(0, (h - totalH) / 2 + size * 0.06);
  const x = t.align === 'center' ? w / 2 : t.align === 'right' ? w : 0;

  ctx.save();
  if (t.shadow) {
    ctx.shadowColor = t.shadowColor;
    ctx.shadowBlur = t.shadowBlur * scale;
    ctx.shadowOffsetX = t.shadowX * scale;
    ctx.shadowOffsetY = t.shadowY * scale;
  }
  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lh;
    if (t.strokeWidth > 0) {
      ctx.lineWidth = t.strokeWidth * scale;
      ctx.strokeStyle = t.strokeColor;
      ctx.lineJoin = 'round';
      strokeLine(ctx, lines[i], x, y, ls, t.align);
    }
    ctx.fillStyle = t.color;
    if (ls) {
      drawSpacedLine(ctx, lines[i], x, y, ls, t.align);
    } else {
      ctx.fillText(lines[i], x, y);
    }
    if (t.underline && lines[i]) {
      const width = measureLine(ctx, lines[i], ls);
      const ux = t.align === 'center' ? x - width / 2 : t.align === 'right' ? x - width : x;
      ctx.fillRect(ux, y + size * 1.02, width, Math.max(1, size * 0.045));
    }
  }
  ctx.restore();
}

function drawSpacedLine(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  ls: number,
  align: 'left' | 'center' | 'right',
) {
  const total = measureLine(ctx, str, ls) - ls;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of str) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + ls;
  }
  ctx.textAlign = prev;
}

function strokeLine(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  ls: number,
  align: 'left' | 'center' | 'right',
) {
  if (!ls) {
    ctx.strokeText(str, x, y);
    return;
  }
  const total = measureLine(ctx, str, ls) - ls;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of str) {
    ctx.strokeText(ch, cx, y);
    cx += ctx.measureText(ch).width + ls;
  }
  ctx.textAlign = prev;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  if (rr <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}

function regularPath(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  points: number,
  star: boolean,
) {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const n = Math.max(3, Math.min(60, Math.round(points)));
  const total = star ? n * 2 : n;
  for (let i = 0; i < total; i++) {
    const a = (i / total) * Math.PI * 2 - Math.PI / 2;
    const factor = star && i % 2 === 1 ? 0.45 : 1;
    const x = cx + Math.cos(a) * rx * factor;
    const y = cy + Math.sin(a) * ry * factor;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function arrowPath(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const shaft = h * 0.36;
  const head = Math.min(w * 0.45, h * 1.1);
  const top = (h - shaft) / 2;
  ctx.moveTo(0, top);
  ctx.lineTo(w - head, top);
  ctx.lineTo(w - head, 0);
  ctx.lineTo(w, h / 2);
  ctx.lineTo(w - head, h);
  ctx.lineTo(w - head, top + shaft);
  ctx.lineTo(0, top + shaft);
  ctx.closePath();
}

function drawShape(ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number, scale: number) {
  const s = layer.shape;
  if (!s) return;
  ctx.save();
  const lw = s.strokeWidth * scale;
  const inset = lw / 2;

  if (s.kind === 'line') {
    ctx.strokeStyle = s.strokeWidth ? s.stroke : s.fill;
    ctx.lineWidth = Math.max(1, lw || scale);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  if (s.kind === 'ellipse') {
    ctx.ellipse(
      w / 2,
      h / 2,
      Math.max(0, w / 2 - inset),
      Math.max(0, h / 2 - inset),
      0,
      0,
      Math.PI * 2,
    );
  } else if (s.kind === 'triangle') {
    ctx.moveTo(w / 2, inset);
    ctx.lineTo(w - inset, h - inset);
    ctx.lineTo(inset, h - inset);
    ctx.closePath();
  } else if (s.kind === 'star') {
    regularPath(ctx, w - lw, h - lw, s.points || 5, true);
    ctx.translate(inset, inset);
  } else if (s.kind === 'polygon') {
    regularPath(ctx, w - lw, h - lw, s.points || 6, false);
    ctx.translate(inset, inset);
  } else if (s.kind === 'arrow') {
    arrowPath(ctx, w - lw, h - lw);
    ctx.translate(inset, inset);
  } else {
    roundRect(ctx, inset, inset, Math.max(0, w - lw), Math.max(0, h - lw), s.radius * scale);
  }

  if (s.fill !== 'none' && s.fill) {
    ctx.fillStyle = s.fill;
    ctx.fill();
  }
  if (s.strokeWidth > 0) {
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  ctx.restore();
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

function drawGradient(
  ctx: CanvasRenderingContext2D,
  gradient: GradientSpec,
  w: number,
  h: number,
) {
  let fill: CanvasGradient;
  if (gradient.kind === 'radial') {
    const cx = w / 2;
    const cy = h / 2;
    const r = (Math.max(w, h) / 2) * 1.35;
    fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  } else {
    const a = (gradient.angle * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const len = Math.abs(w * dx) + Math.abs(h * dy);
    fill = ctx.createLinearGradient(
      w / 2 - (dx * len) / 2,
      h / 2 - (dy * len) / 2,
      w / 2 + (dx * len) / 2,
      h / 2 + (dy * len) / 2,
    );
  }
  const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
  fill.addColorStop(0, gradient.stopA);
  if (isHex(gradient.stopA) && isHex(gradient.stopB)) {
    fill.addColorStop(
      clamp(gradient.midpoint, 0.02, 0.98),
      mixHex(gradient.stopA, gradient.stopB, 0.5),
    );
  }
  fill.addColorStop(1, gradient.stopB);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------------ */
/* masks, effects                                                      */
/* ------------------------------------------------------------------ */

function applyMask(
  canvas: HTMLCanvasElement,
  layer: Layer,
  scale: number,
  assets: AssetMap,
) {
  const hasAsset = !!layer.maskAsset && assets.has(layer.maskAsset);
  if (!layer.mask.length && !hasAsset) return;

  const m = document.createElement('canvas');
  m.width = canvas.width;
  m.height = canvas.height;
  const mg = m.getContext('2d');
  if (!mg) return;

  const bitmap = layer.maskAsset ? assets.get(layer.maskAsset) : undefined;
  if (bitmap) {
    mg.drawImage(bitmap as CanvasImageSource, 0, 0, m.width, m.height);
  } else {
    mg.fillStyle = '#ffffff';
    mg.fillRect(0, 0, m.width, m.height);
  }

  mg.lineCap = 'round';
  mg.lineJoin = 'round';
  for (const stroke of layer.mask) {
    const pts = stroke.pts;
    if (pts.length < 2) continue;
    mg.strokeStyle = stroke.erase ? '#000000' : '#ffffff';
    mg.lineWidth = Math.max(1, stroke.size * scale);
    mg.beginPath();
    mg.moveTo(pts[0] * canvas.width, pts[1] * canvas.height);
    if (pts.length === 2) {
      mg.lineTo(pts[0] * canvas.width + 0.01, pts[1] * canvas.height + 0.01);
    }
    for (let i = 2; i < pts.length; i += 2) {
      mg.lineTo(pts[i] * canvas.width, pts[i + 1] * canvas.height);
    }
    mg.stroke();
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(m, 0, 0);
  ctx.restore();
}

function channelIsolate(src: HTMLCanvasElement, channel: 'r' | 'g' | 'b'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = channel === 'r' ? '#ff0000' : channel === 'g' ? '#00ff00' : '#0000ff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function copyCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

function postEffects(original: HTMLCanvasElement, layer: Layer): HTMLCanvasElement {
  const gr = layer.grade;
  let canvas = original;
  const w = canvas.width;
  const h = canvas.height;

  if (gr.pixelate > 0) {
    const block = 1 + Math.round((gr.pixelate / 100) * Math.max(4, Math.min(w, h) / 12));
    if (block > 1) {
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.floor(w / block));
      tmp.height = Math.max(1, Math.floor(h / block));
      const tg = tmp.getContext('2d')!;
      tg.imageSmoothingEnabled = true;
      tg.drawImage(canvas, 0, 0, tmp.width, tmp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(tmp, 0, 0, w, h);
      ctx.restore();
    }
  }

  if (gr.chroma > 0) {
    const off = Math.max(1, Math.round((gr.chroma / 100) * Math.min(w, h) * 0.02));
    const base = copyCanvas(canvas);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(channelIsolate(base, 'r'), -off, 0);
    ctx.drawImage(channelIsolate(base, 'g'), 0, 0);
    ctx.drawImage(channelIsolate(base, 'b'), off, 0);
    ctx.restore();
  }

  if (gr.motionBlur > 0) {
    const steps = 14;
    const distance = (gr.motionBlur / 100) * Math.min(w, h) * 0.14;
    const base = copyCanvas(canvas);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = 1 / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1) - 0.5;
      ctx.drawImage(base, t * distance, 0);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  if (gr.tiltShift > 0) {
    const radius = Math.max(1, (gr.tiltShift / 100) * Math.min(w, h) * 0.05);
    const blurred = document.createElement('canvas');
    blurred.width = w;
    blurred.height = h;
    const bg = blurred.getContext('2d')!;
    bg.filter = `blur(${radius}px)`;
    bg.drawImage(canvas, 0, 0);

    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const mg = mask.getContext('2d')!;
    const grad = mg.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.38, 'rgba(255,255,255,0)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    mg.fillStyle = grad;
    mg.fillRect(0, 0, w, h);
    bg.globalCompositeOperation = 'destination-in';
    bg.drawImage(mask, 0, 0);

    canvas.getContext('2d')!.drawImage(blurred, 0, 0);
  }

  if (gr.glow > 0) {
    const glow = document.createElement('canvas');
    glow.width = w;
    glow.height = h;
    const gg = glow.getContext('2d')!;
    const radius = Math.max(1, Math.round((gr.glow / 100) * Math.min(w, h) * 0.06));
    gg.filter = `blur(${radius}px)`;
    gg.drawImage(canvas, 0, 0);
    const ctx = canvas.getContext('2d')!;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, (gr.glow / 100) * 0.9);
    ctx.drawImage(glow, 0, 0);
    ctx.restore();
  }

  if (gr.halftone > 0) {
    const ctx = canvas.getContext('2d')!;
    const img = ctx.getImageData(0, 0, w, h);
    const cell = Math.max(3, Math.round(Math.min(w, h) / 90));
    const ht = document.createElement('canvas');
    ht.width = w;
    ht.height = h;
    const hg = ht.getContext('2d')!;
    hg.fillStyle = '#ffffff';
    hg.fillRect(0, 0, w, h);
    hg.fillStyle = '#000000';
    const d = img.data;
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const sx = Math.min(w - 1, x + (cell >> 1));
        const sy = Math.min(h - 1, y + (cell >> 1));
        const o = (sy * w + sx) * 4;
        const lum = (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255;
        const alpha = d[o + 3] / 255;
        const radius = (1 - lum) * cell * 0.62 * alpha;
        if (radius > 0.4) {
          hg.beginPath();
          hg.arc(x + cell / 2, y + cell / 2, radius, 0, Math.PI * 2);
          hg.fill();
        }
      }
    }
    ctx.save();
    ctx.globalAlpha = Math.min(1, gr.halftone / 100);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(ht, 0, 0);
    ctx.restore();
  }

  if (gr.scanlines > 0) {
    const ctx = canvas.getContext('2d')!;
    const gap = Math.max(2, Math.round(6 - (gr.scanlines / 100) * 3));
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, gr.scanlines / 130)})`;
    for (let y = 0; y < h; y += gap) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  }

  return canvas;
}

/* ------------------------------------------------------------------ */
/* layer styles                                                        */
/* ------------------------------------------------------------------ */

function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export interface LayerRender {
  canvas: HTMLCanvasElement;
  /** extra pixels drawn on every side, in page units */
  margin: number;
}

function withStyles(
  inner: HTMLCanvasElement,
  layer: Layer,
  scale: number,
): LayerRender {
  const style = layer.style;
  if (!style) return { canvas: inner, margin: 0 };
  const shadow = style.shadow;
  const outline = style.outline;
  if (!shadow.on && !outline.on) return { canvas: inner, margin: 0 };

  const spread = Math.max(
    shadow.on ? shadow.blur + Math.max(Math.abs(shadow.x), Math.abs(shadow.y)) : 0,
    outline.on ? outline.width * 2 : 0,
  );
  const marginPx = Math.ceil(spread * scale) + 2;
  const margin = marginPx / scale;

  const outer = document.createElement('canvas');
  outer.width = inner.width + marginPx * 2;
  outer.height = inner.height + marginPx * 2;
  const ctx = outer.getContext('2d');
  if (!ctx) return { canvas: inner, margin: 0 };

  if (shadow.on) {
    const sil = silhouette(inner, shadow.color);
    ctx.save();
    ctx.globalAlpha = clamp(shadow.opacity / 100, 0, 1);
    const blur = Math.max(0, shadow.blur * scale);
    if (blur > 0) ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(sil, marginPx + shadow.x * scale, marginPx + shadow.y * scale);
    ctx.restore();
  }

  if (outline.on && outline.width > 0) {
    const sil = silhouette(inner, outline.color);
    const width = Math.max(1, outline.width * scale);
    const rings = Math.min(5, Math.max(1, Math.round(width)));
    ctx.save();
    for (let ring = 1; ring <= rings; ring++) {
      const radius = (width * ring) / rings;
      const steps = 20;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        ctx.drawImage(sil, marginPx + Math.cos(a) * radius, marginPx + Math.sin(a) * radius);
      }
    }
    ctx.restore();
  }

  ctx.drawImage(inner, marginPx, marginPx);
  return { canvas: outer, margin };
}

/* ------------------------------------------------------------------ */

export function renderLayerToCanvas(
  layer: Layer,
  assets: AssetMap,
  scale: number,
): LayerRender | null {
  if (!Number.isFinite(layer.w) || !Number.isFinite(layer.h)) return null;
  if (layer.w < 0.5 || layer.h < 0.5) return null;

  // Never let a layer canvas get big enough for the browser to refuse to draw into it.
  // If it would, render it smaller and let the page composite stretch it back up:
  // a slightly soft layer is far better than one that silently disappears.
  const MAX_LAYER_PIXELS = 24_000_000;
  let drawScale = scale;
  const wanted = Math.round(layer.w * scale) * Math.round(layer.h * scale);
  if (wanted > MAX_LAYER_PIXELS) {
    drawScale = scale * Math.sqrt(MAX_LAYER_PIXELS / wanted);
  }

  const w = Math.max(1, Math.round(layer.w * drawScale));
  const h = Math.max(1, Math.round(layer.h * drawScale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';

  if (layer.type === 'image') {
    const bmp = layer.image ? assets.get(layer.image.assetId) : undefined;
    if (!bmp) {
      drawPlaceholder(ctx, w, h);
    } else {
      const natW = layer.image?.naturalW || bmp.width;
      const natH = layer.image?.naturalH || bmp.height;
      drawImageFit(ctx, bmp, w, h, layer.image?.fit ?? 'cover', natW, natH);
    }
  } else if (layer.type === 'text') {
    drawText(ctx, layer, w, h, drawScale);
  } else if (layer.type === 'gradient') {
    if (layer.gradient) drawGradient(ctx, layer.gradient, w, h);
  } else {
    drawShape(ctx, layer, w, h, drawScale);
  }

  let out = canvas;

  if (layer.grade.blur > 0) {
    const blurPx = Math.max(0.5, (layer.grade.blur / 100) * Math.min(w, h) * 0.12);
    const blurred = document.createElement('canvas');
    blurred.width = w;
    blurred.height = h;
    const bg = blurred.getContext('2d');
    if (bg) {
      bg.filter = `blur(${blurPx}px)`;
      bg.drawImage(canvas, 0, 0);
      out = blurred;
    }
  }

  applyMask(out, layer, drawScale, assets);

  if (!isNeutral(layer.grade)) {
    const octx = out.getContext('2d');
    if (octx) {
      const img = octx.getImageData(0, 0, out.width, out.height);
      applyGrade(img, layer.grade);
      octx.putImageData(img, 0, 0);
    }
  }

  out = postEffects(out, layer);
  const styled = withStyles(out, layer, drawScale);
  // Report the margin in page units for the scale we actually drew at.
  return { canvas: styled.canvas, margin: styled.margin * (scale / drawScale) };
}

export interface RenderRequest {
  page: Page;
  canvas: HTMLCanvasElement;
  assets: AssetMap;
  scale: number;
}

export async function renderPage({ page, canvas, assets, scale }: RenderRequest): Promise<void> {
  const families = new Set<string>();
  for (const l of page.layers) if (l.type === 'text' && l.text) families.add(l.text.family);
  if (families.size) await ensureFonts([...families]);

  const w = Math.max(1, Math.round(page.width * scale));
  const h = Math.max(1, Math.round(page.height * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';

  if (page.bgAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(page.bgAlpha / 100, 0, 1);
    ctx.fillStyle = page.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  for (const layer of page.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const rendered = renderLayerToCanvas(layer, assets, scale);
    if (!rendered) continue;
    const { canvas: lc, margin } = rendered;
    const lw = (layer.w + margin * 2) * scale;
    const lh = (layer.h + margin * 2) * scale;
    ctx.save();
    ctx.globalAlpha = clamp(layer.opacity / 100, 0, 1);
    ctx.globalCompositeOperation = layer.blend;
    ctx.translate((layer.x + layer.w / 2) * scale, (layer.y + layer.h / 2) * scale);
    if (layer.rotate) ctx.rotate((layer.rotate * Math.PI) / 180);
    if (layer.flipX || layer.flipY) ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1);
    ctx.drawImage(lc, -lw / 2, -lh / 2, lw, lh);
    ctx.restore();
  }

  if (!isNeutral(page.grade)) {
    const img = ctx.getImageData(0, 0, w, h);
    applyGrade(img, page.grade);
    ctx.putImageData(img, 0, 0);
  }
}

export async function renderPageToDataURL(
  page: Page,
  assets: AssetMap,
  scale: number,
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.92,
): Promise<string> {
  const canvas = document.createElement('canvas');
  await renderPage({ page, canvas, assets, scale });
  return canvas.toDataURL(format, quality);
}

export async function renderPageToBlob(
  page: Page,
  assets: AssetMap,
  scale: number,
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.92,
): Promise<Blob | null> {
  const result = await exportPage(page, assets, scale, format, quality);
  return result ? result.blob : null;
}

export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  scale: number;
  /** true when the output came out as one flat colour although layers were visible */
  flat: boolean;
}

/**
 * Renders a page for download. Keeps the target canvas inside a size the browser will
 * actually honour, and reports when the result came back as a single flat colour so the
 * editor can say so instead of handing over a blank file.
 */
export async function exportPage(
  page: Page,
  assets: AssetMap,
  scale: number,
  format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  quality = 0.92,
): Promise<ExportResult | null> {
  const MAX_PIXELS = 44_000_000;
  let s = scale;
  if (page.width * page.height * s * s > MAX_PIXELS) {
    s = Math.sqrt(MAX_PIXELS / (page.width * page.height));
  }

  const canvas = document.createElement('canvas');
  await renderPage({ page, canvas, assets, scale: s });
  if (canvas.width < 2 || canvas.height < 2) return null;

  let usedScale = s;
  const visible = page.layers.filter((l) => l.visible && l.opacity > 0);

  const isFlat = (target: HTMLCanvasElement): boolean => {
    if (!visible.length) return false;
    try {
      const probe = document.createElement('canvas');
      probe.width = 24;
      probe.height = 24;
      const pctx = probe.getContext('2d');
      if (!pctx) return false;
      pctx.drawImage(target, 0, 0, 24, 24);
      const d = pctx.getImageData(0, 0, 24, 24).data;
      for (let i = 4; i < d.length; i += 4) {
        if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  let flat = isFlat(canvas);
  if (flat && visible.length) {
    // Layers present but nothing drew: almost always the browser refusing a canvas this
    // large. Render again smaller so the file has the artwork rather than a flat field.
    const retryScale = Math.max(0.05, usedScale * 0.5);
    const retry = document.createElement('canvas');
    await renderPage({ page, canvas: retry, assets, scale: retryScale });
    if (retry.width >= 2 && retry.height >= 2 && !isFlat(retry)) {
      const retryBlob = await new Promise<Blob | null>((res) =>
        retry.toBlob((b) => res(b), format, quality),
      );
      if (retryBlob) {
        return {
          blob: retryBlob,
          width: retry.width,
          height: retry.height,
          scale: retryScale,
          flat: false,
        };
      }
    }
  }

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob((b) => res(b), format, quality),
  );
  if (!blob) return null;

  return { blob, width: canvas.width, height: canvas.height, scale: usedScale, flat };
}

export async function makeThumb(doc: Doc, assets: AssetMap, maxSide = 520): Promise<string> {
  const page = doc.pages[0];
  if (!page) return '';
  const scale = Math.min(maxSide / page.width, maxSide / page.height, 1);
  const canvas = document.createElement('canvas');
  await renderPage({ page, canvas, assets, scale });
  return canvas.toDataURL('image/jpeg', 0.82);
}

/** Full-resolution composite of one page, used by the wand, clone and auto tools. */
export async function renderPageToCanvas(
  page: Page,
  assets: AssetMap,
  scale = 1,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  await renderPage({ page, canvas, assets, scale });
  return canvas;
}

export async function pageToImageData(page: Page, assets: AssetMap): Promise<ImageData> {
  const canvas = await renderPageToCanvas(page, assets, 1);
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}
