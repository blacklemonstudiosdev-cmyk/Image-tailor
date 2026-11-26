import { CursorInfo, Doc, Grade, Layer, Page, SelectionMode } from '../types';
import { AssetMap } from '../lib/render';

export type Tool =
  | 'move'
  | 'marquee'
  | 'ellipse'
  | 'lasso'
  | 'wand'
  | 'crop'
  | 'brush'
  | 'erase'
  | 'clone'
  | 'gradient'
  | 'text'
  | 'shape'
  | 'eyedrop'
  | 'hand'
  | 'zoom';

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SelectionState {
  /** page-resolution mask canvas: white where selected */
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
}

export interface EditorApi {
  doc: Doc;
  page: Page;
  pageIndex: number;
  assets: AssetMap;
  tool: Tool;
  zoom: number;
  pan: { x: number; y: number };
  selectedIds: string[];
  selected: Layer | null;
  brushSize: number;
  cloneAnchor: { x: number; y: number } | null;
  gradeTarget: 'layer' | 'page';
  crop: CropRect | null;
  remoteCursor: CursorInfo | null;
  selection: SelectionState | null;
  selectionMode: SelectionMode;
  wandTolerance: number;
  showGrid: boolean;
  snap: boolean;
  pickedColor: string;
  histogram: number[] | null;
  canUndo: boolean;
  canRedo: boolean;

  setTool: (t: Tool) => void;
  setZoom: (z: number) => void;
  setPan: (p: { x: number; y: number }) => void;
  setPageIndex: (i: number) => void;
  select: (ids: string[]) => void;
  setBrushSize: (n: number) => void;
  setGradeTarget: (t: 'layer' | 'page') => void;
  setCrop: (c: CropRect | null) => void;
  setSelectionMode: (m: SelectionMode) => void;
  setWandTolerance: (n: number) => void;
  setShowGrid: (v: boolean) => void;
  setSnap: (v: boolean) => void;
  setPickedColor: (c: string) => void;
  autoTone: () => void;
  autoWhiteBalance: () => void;
  history: { label: string; index: number }[];
  jumpHistory: (index: number) => void;

  mutate: (fn: (d: Doc) => void, label?: string) => void;
  updateLayer: (id: string, patch: Partial<Layer>, label?: string) => void;
  setGrade: (patch: Partial<Grade>, label?: string) => void;
  setPage: (patch: Partial<Page>, label?: string) => void;
  addLayer: (layer: Layer) => void;
  notify: (msg: string) => void;
  openTypeTab: () => void;
  reportCursor: (x: number, y: number) => void;

  /* selections */
  commitSelection: (mask: HTMLCanvasElement, box: CropRect, kind: string) => void;
  clearSelection: () => void;
  invertSelection: () => void;
  selectAll: () => void;
  magicWand: (x: number, y: number) => void;
  maskToSelection: () => void;
  fillSelection: (color: string) => void;
  deleteSelection: () => void;
  cropToSelection: () => void;

  /* raster tools that need a full-resolution composite */
  setCloneAnchor: (x: number, y: number) => void;
  cloneStroke: (
    points: { x: number; y: number }[],
    anchor: { x: number; y: number } | null,
  ) => void;
  paintStroke: (points: { x: number; y: number }[]) => void;
  sampleColor: (x: number, y: number) => void;
  dropGradient: (from: { x: number; y: number }, to: { x: number; y: number }) => void;
}
