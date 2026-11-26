import { defaultGrade, Grade } from '../types';

export interface GradePreset {
  id: string;
  name: string;
  grade: Partial<Grade>;
}

export const PRESETS: GradePreset[] = [
  { id: 'none', name: 'Neutral', grade: {} },
  {
    id: 'cinema',
    name: 'Cinema',
    grade: {
      contrast: 14,
      highlights: -18,
      shadows: 16,
      saturation: -8,
      splitAmount: 34,
      splitShadow: '#123049',
      splitHighlight: '#ffb877',
      vignette: 18,
    },
  },
  {
    id: 'teal',
    name: 'Teal / Orange',
    grade: {
      contrast: 20,
      highlights: -12,
      shadows: 10,
      saturation: 10,
      temperature: 14,
      splitAmount: 52,
      splitShadow: '#0d3b46',
      splitHighlight: '#ff9640',
    },
  },
  {
    id: 'bleach',
    name: 'Bleach Bypass',
    grade: { contrast: 34, saturation: -46, clarity: 26, blacks: -12, whites: 8 },
  },
  {
    id: 'fade',
    name: 'Faded Film',
    grade: { contrast: -12, fade: 42, saturation: -14, grain: 16, splitAmount: 18 },
  },
  {
    id: 'kodak',
    name: 'Kodachrome',
    grade: {
      contrast: 18,
      saturation: 22,
      temperature: 12,
      highlights: -10,
      splitAmount: 22,
      splitShadow: '#141b3a',
      splitHighlight: '#ffd9a0',
    },
  },
  {
    id: 'noir',
    name: 'Noir',
    grade: { saturation: -100, contrast: 26, clarity: 18, vignette: 26, grain: 12 },
  },
  {
    id: 'portrait',
    name: 'Portrait Warm',
    grade: {
      exposure: 6,
      temperature: 10,
      tint: 6,
      highlights: -20,
      shadows: 14,
      vibrance: 16,
      saturation: -6,
      clarity: -10,
      splitHighlight: '#ffd6b0',
      splitAmount: 16,
    },
  },
  {
    id: 'cold',
    name: 'Cold Steel',
    grade: { temperature: -28, contrast: 16, saturation: -16, clarity: 14, splitAmount: 28, splitShadow: '#0b2038' },
  },
  {
    id: 'matte',
    name: 'Matte Pastel',
    grade: { fade: 34, contrast: -8, saturation: -12, vibrance: 12, shadows: 18, highlights: -14 },
  },
  {
    id: 'highkey',
    name: 'High Key',
    grade: { exposure: 18, highlights: 10, shadows: 26, contrast: -10, fade: 10 },
  },
  {
    id: 'lowkey',
    name: 'Low Key',
    grade: { exposure: -14, contrast: 22, blacks: -20, shadows: -16, vignette: 34 },
  },
  {
    id: 'duotone',
    name: 'Duotone Violet',
    grade: { duotoneAmount: 82, duotoneA: '#f4e6ff', duotoneB: '#181039', contrast: 10 },
  },
  {
    id: 'vintage',
    name: 'Vintage Print',
    grade: {
      temperature: 18,
      fade: 24,
      grain: 22,
      contrast: 8,
      saturation: -18,
      splitAmount: 30,
      splitShadow: '#3a2a12',
      splitHighlight: '#fff0c9',
    },
  },
  {
    id: 'cyber',
    name: 'Cyber',
    grade: { hue: -12, saturation: 26, contrast: 18, chroma: 22, glow: 14, splitAmount: 40, splitShadow: '#001a33', splitHighlight: '#ff2f8f' },
  },
  {
    id: 'print',
    name: 'Halftone Print',
    grade: { halftone: 46, contrast: 12, saturation: -20 },
  },
];

export function gradeFromPreset(preset: GradePreset): Grade {
  const g = defaultGrade();
  for (const [k, v] of Object.entries(preset.grade)) {
    if (v === undefined) continue;
    if (k === 'hsl') continue;
    (g as unknown as Record<string, unknown>)[k] = v;
  }
  return g;
}
