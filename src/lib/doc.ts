import {
  defaultGrade,
  defaultStyle,
  Doc,
  GradientSpec,
  ImageSpec,
  Layer,
  LayerType,
  Page,
  ShapeSpec,
  TextSpec,
} from '../types';
import { measureTextLayer } from './render';
import { uid } from './utils';

export function newTextSpec(partial: Partial<TextSpec> = {}): TextSpec {
  return {
    content: 'Your text here',
    family: 'Panchang',
    weight: 800,
    size: 96,
    italic: false,
    underline: false,
    letterSpacing: 0,
    lineHeight: 1.15,
    align: 'left',
    transform: 'none',
    color: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadow: false,
    shadowColor: '#000000',
    shadowBlur: 24,
    shadowX: 0,
    shadowY: 8,
    ...partial,
  };
}

function baseLayer(
  type: LayerType,
  name: string,
  x: number,
  y: number,
  w: number,
  h: number,
): Layer {
  return {
    id: uid('l_'),
    name,
    type,
    visible: true,
    locked: false,
    opacity: 100,
    blend: 'source-over',
    x,
    y,
    w,
    h,
    rotate: 0,
    grade: defaultGrade(),
    mask: [],
    style: defaultStyle(),
  };
}

export function newImageLayer(
  x: number,
  y: number,
  w: number,
  h: number,
  image: ImageSpec,
  name = 'Image',
): Layer {
  const l = baseLayer('image', name, x, y, w, h);
  l.image = image;
  return l;
}

export function newTextLayer(x: number, y: number, w: number, text: Partial<TextSpec> = {}): Layer {
  const l = baseLayer('text', text.content ? text.content.slice(0, 24) : 'Text', x, y, w, 140);
  l.text = newTextSpec(text);
  return l;
}

export function newShapeLayer(
  x: number,
  y: number,
  w: number,
  h: number,
  shape: Partial<ShapeSpec> = {},
): Layer {
  const l = baseLayer('shape', 'Shape', x, y, w, h);
  l.shape = {
    kind: 'rect',
    fill: '#ffffff',
    stroke: '#ffffff',
    strokeWidth: 0,
    radius: 0,
    points: 5,
    ...shape,
  };
  return l;
}

export function newGradientLayer(
  w: number,
  h: number,
  gradient: Partial<GradientSpec> = {},
): Layer {
  const l = baseLayer('gradient', 'Gradient', 0, 0, w, h);
  l.style = undefined;
  l.gradient = {
    kind: 'linear',
    angle: 90,
    stopA: '#ffffff',
    stopB: '#000000',
    midpoint: 0.5,
    ...gradient,
  };
  return l;
}

export function newPage(width = 1600, height = 1000, name = 'Page 1'): Page {
  return {
    id: uid('p_'),
    name,
    width,
    height,
    bg: '#ffffff',
    bgAlpha: 100,
    grade: defaultGrade(),
    layers: [],
  };
}

export function newDoc(name: string, pages?: Page[]): Doc {
  return {
    id: uid('d_'),
    name,
    pages: pages && pages.length ? pages : [newPage()],
    rev: 0,
    updatedAt: Date.now(),
  };
}

export function clone<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

export function cloneLayer(l: Layer, rename = false): Layer {
  const c = clone(l);
  c.id = uid('l_');
  if (rename) c.name = l.name + ' copy';
  return c;
}

export function clonePage(p: Page): Page {
  const c = clone(p);
  c.id = uid('p_');
  c.layers = c.layers.map((l) => cloneLayer(l, false));
  return c;
}

export function cloneDoc(d: Doc, name?: string): Doc {
  const c = clone(d);
  c.id = uid('d_');
  c.name = name ?? d.name;
  c.rev = 0;
  c.updatedAt = Date.now();
  return c;
}

export function findLayer(page: Page, id: string | null): Layer | undefined {
  if (!id) return undefined;
  return page.layers.find((l) => l.id === id);
}

/** All asset ids referenced anywhere in a document. */
export function docAssetIds(doc: Doc): string[] {
  const out = new Set<string>();
  for (const p of doc.pages) {
    for (const l of p.layers) {
      if (l.type === 'image' && l.image?.assetId) out.add(l.image.assetId);
      if (l.maskAsset) out.add(l.maskAsset);
    }
  }
  return [...out];
}

/** Fonts used anywhere in a document. */
export function docFontFamilies(doc: Doc): string[] {
  const out = new Set<string>();
  for (const p of doc.pages) {
    for (const l of p.layers) {
      if (l.type === 'text' && l.text?.family) out.add(l.text.family);
    }
  }
  return [...out];
}

/** Text boxes derive their height from the content, so it always fits. */
export function fitTextLayer(layer: Layer): void {
  if (layer.type !== 'text' || !layer.text) return;
  const measured = measureTextLayer(layer);
  layer.h = Math.max(20, Math.round(measured.h));
}

export function flipLayer(layer: Layer, axis: 'x' | 'y'): void {
  if (axis === 'x') layer.flipX = !layer.flipX;
  else layer.flipY = !layer.flipY;
}

/** Rotate a layer by ±90° about its own centre. */
export function rotateLayerQuarter(layer: Layer, dir: 1 | -1): void {
  const cx = layer.x + layer.w / 2;
  const cy = layer.y + layer.h / 2;
  const w = layer.h;
  const h = layer.w;
  layer.w = w;
  layer.h = h;
  layer.x = cx - w / 2;
  layer.y = cy - h / 2;
  layer.rotate = Math.round(((layer.rotate + dir * 90 + 540) % 360) - 180);
}

export function boundsOfLayers(
  layers: Layer[],
): { x: number; y: number; w: number; h: number } | null {
  if (!layers.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of layers) {
    minX = Math.min(minX, l.x);
    minY = Math.min(minY, l.y);
    maxX = Math.max(maxX, l.x + l.w);
    maxY = Math.max(maxY, l.y + l.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export const PAGE_PRESETS: { label: string; width: number; height: number }[] = [
  { label: 'Landscape 16:9', width: 1920, height: 1080 },
  { label: 'Portrait 4:5', width: 1200, height: 1500 },
  { label: 'Square 1:1', width: 1500, height: 1500 },
  { label: 'A4 Print', width: 2480, height: 3508 },
  { label: 'Social Story', width: 1080, height: 1920 },
  { label: 'Desktop 4K', width: 3840, height: 2160 },
];
