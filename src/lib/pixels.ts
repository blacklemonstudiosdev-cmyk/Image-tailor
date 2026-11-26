/* Colour science: the pixel pipeline behind every adjustment, effect and export. */

import { CurvePoint, DEFAULT_LEVELS, Grade, GRADE_NUM_KEYS, HSL_CENTERS } from '../types';
import { clamp, hexToRgb, smoothstep } from './utils';

/* ------------------------------------------------------------------ */
/* curve maths                                                         */
/* ------------------------------------------------------------------ */

/** Monotone cubic (Fritsch–Carlson) interpolation through the control points. */
export function buildCurveLUT(points: CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const raw = [...points]
    .map((p) => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }))
    .sort((a, b) => a.x - b.x);

  // Two control points may end up on the same x while dragging; keep the last one.
  const pts: CurvePoint[] = [];
  for (const p of raw) {
    if (pts.length && Math.abs(pts[pts.length - 1].x - p.x) < 0.004) pts[pts.length - 1] = p;
    else pts.push(p);
  }

  if (pts.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const n = pts.length;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const dxs: number[] = [];
  const ms: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = Math.max(1e-6, xs[i + 1] - xs[i]);
    dxs.push(dx);
    ms.push((ys[i + 1] - ys[i]) / dx);
  }
  const t: number[] = new Array(n).fill(0);
  t[0] = ms[0];
  t[n - 1] = ms[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (ms[i - 1] * ms[i] <= 0) t[i] = 0;
    else t[i] = (ms[i - 1] + ms[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (ms[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / ms[i];
    const b = t[i + 1] / ms[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * ms[i];
      t[i + 1] = tau * b * ms[i];
    }
  }

  const sample = (x: number): number => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let seg = 0;
    while (seg < n - 2 && x > xs[seg + 1]) seg++;
    const h = dxs[seg];
    const u = (x - xs[seg]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1;
    const h10 = u3 - 2 * u2 + u;
    const h01 = -2 * u3 + 3 * u2;
    const h11 = u3 - u2;
    return h00 * ys[seg] + h10 * h * t[seg] + h01 * ys[seg + 1] + h11 * h * t[seg + 1];
  };

  for (let i = 0; i < 256; i++) lut[i] = clamp(sample(i / 255) * 255, 0, 255);
  return lut;
}

export function curveIsNeutral(points: CurvePoint[] | undefined): boolean {
  if (!points || points.length !== 2) return !points || points.length === 0;
  const [a, b] = points;
  return (
    Math.abs(a.x) < 1e-6 &&
    Math.abs(a.y) < 1e-6 &&
    Math.abs(b.x - 1) < 1e-6 &&
    Math.abs(b.y - 1) < 1e-6
  );
}

export function levelsAreNeutral(lv: Grade['levels'] | undefined): boolean {
  if (!lv) return true;
  return (
    lv.inBlack === DEFAULT_LEVELS.inBlack &&
    lv.inWhite === DEFAULT_LEVELS.inWhite &&
    lv.gamma === DEFAULT_LEVELS.gamma &&
    lv.outBlack === DEFAULT_LEVELS.outBlack &&
    lv.outWhite === DEFAULT_LEVELS.outWhite
  );
}

export function isNeutral(g: Grade | undefined): boolean {
  if (!g) return true;
  for (const k of GRADE_NUM_KEYS) {
    if (g[k] !== 0) return false;
  }
  if (g.hsl?.some((b) => b.h !== 0 || b.s !== 0 || b.l !== 0)) return false;
  if (!levelsAreNeutral(g.levels)) return false;
  if (!curveIsNeutral(g.curve)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, hn + 1 / 3), hue2rgb(p, q, hn), hue2rgb(p, q, hn - 1 / 3)];
}

function bandWeight(hueDeg: number, center: number): number {
  let d = Math.abs(hueDeg - center);
  if (d > 180) d = 360 - d;
  return 1 - smoothstep(12, 46, d);
}

/* ------------------------------------------------------------------ */
/* main grade                                                          */
/* ------------------------------------------------------------------ */

export function applyGrade(img: ImageData, g: Grade): void {
  if (isNeutral(g)) return;
  const data = img.data;
  const w = img.width;
  const h = img.height;

  /* ---- one LUT per channel: levels, exposure, whites/blacks, contrast, fade, curve ---- */
  const exposureGain = Math.pow(2, g.exposure / 55);
  const contrastF =
    g.contrast >= 0 ? 1 + (g.contrast / 100) * 1.4 : 1 + (g.contrast / 100) * 0.72;
  const fade = g.fade / 100;
  const whites = g.whites / 100;
  const blacks = g.blacks / 100;
  const t = g.temperature / 100;
  const tn = g.tint / 100;
  const mul = [(1 + t * 0.3) * (1 + tn * 0.1), 1 - tn * 0.18, (1 - t * 0.3) * (1 + tn * 0.1)];

  const lv = g.levels ?? DEFAULT_LEVELS;
  const curveLut = curveIsNeutral(g.curve) ? null : buildCurveLUT(g.curve);
  const ib = lv.inBlack / 255;
  const iw = lv.inWhite / 255;
  const ob = lv.outBlack / 255;
  const ow = lv.outWhite / 255;
  const gammaInv = 1 / Math.max(0.05, lv.gamma);

  const lut = new Uint8ClampedArray(768);
  for (let c = 0; c < 3; c++) {
    for (let v = 0; v < 256; v++) {
      let x = v / 255;
      if (!levelsAreNeutral(lv)) {
        x = clamp((x - ib) / Math.max(1e-4, iw - ib), 0, 1);
        if (gammaInv !== 1) x = Math.pow(x, gammaInv);
        x = ob + x * (ow - ob);
      }
      x = x * exposureGain * mul[c];
      if (whites) x += whites * 0.3 * Math.pow(clamp(x, 0, 1), 3);
      if (blacks) x += blacks * 0.3 * Math.pow(1 - clamp(x, 0, 1), 2.2);
      x = (x - 0.5) * contrastF + 0.5;
      if (fade) x = x * (1 - 0.34 * fade) + 0.16 * fade;
      let out = clamp(x, 0, 1);
      if (curveLut) out = curveLut[Math.round(clamp(out, 0, 1) * 255)] / 255;
      lut[c * 256 + v] = clamp(out * 255, 0, 255);
    }
  }

  const hue = g.hue;
  const doHue = hue !== 0;
  let m0 = 1, m1 = 0, m2 = 0, m3 = 0, m4 = 1, m5 = 0, m6 = 0, m7 = 0, m8 = 1;
  if (doHue) {
    const rad = (hue * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    m0 = 0.213 + c * 0.787 - s * 0.213;
    m1 = 0.715 - c * 0.715 - s * 0.715;
    m2 = 0.072 - c * 0.072 + s * 0.928;
    m3 = 0.213 - c * 0.213 + s * 0.143;
    m4 = 0.715 + c * 0.285 + s * 0.14;
    m5 = 0.072 - c * 0.072 - s * 0.283;
    m6 = 0.213 - c * 0.213 - s * 0.787;
    m7 = 0.715 - c * 0.715 + s * 0.715;
    m8 = 0.072 + c * 0.928 + s * 0.072;
  }

  const hslBands = g.hsl ?? [];
  const doHSL = hslBands.some((b) => b.h !== 0 || b.s !== 0 || b.l !== 0);
  const hi = g.highlights / 100;
  const sh = g.shadows / 100;
  const sat = g.saturation / 100;
  const vib = g.vibrance / 100;
  const splitAmt = g.splitAmount / 100;
  const [sr, sg, sb] = hexToRgb(g.splitShadow);
  const [hr, hg, hb] = hexToRgb(g.splitHighlight);
  const duoAmt = g.duotoneAmount / 100;
  const [dar, dag, dab] = hexToRgb(g.duotoneA);
  const [dbr, dbg, dbb] = hexToRgb(g.duotoneB);
  const levels = g.posterize >= 2 ? Math.round(g.posterize) : 0;
  const threshold = g.threshold > 0 ? g.threshold / 100 : 0;
  const vignette = g.vignette / 100;
  const grain = g.grain / 100;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy) || 1;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue;
    let r = lut[data[i]] / 255;
    let gg = lut[256 + data[i + 1]] / 255;
    let b = lut[512 + data[i + 2]] / 255;

    if (hi || sh) {
      const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      if (hi) {
        const m = smoothstep(0.45, 1.0, lum) * hi;
        const f = 1 + m * 0.62;
        r *= f;
        gg *= f;
        b *= f;
      }
      if (sh) {
        const m = (1 - smoothstep(0.0, 0.55, lum)) * sh;
        r += m * 0.2;
        gg += m * 0.2;
        b += m * 0.2;
      }
    }

    if (doHue) {
      const nr = r * m0 + gg * m1 + b * m2;
      const ng = r * m3 + gg * m4 + b * m5;
      const nb = r * m6 + gg * m7 + b * m8;
      r = nr;
      gg = ng;
      b = nb;
    }

    if (doHSL) {
      const hsl = rgbToHsl(clamp(r, 0, 1), clamp(gg, 0, 1), clamp(b, 0, 1));
      let hh = hsl[0];
      let ss = hsl[1];
      let ll = hsl[2];
      if (ss > 0.02) {
        let dh = 0;
        let ds = 0;
        let dl = 0;
        for (let k = 0; k < 8; k++) {
          const band = hslBands[k];
          if (!band || (band.h === 0 && band.s === 0 && band.l === 0)) continue;
          const weight = bandWeight(hh, HSL_CENTERS[k]);
          if (weight <= 0) continue;
          dh += band.h * weight;
          ds += band.s * weight;
          dl += band.l * weight;
        }
        if (dh) hh += dh * 0.36;
        if (ds) ss = clamp(ss * (1 + ds / 100), 0, 1);
        if (dl) ll = clamp(ll * (1 + dl / 160), 0, 1);
        const rgb = hslToRgb(hh, ss, ll);
        r = rgb[0];
        gg = rgb[1];
        b = rgb[2];
      }
    }

    if (sat || vib) {
      const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      if (sat) {
        const k = 1 + sat;
        r = lum + (r - lum) * k;
        gg = lum + (gg - lum) * k;
        b = lum + (b - lum) * k;
      }
      if (vib) {
        const mx = Math.max(r, gg, b);
        const mn = Math.min(r, gg, b);
        const cur = mx > 0 ? (mx - mn) / mx : 0;
        const k = 1 + vib * (1 - cur) * 1.25;
        r = lum + (r - lum) * k;
        gg = lum + (gg - lum) * k;
        b = lum + (b - lum) * k;
      }
    }

    if (splitAmt) {
      const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      const wS = (1 - smoothstep(0, 0.62, lum)) * splitAmt * 0.55;
      const wH = smoothstep(0.4, 1, lum) * splitAmt * 0.55;
      if (wS) {
        r += (sr / 255 - r) * wS;
        gg += (sg / 255 - gg) * wS;
        b += (sb / 255 - b) * wS;
      }
      if (wH) {
        r += (hr / 255 - r) * wH;
        gg += (hg / 255 - gg) * wH;
        b += (hb / 255 - b) * wH;
      }
    }

    if (duoAmt) {
      const lum = clamp(0.2126 * r + 0.7152 * gg + 0.0722 * b, 0, 1);
      const dr = (dar + (dbr - dar) * lum) / 255;
      const dg = (dag + (dbg - dag) * lum) / 255;
      const db = (dab + (dbb - dab) * lum) / 255;
      r += (dr - r) * duoAmt;
      gg += (dg - gg) * duoAmt;
      b += (db - b) * duoAmt;
    }

    if (levels) {
      r = Math.round(clamp(r, 0, 1) * levels) / levels;
      gg = Math.round(clamp(gg, 0, 1) * levels) / levels;
      b = Math.round(clamp(b, 0, 1) * levels) / levels;
    }

    if (threshold) {
      const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      const v = lum >= threshold ? 1 : 0;
      r = v;
      gg = v;
      b = v;
    }

    if (vignette) {
      const x = p % w;
      const y = (p - x) / w;
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const d = Math.sqrt(dx * dx + dy * dy);
      const f = 1 - smoothstep(0.28, 0.95, d) * vignette * 0.95;
      r *= f;
      gg *= f;
      b *= f;
    }

    if (grain) {
      let n = Math.imul(p ^ 0x9e3779b9, 0x85ebca6b);
      n = (n ^ (n >>> 13)) >>> 0;
      const noise = ((n % 1024) / 1024 - 0.5) * grain * 0.28;
      r += noise;
      gg += noise;
      b += noise;
    }

    data[i] = r * 255;
    data[i + 1] = gg * 255;
    data[i + 2] = b * 255;
  }

  if (g.sharpen > 0) unsharp(img, (g.sharpen / 100) * 1.5, 1);
  if (g.clarity !== 0) unsharp(img, (g.clarity / 100) * 1.05, Math.max(2, Math.round(w / 320)));
  if (g.edges > 0) edgeDetect(img, g.edges / 100);
  if (g.emboss > 0) emboss(img, g.emboss / 100);
}

/* ------------------------------------------------------------------ */
/* convolution helpers                                                 */
/* ------------------------------------------------------------------ */

function boxBlurRGB(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const tmp = new Uint8ClampedArray(src.length);
  const size = r * 2 + 1;

  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      const row = y * w;
      for (let i = -r; i <= r; i++) {
        const x = clamp(i, 0, w - 1);
        sum += src[(row + x) * 4 + c];
      }
      for (let x = 0; x < w; x++) {
        tmp[(row + x) * 4 + c] = sum / size;
        const addX = clamp(x + r + 1, 0, w - 1);
        const subX = clamp(x - r, 0, w - 1);
        sum += src[(row + addX) * 4 + c] - src[(row + subX) * 4 + c];
      }
    }
  }

  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) {
        const y = clamp(i, 0, h - 1);
        sum += tmp[(y * w + x) * 4 + c];
      }
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = sum / size;
        const addY = clamp(y + r + 1, 0, h - 1);
        const subY = clamp(y - r, 0, h - 1);
        sum += tmp[(addY * w + x) * 4 + c] - tmp[(subY * w + x) * 4 + c];
      }
    }
  }

  for (let i = 3; i < out.length; i += 4) out[i] = src[i];
  return out;
}

function unsharp(img: ImageData, amount: number, radius: number) {
  if (Math.abs(amount) < 0.001) return;
  const blurred = boxBlurRGB(img.data, img.width, img.height, Math.max(1, radius));
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] + (d[i] - blurred[i]) * amount;
    d[i + 1] = d[i + 1] + (d[i + 1] - blurred[i + 1]) * amount;
    d[i + 2] = d[i + 2] + (d[i + 2] - blurred[i + 2]) * amount;
  }
}

/** Public unsharp mask, used after fast canvas upscales. */
export function sharpenInPlace(img: ImageData, amount: number, radius = 2) {
  unsharp(img, amount, radius);
}

function edgeDetect(img: ImageData, amount: number) {
  const { data, width: w, height: h } = img;
  const src = new Uint8ClampedArray(data);
  const lum = (o: number) => 0.2126 * src[o] + 0.7152 * src[o + 1] + 0.0722 * src[o + 2];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const tl = lum(i - w * 4 - 4);
      const tc = lum(i - w * 4);
      const tr = lum(i - w * 4 + 4);
      const ml = lum(i - 4);
      const mr = lum(i + 4);
      const bl = lum(i + w * 4 - 4);
      const bc = lum(i + w * 4);
      const br = lum(i + w * 4 + 4);
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = Math.min(255, Math.hypot(gx, gy));
      const v = 255 - mag;
      data[i] += (v - data[i]) * amount;
      data[i + 1] += (v - data[i + 1]) * amount;
      data[i + 2] += (v - data[i + 2]) * amount;
    }
  }
}

function emboss(img: ImageData, amount: number) {
  const { data, width: w, height: h } = img;
  const src = new Uint8ClampedArray(data);
  const lum = (o: number) => 0.2126 * src[o] + 0.7152 * src[o + 1] + 0.0722 * src[o + 2];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const v =
        -2 * lum(i - w * 4 - 4) -
        lum(i - w * 4) +
        lum(i - w * 4 + 4) -
        lum(i - 4) +
        lum(i) +
        lum(i + 4) +
        lum(i + w * 4 - 4) +
        lum(i + w * 4) +
        2 * lum(i + w * 4 + 4);
      const e = clamp(v * 0.5 + 128, 0, 255);
      data[i] += (e - data[i]) * amount;
      data[i + 1] += (e - data[i + 1]) * amount;
      data[i + 2] += (e - data[i + 2]) * amount;
    }
  }
}

/* ------------------------------------------------------------------ */
/* image analysis (histogram, auto tone, auto white balance)           */
/* ------------------------------------------------------------------ */

export interface ImageStats {
  /** 64 bins of normalised luminance */
  histogram: number[];
  meanR: number;
  meanG: number;
  meanB: number;
  /** 0..1 luminance at the 1st and 99th percentile */
  low: number;
  high: number;
}

export function analyseImage(img: ImageData, sampleStep = 3): ImageStats {
  const { data, width: w, height: h } = img;
  const bins = new Array(64).fill(0);
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(sampleStep));

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 8) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      sr += r;
      sg += g;
      sb += b;
      count++;
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      bins[Math.min(63, Math.floor(l * 64))]++;
    }
  }

  if (!count) {
    return { histogram: bins, meanR: 0.5, meanG: 0.5, meanB: 0.5, low: 0, high: 1 };
  }

  let acc = 0;
  let low = 0;
  let high = 1;
  const targetLow = count * 0.01;
  const targetHigh = count * 0.99;
  for (let i = 0; i < 64; i++) {
    acc += bins[i];
    if (acc >= targetLow && low === 0) low = i / 64;
    if (acc >= targetHigh) {
      high = (i + 1) / 64;
      break;
    }
  }

  return {
    histogram: bins,
    meanR: sr / count / 255,
    meanG: sg / count / 255,
    meanB: sb / count / 255,
    low,
    high,
  };
}

/* ------------------------------------------------------------------ */
/* high quality resampling (upscale)                                   */
/* ------------------------------------------------------------------ */

function sinc(x: number): number {
  if (x === 0) return 1;
  const a = Math.PI * x;
  return Math.sin(a) / a;
}

function lanczosKernel(x: number, lobes: number): number {
  if (x <= -lobes || x >= lobes) return 0;
  return sinc(x) * sinc(x / lobes);
}

/** Separable Lanczos-3 resample. Used by the Upscale tool and high-quality exports. */
export function lanczosResize(src: ImageData, dw: number, dh: number, lobes = 3): ImageData {
  const sw = src.width;
  const sh = src.height;
  const s = src.data;

  const tmp = new Uint8ClampedArray(dw * sh * 4);
  const xScale = sw / dw;
  const xSupport = Math.max(1, xScale) * lobes;

  for (let y = 0; y < sh; y++) {
    const rowOff = y * sw * 4;
    for (let x = 0; x < dw; x++) {
      const center = (x + 0.5) * xScale - 0.5;
      const left = Math.max(0, Math.floor(center - xSupport));
      const right = Math.min(sw - 1, Math.ceil(center + xSupport));
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let i = left; i <= right; i++) {
        const wgt = lanczosKernel((i - center) / Math.max(1, xScale), lobes);
        if (wgt === 0) continue;
        const o = rowOff + i * 4;
        r += s[o] * wgt;
        g += s[o + 1] * wgt;
        b += s[o + 2] * wgt;
        a += s[o + 3] * wgt;
        wsum += wgt;
      }
      const o = (y * dw + x) * 4;
      const inv = wsum || 1;
      tmp[o] = r / inv;
      tmp[o + 1] = g / inv;
      tmp[o + 2] = b / inv;
      tmp[o + 3] = a / inv;
    }
  }

  const out = new ImageData(dw, dh);
  const od = out.data;
  const yScale = sh / dh;
  const ySupport = Math.max(1, yScale) * lobes;

  for (let x = 0; x < dw; x++) {
    for (let y = 0; y < dh; y++) {
      const center = (y + 0.5) * yScale - 0.5;
      const top = Math.max(0, Math.floor(center - ySupport));
      const bottom = Math.min(sh - 1, Math.ceil(center + ySupport));
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let j = top; j <= bottom; j++) {
        const wgt = lanczosKernel((j - center) / Math.max(1, yScale), lobes);
        if (wgt === 0) continue;
        const o = (j * dw + x) * 4;
        r += tmp[o] * wgt;
        g += tmp[o + 1] * wgt;
        b += tmp[o + 2] * wgt;
        a += tmp[o + 3] * wgt;
        wsum += wgt;
      }
      const o = (y * dw + x) * 4;
      const inv = wsum || 1;
      od[o] = r / inv;
      od[o + 1] = g / inv;
      od[o + 2] = b / inv;
      od[o + 3] = a / inv;
    }
  }
  return out;
}

/** Detail-preserving upscale: Lanczos + progressive unsharp. */
export function enhanceUpscale(src: ImageData, factor: number): ImageData {
  const dw = Math.round(src.width * factor);
  const dh = Math.round(src.height * factor);
  const out = lanczosResize(src, dw, dh);
  const radius = Math.max(1, Math.round(factor / 2));
  const blurred = boxBlurRGB(out.data, dw, dh, radius);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] + (d[i] - blurred[i]) * 0.55;
    d[i + 1] = d[i + 1] + (d[i + 1] - blurred[i + 1]) * 0.55;
    d[i + 2] = d[i + 2] + (d[i + 2] - blurred[i + 2]) * 0.55;
  }
  return out;
}
