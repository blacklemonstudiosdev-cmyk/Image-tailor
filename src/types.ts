/* Image Tailor — core document model. */

export type BlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Colour Dodge' },
  { value: 'color-burn', label: 'Colour Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Colour' },
  { value: 'luminosity', label: 'Luminosity' },
];

export interface HSLBand {
  /** -100..100 */
  h: number;
  s: number;
  l: number;
}

export interface Levels {
  /** 0..254 */
  inBlack: number;
  /** 1..255 */
  inWhite: number;
  /** 0.10..4.00 */
  gamma: number;
  /** 0..255 */
  outBlack: number;
  /** 0..255 */
  outWhite: number;
}

export interface CurvePoint {
  /** 0..1 */
  x: number;
  /** 0..1 */
  y: number;
}

export const DEFAULT_LEVELS: Levels = {
  inBlack: 0,
  inWhite: 255,
  gamma: 1,
  outBlack: 0,
  outWhite: 255,
};

export const DEFAULT_CURVE: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

export type GradeNumberKey =
  | 'exposure'
  | 'contrast'
  | 'highlights'
  | 'shadows'
  | 'whites'
  | 'blacks'
  | 'temperature'
  | 'tint'
  | 'saturation'
  | 'vibrance'
  | 'hue'
  | 'fade'
  | 'clarity'
  | 'sharpen'
  | 'blur'
  | 'glow'
  | 'chroma'
  | 'vignette'
  | 'grain'
  | 'pixelate'
  | 'halftone'
  | 'scanlines'
  | 'posterize'
  | 'threshold'
  | 'motionBlur'
  | 'tiltShift'
  | 'edges'
  | 'emboss'
  | 'duotoneAmount'
  | 'splitAmount';

export interface Grade extends Record<GradeNumberKey, number> {
  duotoneA: string;
  duotoneB: string;
  splitShadow: string;
  splitHighlight: string;
  hsl: HSLBand[];
  levels: Levels;
  curve: CurvePoint[];
}

export const GRADE_NUM_KEYS: GradeNumberKey[] = [
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'whites',
  'blacks',
  'temperature',
  'tint',
  'saturation',
  'vibrance',
  'hue',
  'fade',
  'clarity',
  'sharpen',
  'blur',
  'glow',
  'chroma',
  'vignette',
  'grain',
  'pixelate',
  'halftone',
  'scanlines',
  'posterize',
  'threshold',
  'motionBlur',
  'tiltShift',
  'edges',
  'emboss',
  'duotoneAmount',
  'splitAmount',
];

export function defaultGrade(): Grade {
  const g: Record<string, unknown> = {
    duotoneA: '#f2f2f2',
    duotoneB: '#080808',
    splitShadow: '#12263c',
    splitHighlight: '#ffc48a',
    hsl: Array.from({ length: 8 }, () => ({ h: 0, s: 0, l: 0 })),
    levels: { ...DEFAULT_LEVELS },
    curve: DEFAULT_CURVE.map((p) => ({ ...p })),
  };
  for (const k of GRADE_NUM_KEYS) g[k] = 0;
  return g as unknown as Grade;
}

export const HSL_BANDS = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Magenta'];
export const HSL_CENTERS = [0, 32, 60, 120, 180, 240, 285, 325];

export interface SliderDef {
  key: GradeNumberKey;
  label: string;
  min: number;
  max: number;
  step?: number;
  def?: number;
}

export interface SliderGroup {
  id: string;
  label: string;
  sliders: SliderDef[];
}

export const GRADE_GROUPS: SliderGroup[] = [
  {
    id: 'light',
    label: 'Light',
    sliders: [
      { key: 'exposure', label: 'Exposure', min: -100, max: 100 },
      { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
      { key: 'highlights', label: 'Highlights', min: -100, max: 100 },
      { key: 'shadows', label: 'Shadows', min: -100, max: 100 },
      { key: 'whites', label: 'Whites', min: -100, max: 100 },
      { key: 'blacks', label: 'Blacks', min: -100, max: 100 },
    ],
  },
  {
    id: 'colour',
    label: 'Colour',
    sliders: [
      { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
      { key: 'tint', label: 'Tint', min: -100, max: 100 },
      { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
      { key: 'vibrance', label: 'Vibrance', min: -100, max: 100 },
      { key: 'hue', label: 'Hue Rotate', min: -180, max: 180 },
      { key: 'fade', label: 'Fade', min: 0, max: 100 },
    ],
  },
  {
    id: 'detail',
    label: 'Detail',
    sliders: [
      { key: 'clarity', label: 'Clarity', min: -100, max: 100 },
      { key: 'sharpen', label: 'Sharpen', min: 0, max: 100 },
      { key: 'blur', label: 'Blur', min: 0, max: 100 },
    ],
  },
  {
    id: 'fx',
    label: 'Effects',
    sliders: [
      { key: 'glow', label: 'Glow', min: 0, max: 100 },
      { key: 'chroma', label: 'Chromatic', min: 0, max: 100 },
      { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
      { key: 'grain', label: 'Grain', min: 0, max: 100 },
      { key: 'motionBlur', label: 'Motion Blur', min: 0, max: 100 },
      { key: 'tiltShift', label: 'Tilt Shift', min: 0, max: 100 },
      { key: 'edges', label: 'Edge Detect', min: 0, max: 100 },
      { key: 'emboss', label: 'Emboss', min: 0, max: 100 },
      { key: 'posterize', label: 'Posterize', min: 0, max: 24, step: 1 },
      { key: 'threshold', label: 'Threshold', min: 0, max: 100 },
      { key: 'pixelate', label: 'Pixelate', min: 0, max: 100 },
      { key: 'halftone', label: 'Halftone', min: 0, max: 100 },
      { key: 'scanlines', label: 'Scanlines', min: 0, max: 100 },
    ],
  },
];

export interface TextSpec {
  content: string;
  family: string;
  weight: number;
  size: number;
  italic: boolean;
  underline: boolean;
  letterSpacing: number;
  lineHeight: number;
  align: 'left' | 'center' | 'right';
  transform: 'none' | 'uppercase' | 'lowercase';
  color: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
}

export interface ImageSpec {
  assetId: string;
  naturalW: number;
  naturalH: number;
  fit: 'cover' | 'contain' | 'fill';
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'triangle' | 'star' | 'polygon' | 'arrow';

export interface ShapeSpec {
  kind: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  /** points for star / polygon */
  points: number;
}

export interface GradientSpec {
  kind: 'linear' | 'radial';
  /** degrees, for linear */
  angle: number;
  stopA: string;
  stopB: string;
  /** 0..1 position of the mid tone */
  midpoint: number;
}

export interface LayerShadowStyle {
  on: boolean;
  color: string;
  blur: number;
  x: number;
  y: number;
  opacity: number;
}

export interface LayerOutlineStyle {
  on: boolean;
  color: string;
  width: number;
}

export interface LayerStyle {
  shadow: LayerShadowStyle;
  outline: LayerOutlineStyle;
}

export function defaultStyle(): LayerStyle {
  return {
    shadow: { on: false, color: '#000000', blur: 24, x: 0, y: 10, opacity: 55 },
    outline: { on: false, color: '#ffffff', width: 6 },
  };
}

export interface MaskStroke {
  erase: boolean;
  /** brush diameter, in page pixels */
  size: number;
  /** flattened x,y pairs in layer-local 0..1 space */
  pts: number[];
}

export type LayerType = 'image' | 'text' | 'shape' | 'gradient';

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  flipX?: boolean;
  flipY?: boolean;
  grade: Grade;
  mask: MaskStroke[];
  /** an asset used as a luminance mask (white keeps, black cuts) */
  maskAsset?: string;
  style?: LayerStyle;
  image?: ImageSpec;
  text?: TextSpec;
  shape?: ShapeSpec;
  gradient?: GradientSpec;
}

export interface Page {
  id: string;
  name: string;
  width: number;
  height: number;
  bg: string;
  /** 0..100 */
  bgAlpha: number;
  grade: Grade;
  layers: Layer[];
}

export interface Doc {
  id: string;
  name: string;
  pages: Page[];
  rev: number;
  updatedAt: number;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumb: string;
  width: number;
  height: number;
  pages: number;
}

export interface CursorInfo {
  x: number;
  y: number;
  name: string;
  color: string;
}

export type SelectionMode = 'new' | 'add' | 'subtract';
