import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BLEND_MODES,
  BlendMode,
  CurvePoint,
  defaultGrade,
  defaultStyle,
  GRADE_GROUPS,
  Grade,
  HSL_BANDS,
  Layer,
  ShapeKind,
  SliderDef,
} from '../types';
import { ensureFont, FontOption } from '../lib/fonts';
import { buildCurveLUT } from '../lib/pixels';
import { PRESETS, gradeFromPreset } from '../lib/presets';
import { EditorApi } from './editorApi';
import { Btn, Check, ColorField, NumField, Section, Select, Slider } from './ui';

export type AlignMode =
  | 'left'
  | 'right'
  | 'hcenter'
  | 'top'
  | 'bottom'
  | 'vcenter'
  | 'distributeH'
  | 'distributeV';

/* ================================================================== */
/* Layers                                                              */
/* ================================================================== */

function LayersPanel({
  api,
  onFlip,
  onRotateLayer,
  onImportImage,
}: {
  api: EditorApi;
  onFlip: (axis: 'x' | 'y') => void;
  onRotateLayer: (dir: 1 | -1) => void;
  onImportImage: () => void;
}) {
  const page = api.page;
  const ordered = useMemo(() => [...page.layers].reverse(), [page.layers]);

  const move = (id: string, dir: -1 | 1) => {
    api.mutate((d) => {
      const layers = d.pages[api.pageIndex].layers;
      const i = layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= layers.length) return;
      const [item] = layers.splice(i, 1);
      layers.splice(j, 0, item);
    }, 'reorder');
  };

  return (
    <div className="panel">
      <Btn variant="solid" block onClick={onImportImage}>
        + Import image
      </Btn>
      <div className="row tight">
        <Btn size="sm" onClick={() => api.setTool('text')} title="Text tool">
          + Text
        </Btn>
        <Btn size="sm" onClick={() => api.setTool('shape')} title="Shape tool">
          + Shape
        </Btn>
        <Btn
          size="sm"
          onClick={() => {
            const p = api.page;
            const layer: Layer = {
              id: 'l_' + Math.random().toString(36).slice(2, 10),
              name: 'Fill',
              type: 'shape',
              visible: true,
              locked: false,
              opacity: 100,
              blend: 'source-over',
              x: 0,
              y: 0,
              w: p.width,
              h: p.height,
              rotate: 0,
              grade: defaultGrade(),
              mask: [],
              style: defaultStyle(),
              shape: {
                kind: 'rect',
                fill: '#111111',
                stroke: '#111111',
                strokeWidth: 0,
                radius: 0,
                points: 5,
              },
            };
            api.addLayer(layer);
          }}
        >
          + Fill
        </Btn>
      </div>

      <div className="layer-list">
        {ordered.length === 0 && <div className="hint">No layers yet. Import an image or add type.</div>}
        {ordered.map((l) => (
          <div
            key={l.id}
            className={'layer-row' + (api.selectedIds.includes(l.id) ? ' active' : '')}
            onClick={(e) => {
              if (e.shiftKey) {
                api.select(
                  api.selectedIds.includes(l.id)
                    ? api.selectedIds.filter((i) => i !== l.id)
                    : [...api.selectedIds, l.id],
                );
              } else api.select([l.id]);
            }}
          >
            <button
              className="layer-eye"
              title={l.visible ? 'Hide layer' : 'Show layer'}
              onClick={(e) => {
                e.stopPropagation();
                api.updateLayer(l.id, { visible: !l.visible }, 'visibility');
              }}
            >
              {l.visible ? '●' : '○'}
            </button>
            <span className="layer-name">{l.name}</span>
            {l.maskAsset && <span className="layer-lock">mask</span>}
            {l.locked && <span className="layer-lock">lock</span>}
            <span className="layer-kind">{l.type}</span>
          </div>
        ))}
      </div>

      {api.selected && (
        <>
          <div className="row tight">
            <Btn size="sm" onClick={() => move(api.selected!.id, 1)} title="Move up">
              ↑
            </Btn>
            <Btn size="sm" onClick={() => move(api.selected!.id, -1)} title="Move down">
              ↓
            </Btn>
            <Btn
              size="sm"
              onClick={() => {
                const src = api.selected!;
                api.mutate((d) => {
                  const layers = d.pages[api.pageIndex].layers;
                  const i = layers.findIndex((l) => l.id === src.id);
                  if (i < 0) return;
                  const copy = structuredClone(layers[i]);
                  copy.id = 'l_' + Math.random().toString(36).slice(2, 10);
                  copy.name = layers[i].name + ' copy';
                  copy.x += 18;
                  copy.y += 18;
                  layers.splice(i + 1, 0, copy);
                }, 'duplicate');
              }}
            >
              Duplicate
            </Btn>
            <Btn
              size="sm"
              variant="danger"
              onClick={() => {
                const ids = api.selectedIds;
                api.mutate((d) => {
                  const p = d.pages[api.pageIndex];
                  p.layers = p.layers.filter((l) => !ids.includes(l.id));
                }, 'delete');
                api.select([]);
              }}
            >
              Delete
            </Btn>
          </div>
          <div className="row tight">
            <Btn size="sm" title="Flip horizontally" onClick={() => onFlip('x')}>
              Flip H
            </Btn>
            <Btn size="sm" title="Flip vertically" onClick={() => onFlip('y')}>
              Flip V
            </Btn>
            <Btn size="sm" title="Rotate 90° left" onClick={() => onRotateLayer(-1)}>
              ⟲
            </Btn>
            <Btn size="sm" title="Rotate 90° right" onClick={() => onRotateLayer(1)}>
              ⟳
            </Btn>
          </div>
        </>
      )}

      <div className="divider" />
      <div className="row tight">
        <Check
          label="Lock selected"
          checked={!!api.selected?.locked}
          onChange={(v) => api.selected && api.updateLayer(api.selected.id, { locked: v }, 'lock')}
        />
      </div>
    </div>
  );
}

/* ================================================================== */
/* Histogram + curve editor                                            */
/* ================================================================== */

function HistogramView({ bins }: { bins: number[] | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = 236;
    const H = 62;
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = '100%';
    c.style.height = `${H}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);
    if (!bins) return;
    const max = Math.max(1, ...bins);
    const bw = W / bins.length;
    ctx.fillStyle = '#e8e8e8';
    bins.forEach((v, i) => {
      const h = (v / max) * (H - 4);
      ctx.fillRect(i * bw, H - h, Math.max(1, bw - 0.6), h);
    });
  }, [bins]);
  return <canvas ref={ref} style={{ display: 'block', width: '100%', border: '1px solid var(--line)' }} />;
}

function CurveEditor({
  points,
  onChange,
}: {
  points: CurvePoint[];
  onChange: (p: CurvePoint[]) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<number | null>(null);
  const SIZE = 238;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = SIZE * dpr;
    c.height = SIZE * dpr;
    c.style.width = '100%';
    c.style.height = `${SIZE}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.strokeStyle = '#1c1c1c';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((SIZE * i) / 4, 0);
      ctx.lineTo((SIZE * i) / 4, SIZE);
      ctx.moveTo(0, (SIZE * i) / 4);
      ctx.lineTo(SIZE, (SIZE * i) / 4);
      ctx.stroke();
    }
    ctx.strokeStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.moveTo(0, SIZE);
    ctx.lineTo(SIZE, 0);
    ctx.stroke();

    const lut = buildCurveLUT(points);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * SIZE;
      const y = SIZE - (lut[i] / 255) * SIZE;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    for (const p of points) {
      const x = p.x * SIZE;
      const y = SIZE - p.y * SIZE;
      ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
    }
  }, [points]);

  const commit = (next: CurvePoint[]) => {
    onChange(next.sort((a, b) => a.x - b.x));
  };

  const localPoint = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)),
      px: e.clientX - r.left,
      py: e.clientY - r.top,
    };
  };

  return (
    <canvas
      ref={ref}
      style={{ display: 'block', width: '100%', border: '1px solid var(--line)', touchAction: 'none' }}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
        const p = localPoint(e);
        let idx = -1;
        let best = 14;
        points.forEach((pt, i) => {
          const d = Math.hypot(pt.x * SIZE - p.px, pt.y * SIZE - (SIZE - p.py));
          if (d < best) {
            best = d;
            idx = i;
          }
        });
        if (e.altKey && idx > 0 && idx < points.length - 1) {
          commit(points.filter((_, i) => i !== idx));
          return;
        }
        if (idx < 0) {
          const next = [...points, { x: p.x, y: p.y }];
          commit(next);
          dragging.current = next.findIndex((q) => q.x === p.x && q.y === p.y);
        } else {
          dragging.current = idx;
        }
      }}
      onPointerMove={(e) => {
        const idx = dragging.current;
        if (idx === null) return;
        const p = localPoint(e);
        const next = points.map((pt, i) => (i === idx ? { x: p.x, y: p.y } : pt));
        const sorted = [...next].sort((a, b) => a.x - b.x);
        const newIdx = sorted.findIndex((q) => q.x === p.x && q.y === p.y);
        dragging.current = newIdx >= 0 ? newIdx : idx;
        onChange(sorted);
      }}
      onPointerUp={() => {
        dragging.current = null;
      }}
      onPointerCancel={() => {
        dragging.current = null;
      }}
    />
  );
}

/* ================================================================== */
/* Adjust                                                              */
/* ================================================================== */

function hslPatch(g: Grade, band: number, key: 'h' | 's' | 'l', value: number): Grade['hsl'] {
  return g.hsl.map((b, i) => (i === band ? { ...b, [key]: value } : b));
}

function bandColor(i: number): string {
  const colors = ['#e04a4a', '#e08a3c', '#e0d43c', '#5cc45c', '#3cc4c4', '#3c6ce0', '#8a3ce0', '#e03ca8'];
  return colors[i] ?? '#555';
}

function AdjustPanel({ api }: { api: EditorApi }) {
  const [band, setBand] = useState(0);
  const target = api.gradeTarget === 'layer' ? api.selected?.grade : api.page.grade;
  const g = target ?? api.page.grade;
  const layerDisabled = !api.selected;
  const lv = g.levels ?? { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 };
  const curve = g.curve ?? [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];

  return (
    <div className="panel">
      <div className="row tight">
        <Btn
          size="sm"
          variant={api.gradeTarget === 'layer' ? 'solid' : 'ghost'}
          disabled={layerDisabled}
          onClick={() => api.setGradeTarget('layer')}
        >
          Layer
        </Btn>
        <Btn
          size="sm"
          variant={api.gradeTarget === 'page' ? 'solid' : 'ghost'}
          onClick={() => api.setGradeTarget('page')}
        >
          Canvas
        </Btn>
        <span className="spacer" />
        <Btn
          size="sm"
          variant="quiet"
          onClick={() => api.setGrade(gradeFromPreset(PRESETS[0]), 'reset-grade')}
          title="Reset adjustments"
        >
          Reset
        </Btn>
      </div>

      <HistogramView bins={api.histogram} />

      <div className="row tight">
        <Btn size="sm" onClick={api.autoTone}>
          Auto tone
        </Btn>
        <Btn size="sm" onClick={api.autoWhiteBalance}>
          Auto white balance
        </Btn>
      </div>

      <Section title="Levels" defaultOpen={false}>
        <Slider
          label="Input black"
          min={0}
          max={254}
          value={lv.inBlack}
          onChange={(v) => api.setGrade({ levels: { ...lv, inBlack: v } }, 'levels')}
          onReset={() => api.setGrade({ levels: { ...lv, inBlack: 0 } }, 'levels')}
        />
        <Slider
          label="Input white"
          min={1}
          max={255}
          value={lv.inWhite}
          onChange={(v) => api.setGrade({ levels: { ...lv, inWhite: v } }, 'levels')}
          onReset={() => api.setGrade({ levels: { ...lv, inWhite: 255 } }, 'levels')}
        />
        <Slider
          label="Gamma"
          min={0.1}
          max={3}
          step={0.01}
          value={lv.gamma}
          onChange={(v) => api.setGrade({ levels: { ...lv, gamma: v } }, 'levels')}
          onReset={() => api.setGrade({ levels: { ...lv, gamma: 1 } }, 'levels')}
          format={(v) => v.toFixed(2)}
        />
        <Slider
          label="Output black"
          min={0}
          max={255}
          value={lv.outBlack}
          onChange={(v) => api.setGrade({ levels: { ...lv, outBlack: v } }, 'levels')}
        />
        <Slider
          label="Output white"
          min={0}
          max={255}
          value={lv.outWhite}
          onChange={(v) => api.setGrade({ levels: { ...lv, outWhite: v } }, 'levels')}
        />
      </Section>

      <Section title="Curves" defaultOpen={false}>
        <CurveEditor
          points={curve}
          onChange={(p) => api.setGrade({ curve: p }, 'curve')}
        />
        <div className="row tight">
          <Btn
            size="sm"
            onClick={() =>
              api.setGrade(
                {
                  curve: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                  ],
                },
                'curve',
              )
            }
          >
            Reset curve
          </Btn>
          <Btn
            size="sm"
            onClick={() =>
              api.setGrade(
                {
                  curve: [
                    { x: 0, y: 0 },
                    { x: 0.25, y: 0.18 },
                    { x: 0.75, y: 0.82 },
                    { x: 1, y: 1 },
                  ],
                },
                'curve',
              )
            }
          >
            S-curve
          </Btn>
        </div>
        <span className="hint">Click to add a point, drag to bend, Option-click to remove.</span>
      </Section>

      <Section title="Looks">
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="preset"
              onClick={() => api.setGrade(gradeFromPreset(p), 'preset')}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Section>

      {GRADE_GROUPS.map((group) => (
        <Section key={group.id} title={group.label}>
          {group.sliders.map((s: SliderDef) => (
            <Slider
              key={s.key}
              label={s.label}
              min={s.min}
              max={s.max}
              step={s.step}
              value={g[s.key]}
              onChange={(v) => api.setGrade({ [s.key]: v } as Partial<Grade>, 'grade')}
              onReset={() => api.setGrade({ [s.key]: 0 } as Partial<Grade>, 'grade')}
            />
          ))}
        </Section>
      ))}

      <Section title="Colour mixer" defaultOpen={false}>
        <div className="swatches">
          {HSL_BANDS.map((name, i) => (
            <button
              key={name}
              className={'swatch' + (band === i ? ' active' : '')}
              title={name}
              style={{ background: bandColor(i) }}
              onClick={() => setBand(i)}
            />
          ))}
        </div>
        <span className="lbl">{HSL_BANDS[band]}</span>
        <Slider
          label="Hue"
          min={-100}
          max={100}
          value={g.hsl[band]?.h ?? 0}
          onChange={(v) => api.setGrade({ hsl: hslPatch(g, band, 'h', v) }, 'grade')}
          onReset={() => api.setGrade({ hsl: hslPatch(g, band, 'h', 0) }, 'grade')}
        />
        <Slider
          label="Saturation"
          min={-100}
          max={100}
          value={g.hsl[band]?.s ?? 0}
          onChange={(v) => api.setGrade({ hsl: hslPatch(g, band, 's', v) }, 'grade')}
          onReset={() => api.setGrade({ hsl: hslPatch(g, band, 's', 0) }, 'grade')}
        />
        <Slider
          label="Luminance"
          min={-100}
          max={100}
          value={g.hsl[band]?.l ?? 0}
          onChange={(v) => api.setGrade({ hsl: hslPatch(g, band, 'l', v) }, 'grade')}
          onReset={() => api.setGrade({ hsl: hslPatch(g, band, 'l', 0) }, 'grade')}
        />
      </Section>

      <Section title="Split toning" defaultOpen={false}>
        <Slider
          label="Strength"
          min={0}
          max={100}
          value={g.splitAmount}
          onChange={(v) => api.setGrade({ splitAmount: v }, 'grade')}
          onReset={() => api.setGrade({ splitAmount: 0 }, 'grade')}
        />
        <ColorField
          label="Shadows"
          value={g.splitShadow}
          onChange={(v) => api.setGrade({ splitShadow: v }, 'grade')}
        />
        <ColorField
          label="Highlights"
          value={g.splitHighlight}
          onChange={(v) => api.setGrade({ splitHighlight: v }, 'grade')}
        />
      </Section>

      <Section title="Duotone" defaultOpen={false}>
        <Slider
          label="Strength"
          min={0}
          max={100}
          value={g.duotoneAmount}
          onChange={(v) => api.setGrade({ duotoneAmount: v }, 'grade')}
          onReset={() => api.setGrade({ duotoneAmount: 0 }, 'grade')}
        />
        <div className="grid2">
          <ColorField label="Light" value={g.duotoneA} onChange={(v) => api.setGrade({ duotoneA: v }, 'grade')} />
          <ColorField label="Dark" value={g.duotoneB} onChange={(v) => api.setGrade({ duotoneB: v }, 'grade')} />
        </div>
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Selection                                                           */
/* ================================================================== */

function SelectionPanel({ api }: { api: EditorApi }) {
  const sel = api.selection;
  return (
    <div className="panel">
      <div className="row tight">
        <Btn size="sm" variant="solid" onClick={() => api.setTool('marquee')}>
          Marquee
        </Btn>
        <Btn size="sm" onClick={() => api.setTool('lasso')}>
          Lasso
        </Btn>
        <Btn size="sm" onClick={() => api.setTool('wand')}>
          Magic wand
        </Btn>
      </div>
      <div className="row tight">
        {(['new', 'add', 'subtract'] as const).map((m) => (
          <Btn
            key={m}
            size="sm"
            variant={api.selectionMode === m ? 'solid' : 'ghost'}
            onClick={() => api.setSelectionMode(m)}
          >
            {m === 'new' ? 'New' : m === 'add' ? 'Add' : 'Subtract'}
          </Btn>
        ))}
      </div>
      <div className="row tight">
        <Btn size="sm" onClick={api.selectAll}>
          Select all
        </Btn>
        <Btn size="sm" onClick={api.invertSelection}>
          Invert
        </Btn>
        <Btn size="sm" onClick={api.clearSelection}>
          Deselect
        </Btn>
      </div>

      {sel ? (
        <div className="banner">
          Selection {Math.round(sel.w)} × {Math.round(sel.h)} at {Math.round(sel.x)},{' '}
          {Math.round(sel.y)}
        </div>
      ) : (
        <div className="hint">Nothing selected. Marching ants appear over the canvas.</div>
      )}

      <div className="divider" />

      <Section title="Use the selection">
        <Btn size="sm" block disabled={!sel || !api.selected} onClick={api.deleteSelection}>
          Delete content from layer
        </Btn>
        <Btn size="sm" block disabled={!sel || !api.selected} onClick={api.maskToSelection}>
          Mask layer to selection
        </Btn>
        <Btn size="sm" block disabled={!sel} onClick={() => api.fillSelection(api.pickedColor)}>
          Fill with {api.pickedColor}
        </Btn>
        <Btn size="sm" block disabled={!sel} onClick={api.cropToSelection}>
          Crop canvas to selection
        </Btn>
      </Section>

      {!api.selected && (
        <span className="hint">
          Pick a layer in the Layers panel to delete or mask with the selection.
        </span>
      )}
    </div>
  );
}

/* ================================================================== */
/* Type                                                               */
/* ================================================================== */

function FontPicker({
  value,
  onPick,
  fonts,
}: {
  value: string;
  onPick: (family: string) => void;
  fonts: { itf: FontOption[]; google: FontOption[]; custom: FontOption[] };
}) {
  const [source, setSource] = useState<'itf' | 'google' | 'custom'>('itf');
  const [query, setQuery] = useState('');
  const [, force] = useState(0);

  const list = useMemo(() => {
    const arr = source === 'itf' ? fonts.itf : source === 'google' ? fonts.google : fonts.custom;
    const q = query.trim().toLowerCase();
    return q ? arr.filter((f) => f.family.toLowerCase().includes(q)) : arr;
  }, [source, query, fonts]);

  return (
    <div className="col">
      <div className="row tight">
        {(['itf', 'google', 'custom'] as const).map((s) => (
          <Btn key={s} size="sm" variant={source === s ? 'solid' : 'ghost'} onClick={() => setSource(s)}>
            {s === 'itf' ? 'ITF' : s === 'google' ? 'Google' : 'Yours'}
          </Btn>
        ))}
      </div>
      <input
        className="input"
        placeholder="Search, or type any family and press Enter"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === 'Enter' && query.trim()) {
            const name = query.trim();
            await ensureFont(name);
            onPick(name);
          }
        }}
      />
      <div className="font-list">
        {list.map((f) => (
          <button
            key={f.family}
            className={'font-item' + (value === f.family ? ' active' : '')}
            style={{ fontFamily: `"${f.family}", "Supreme", sans-serif` }}
            onMouseEnter={() => {
              void ensureFont(f.family).then((ok) => ok && force((n) => n + 1));
            }}
            onClick={async () => {
              await ensureFont(f.family);
              onPick(f.family);
            }}
          >
            <span>{f.family}</span>
            <span className="font-src">
              {f.source === 'itf' ? 'ITF' : f.source === 'google' ? 'GF' : 'Mine'}
            </span>
          </button>
        ))}
        {list.length === 0 && (
          <div className="hint" style={{ padding: 8 }}>
            No matches. Press Enter to load this exact name.
          </div>
        )}
      </div>
      <span className="hint">
        Indian Type Foundry faces stream from Fontshare. Anything else is pulled from Google Fonts.
      </span>
    </div>
  );
}

function TypePanel({
  api,
  fonts,
  onUploadFont,
}: {
  api: EditorApi;
  fonts: { itf: FontOption[]; google: FontOption[]; custom: FontOption[] };
  onUploadFont: (file: File) => void;
}) {
  const layer = api.selected;
  const fileRef = useRef<HTMLInputElement>(null);

  if (!layer || layer.type !== 'text' || !layer.text) {
    return (
      <div className="panel">
        <div className="hint">
          Pick the Type tool and click the canvas to place a text layer, or select an existing text
          layer to edit it here.
        </div>
        <Btn variant="solid" onClick={() => api.setTool('text')}>
          Place text
        </Btn>
        <div className="divider" />
        <span className="lbl">Load a font from your computer</span>
        <Btn onClick={() => fileRef.current?.click()}>Upload font file</Btn>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadFont(f);
            e.target.value = '';
          }}
        />
      </div>
    );
  }

  const t = layer.text;
  const set = (patch: Partial<typeof t>) =>
    api.updateLayer(layer.id, { text: { ...t, ...patch } }, 'type');

  return (
    <div className="panel">
      <div className="field">
        <label>Content</label>
        <textarea
          className="input"
          style={{ minHeight: 74 }}
          value={t.content}
          onChange={(e) => {
            const content = e.target.value;
            api.mutate((d) => {
              const l = d.pages[api.pageIndex].layers.find((x) => x.id === layer.id);
              if (!l || !l.text) return;
              l.text.content = content;
              l.name = content.slice(0, 22) || 'Text';
            }, 'type');
          }}
        />
      </div>

      <FontPicker value={t.family} onPick={(family) => set({ family })} fonts={fonts} />

      <div className="row tight">
        <Btn onClick={() => fileRef.current?.click()}>Upload font</Btn>
        <input
          ref={fileRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadFont(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="grid2">
        <NumField label="Size" value={t.size} min={4} max={2000} onChange={(size) => set({ size })} />
        <Select
          label="Weight"
          value={String(t.weight)}
          onChange={(v) => set({ weight: Number(v) })}
          options={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => ({
            value: String(w),
            label: String(w),
          }))}
        />
      </div>

      <div className="grid2">
        <Select
          label="Align"
          value={t.align}
          onChange={(v) => set({ align: v as 'left' | 'center' | 'right' })}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Centre' },
            { value: 'right', label: 'Right' },
          ]}
        />
        <Select
          label="Case"
          value={t.transform}
          onChange={(v) => set({ transform: v as 'none' | 'uppercase' | 'lowercase' })}
          options={[
            { value: 'none', label: 'As typed' },
            { value: 'uppercase', label: 'UPPERCASE' },
            { value: 'lowercase', label: 'lowercase' },
          ]}
        />
      </div>

      <Slider
        label="Letter spacing"
        min={-20}
        max={80}
        step={0.5}
        value={t.letterSpacing}
        onChange={(letterSpacing) => set({ letterSpacing })}
        onReset={() => set({ letterSpacing: 0 })}
      />
      <Slider
        label="Line height"
        min={0.6}
        max={3}
        step={0.01}
        value={t.lineHeight}
        onChange={(lineHeight) => set({ lineHeight })}
        onReset={() => set({ lineHeight: 1.15 })}
        format={(v) => v.toFixed(2)}
      />

      <div className="row tight">
        <Check label="Italic" checked={t.italic} onChange={(italic) => set({ italic })} />
        <Check label="Underline" checked={t.underline} onChange={(underline) => set({ underline })} />
      </div>

      <ColorField label="Fill" value={t.color} onChange={(color) => set({ color })} />
      <div className="grid2">
        <ColorField label="Stroke" value={t.strokeColor} onChange={(strokeColor) => set({ strokeColor })} />
        <NumField
          label="Width"
          value={t.strokeWidth}
          min={0}
          max={40}
          onChange={(strokeWidth) => set({ strokeWidth })}
        />
      </div>

      <div className="row tight">
        <Check label="Drop shadow" checked={t.shadow} onChange={(shadow) => set({ shadow })} />
      </div>
      {t.shadow && (
        <>
          <ColorField
            label="Shadow colour"
            value={t.shadowColor}
            onChange={(shadowColor) => set({ shadowColor })}
          />
          <Slider label="Blur" min={0} max={120} value={t.shadowBlur} onChange={(shadowBlur) => set({ shadowBlur })} />
          <div className="grid2">
            <NumField label="X" value={t.shadowX} onChange={(shadowX) => set({ shadowX })} />
            <NumField label="Y" value={t.shadowY} onChange={(shadowY) => set({ shadowY })} />
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* Canvas                                                             */
/* ================================================================== */

function CanvasPanel({
  api,
  onApplyCrop,
  onUpscale,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
}: {
  api: EditorApi;
  onApplyCrop: () => void;
  onUpscale: (factor: number) => void;
  onAddPage: () => void;
  onDuplicatePage: () => void;
  onDeletePage: () => void;
}) {
  const page = api.page;
  const [w, setW] = useState(page.width);
  const [h, setH] = useState(page.height);

  useEffect(() => {
    setW(page.width);
    setH(page.height);
  }, [page.width, page.height, page.id]);

  return (
    <div className="panel">
      <Section title="Canvas">
        <div className="grid2">
          <NumField label="W" value={w} min={16} max={12000} onChange={setW} />
          <NumField label="H" value={h} min={16} max={12000} onChange={setH} />
        </div>
        <div className="row tight">
          <Btn
            size="sm"
            variant="solid"
            onClick={() => api.setPage({ width: Math.round(w), height: Math.round(h) }, 'canvas')}
          >
            Resize
          </Btn>
          <Btn size="sm" onClick={() => api.setPage({ width: page.height, height: page.width }, 'canvas')}>
            Swap
          </Btn>
        </div>
        <ColorField label="Background" value={page.bg} onChange={(bg) => api.setPage({ bg }, 'canvas')} />
        <Slider
          label="Background opacity"
          min={0}
          max={100}
          value={page.bgAlpha}
          onChange={(bgAlpha) => api.setPage({ bgAlpha }, 'canvas')}
        />
      </Section>

      <Section title="Crop">
        <div className="row tight">
          <Btn size="sm" variant="solid" onClick={() => api.setTool('crop')}>
            Crop tool
          </Btn>
          <Btn size="sm" disabled={!api.crop} onClick={onApplyCrop}>
            Apply
          </Btn>
          <Btn size="sm" disabled={!api.crop} onClick={() => api.setCrop(null)}>
            Clear
          </Btn>
        </div>
        <span className="hint">
          Drag on the canvas to mark the crop, then apply. Every layer shifts with the frame.
        </span>
      </Section>

      <Section title="Upscale">
        <div className="row tight">
          <Btn size="sm" onClick={() => onUpscale(2)}>
            Upscale 2×
          </Btn>
          <Btn size="sm" onClick={() => onUpscale(4)}>
            Upscale 4×
          </Btn>
        </div>
        <span className="hint">
          Rebuilds the canvas at a larger size and re-samples every image layer with a Lanczos
          kernel plus a detail pass, so the extra pixels are real.
        </span>
      </Section>

      <Section title="Pages">
        <div className="row tight">
          <Btn size="sm" onClick={onAddPage}>
            Add page
          </Btn>
          <Btn size="sm" onClick={onDuplicatePage}>
            Duplicate
          </Btn>
          <Btn size="sm" variant="danger" disabled={api.doc.pages.length < 2} onClick={onDeletePage}>
            Delete
          </Btn>
        </div>
        <span className="hint">
          Page {api.pageIndex + 1} of {api.doc.pages.length}. Every page keeps its own layers and
          grade.
        </span>
      </Section>

      <Section title="View" defaultOpen={false}>
        <Check label="Thirds grid" checked={api.showGrid} onChange={api.setShowGrid} />
        <Check label="Snap to edges and centres" checked={api.snap} onChange={api.setSnap} />
      </Section>
    </div>
  );
}

/* ================================================================== */
/* Right — properties                                                  */
/* ================================================================== */

const ALIGN_BUTTONS: { mode: AlignMode; glyph: string; title: string }[] = [
  { mode: 'left', glyph: '⌐', title: 'Align left' },
  { mode: 'hcenter', glyph: '↔', title: 'Align horizontal centre' },
  { mode: 'right', glyph: '¬', title: 'Align right' },
  { mode: 'top', glyph: '☖', title: 'Align top' },
  { mode: 'vcenter', glyph: '↕', title: 'Align vertical centre' },
  { mode: 'bottom', glyph: '☗', title: 'Align bottom' },
  { mode: 'distributeH', glyph: '≡', title: 'Distribute horizontally' },
  { mode: 'distributeV', glyph: '⋮', title: 'Distribute vertically' },
];

export function PropertiesPanel({
  api,
  onUpscaleLayer,
  onAlign,
  onFlip,
  onRotateLayer,
}: {
  api: EditorApi;
  onUpscaleLayer: (f: number) => void;
  onAlign: (mode: AlignMode) => void;
  onFlip: (axis: 'x' | 'y') => void;
  onRotateLayer: (dir: 1 | -1) => void;
}) {
  const l = api.selected;
  const page = api.page;

  return (
    <div className="panel">
      {!l && (
        <Section title="Selection">
          <span className="hint">
            Nothing selected. Shift-click layers to work on several at once, then align or
            distribute them.
          </span>
        </Section>
      )}

      {api.selectedIds.length > 1 && (
        <Section title={`${api.selectedIds.length} layers`}>
          <div className="grid3">
            {ALIGN_BUTTONS.map((b) => (
              <Btn key={b.mode} size="sm" title={b.title} onClick={() => onAlign(b.mode)}>
                {b.glyph}
              </Btn>
            ))}
          </div>
        </Section>
      )}

      {l && (
        <>
          <Section title={l.type === 'image' ? 'Image layer' : l.type === 'text' ? 'Text layer' : l.type === 'gradient' ? 'Gradient layer' : 'Shape layer'}>
            <div className="field">
              <label>Name</label>
              <input
                className="input"
                value={l.name}
                onChange={(e) => api.updateLayer(l.id, { name: e.target.value }, 'prop')}
              />
            </div>
          </Section>

          <Section title="Transform">
            <div className="prop-grid">
              <NumField label="X" value={l.x} onChange={(x) => api.updateLayer(l.id, { x }, 'prop')} />
              <NumField label="Y" value={l.y} onChange={(y) => api.updateLayer(l.id, { y }, 'prop')} />
              <NumField label="W" value={l.w} min={4} onChange={(w) => api.updateLayer(l.id, { w }, 'prop')} />
              <NumField label="H" value={l.h} min={4} onChange={(h) => api.updateLayer(l.id, { h }, 'prop')} />
            </div>
            <Slider
              label="Rotation"
              min={-180}
              max={180}
              value={l.rotate}
              onChange={(rotate) => api.updateLayer(l.id, { rotate }, 'prop')}
              onReset={() => api.updateLayer(l.id, { rotate: 0 }, 'prop')}
              suffix="°"
            />
            <div className="row tight">
              <Btn size="sm" onClick={() => onFlip('x')}>
                Flip H
              </Btn>
              <Btn size="sm" onClick={() => onFlip('y')}>
                Flip V
              </Btn>
              <Btn size="sm" title="Rotate 90° left" onClick={() => onRotateLayer(-1)}>
                ⟲
              </Btn>
              <Btn size="sm" title="Rotate 90° right" onClick={() => onRotateLayer(1)}>
                ⟳
              </Btn>
            </div>
            <div className="row tight">
              <Btn
                size="sm"
                onClick={() =>
                  api.updateLayer(
                    l.id,
                    {
                      x: Math.round((page.width - l.w) / 2),
                      y: Math.round((page.height - l.h) / 2),
                    },
                    'prop',
                  )
                }
              >
                Centre
              </Btn>
              <Btn size="sm" onClick={() => api.updateLayer(l.id, { x: 0, y: 0 }, 'prop')}>
                Top left
              </Btn>
              <Btn
                size="sm"
                onClick={() => {
                  const s = Math.min(page.width / l.w, page.height / l.h);
                  api.updateLayer(
                    l.id,
                    {
                      w: Math.round(l.w * s),
                      h: Math.round(l.h * s),
                      x: Math.round((page.width - l.w * s) / 2),
                      y: Math.round((page.height - l.h * s) / 2),
                    },
                    'prop',
                  );
                }}
              >
                Fit
              </Btn>
              <Btn size="sm" onClick={() => onAlign('hcenter')}>
                Align H
              </Btn>
            </div>
          </Section>

          <Section title="Appearance">
            <Slider
              label="Opacity"
              min={0}
              max={100}
              value={l.opacity}
              onChange={(opacity) => api.updateLayer(l.id, { opacity }, 'prop')}
              onReset={() => api.updateLayer(l.id, { opacity: 100 }, 'prop')}
              suffix="%"
            />
            <Select
              label="Blend mode"
              value={l.blend}
              onChange={(v) => api.updateLayer(l.id, { blend: v as BlendMode }, 'prop')}
              options={BLEND_MODES.map((b) => ({ value: b.value, label: b.label }))}
            />
          </Section>

          <Section
            title="Layer style"
            defaultOpen={false}
          >
            {(() => {
              const style = l.style ?? defaultStyle();
              const setStyle = (patch: Partial<typeof style>) =>
                api.updateLayer(l.id, { style: { ...style, ...patch } }, 'style');
              return (
                <>
                  <Check
                    label="Drop shadow"
                    checked={style.shadow.on}
                    onChange={(on) => setStyle({ shadow: { ...style.shadow, on } })}
                  />
                  {style.shadow.on && (
                    <>
                      <ColorField
                        label="Colour"
                        value={style.shadow.color}
                        onChange={(color) => setStyle({ shadow: { ...style.shadow, color } })}
                      />
                      <Slider
                        label="Blur"
                        min={0}
                        max={200}
                        value={style.shadow.blur}
                        onChange={(blur) => setStyle({ shadow: { ...style.shadow, blur } })}
                      />
                      <Slider
                        label="Opacity"
                        min={0}
                        max={100}
                        value={style.shadow.opacity}
                        onChange={(opacity) => setStyle({ shadow: { ...style.shadow, opacity } })}
                        suffix="%"
                      />
                      <div className="grid2">
                        <NumField
                          label="X"
                          value={style.shadow.x}
                          onChange={(x) => setStyle({ shadow: { ...style.shadow, x } })}
                        />
                        <NumField
                          label="Y"
                          value={style.shadow.y}
                          onChange={(y) => setStyle({ shadow: { ...style.shadow, y } })}
                        />
                      </div>
                    </>
                  )}
                  <div className="divider" />
                  <Check
                    label="Outline"
                    checked={style.outline.on}
                    onChange={(on) => setStyle({ outline: { ...style.outline, on } })}
                  />
                  {style.outline.on && (
                    <>
                      <ColorField
                        label="Colour"
                        value={style.outline.color}
                        onChange={(color) => setStyle({ outline: { ...style.outline, color } })}
                      />
                      <Slider
                        label="Width"
                        min={1}
                        max={40}
                        value={style.outline.width}
                        onChange={(width) => setStyle({ outline: { ...style.outline, width } })}
                      />
                    </>
                  )}
                </>
              );
            })()}
          </Section>

          {l.type === 'image' && l.image && (
            <Section title="Image">
              <Select
                label="Fit"
                value={l.image.fit}
                onChange={(v) =>
                  api.updateLayer(
                    l.id,
                    { image: { ...l.image!, fit: v as 'cover' | 'contain' | 'fill' } },
                    'prop',
                  )
                }
                options={[
                  { value: 'cover', label: 'Cover — fill the box' },
                  { value: 'contain', label: 'Contain — show it all' },
                  { value: 'fill', label: 'Stretch' },
                ]}
              />
              <span className="hint mono">
                Source {l.image.naturalW} × {l.image.naturalH}
              </span>
              <div className="row tight">
                <Btn size="sm" onClick={() => onUpscaleLayer(2)}>
                  Sharpen ×2
                </Btn>
                <Btn size="sm" onClick={() => onUpscaleLayer(4)}>
                  ×4
                </Btn>
              </div>
            </Section>
          )}

          {l.type === 'gradient' && l.gradient && (
            <Section title="Gradient">
              <Select
                label="Type"
                value={l.gradient.kind}
                onChange={(v) =>
                  api.updateLayer(
                    l.id,
                    { gradient: { ...l.gradient!, kind: v as 'linear' | 'radial' } },
                    'prop',
                  )
                }
                options={[
                  { value: 'linear', label: 'Linear' },
                  { value: 'radial', label: 'Radial' },
                ]}
              />
              {l.gradient.kind === 'linear' && (
                <Slider
                  label="Angle"
                  min={-180}
                  max={180}
                  value={l.gradient.angle}
                  onChange={(angle) =>
                    api.updateLayer(l.id, { gradient: { ...l.gradient!, angle } }, 'prop')
                  }
                  suffix="°"
                />
              )}
              <ColorField
                label="Start"
                value={l.gradient.stopA}
                onChange={(stopA) =>
                  api.updateLayer(l.id, { gradient: { ...l.gradient!, stopA } }, 'prop')
                }
              />
              <ColorField
                label="End"
                value={l.gradient.stopB}
                onChange={(stopB) =>
                  api.updateLayer(l.id, { gradient: { ...l.gradient!, stopB } }, 'prop')
                }
              />
              <Slider
                label="Midpoint"
                min={0.05}
                max={0.95}
                step={0.01}
                value={l.gradient.midpoint}
                onChange={(midpoint) =>
                  api.updateLayer(l.id, { gradient: { ...l.gradient!, midpoint } }, 'prop')
                }
                format={(v) => v.toFixed(2)}
              />
            </Section>
          )}

          {l.type === 'shape' && l.shape && (
            <Section title="Shape">
              <Select
                label="Kind"
                value={l.shape.kind}
                onChange={(v) =>
                  api.updateLayer(l.id, { shape: { ...l.shape!, kind: v as ShapeKind } }, 'prop')
                }
                options={[
                  { value: 'rect', label: 'Rectangle' },
                  { value: 'ellipse', label: 'Ellipse' },
                  { value: 'triangle', label: 'Triangle' },
                  { value: 'polygon', label: 'Polygon' },
                  { value: 'star', label: 'Star' },
                  { value: 'arrow', label: 'Arrow' },
                  { value: 'line', label: 'Rule' },
                ]}
              />
              {(l.shape.kind === 'star' || l.shape.kind === 'polygon') && (
                <Slider
                  label="Points"
                  min={3}
                  max={24}
                  step={1}
                  value={l.shape.points ?? 5}
                  onChange={(points) =>
                    api.updateLayer(l.id, { shape: { ...l.shape!, points } }, 'prop')
                  }
                />
              )}
              <ColorField
                label="Fill"
                value={l.shape.fill}
                onChange={(fill) => api.updateLayer(l.id, { shape: { ...l.shape!, fill } }, 'prop')}
              />
              <ColorField
                label="Stroke"
                value={l.shape.stroke}
                onChange={(stroke) => api.updateLayer(l.id, { shape: { ...l.shape!, stroke } }, 'prop')}
              />
              <Slider
                label="Stroke width"
                min={0}
                max={80}
                value={l.shape.strokeWidth}
                onChange={(strokeWidth) =>
                  api.updateLayer(l.id, { shape: { ...l.shape!, strokeWidth } }, 'prop')
                }
              />
              <Slider
                label="Corner radius"
                min={0}
                max={200}
                value={l.shape.radius}
                onChange={(radius) => api.updateLayer(l.id, { shape: { ...l.shape!, radius } }, 'prop')}
              />
            </Section>
          )}

          <Section title="Mask" defaultOpen={false}>
            <span className="hint">
              {l.maskAsset
                ? 'This layer has a drawn mask from a selection.'
                : l.mask.length
                  ? `${l.mask.length} brush stroke${l.mask.length === 1 ? '' : 's'} on this layer.`
                  : 'No mask yet. Use the eraser, or a selection from the Select panel.'}
            </span>
            <div className="row tight">
              <Btn size="sm" disabled={!l.maskAsset} onClick={() => api.updateLayer(l.id, { maskAsset: undefined }, 'mask')}>
                Clear mask image
              </Btn>
              <Btn size="sm" disabled={!l.mask.length} onClick={() => api.updateLayer(l.id, { mask: l.mask.slice(0, -1) }, 'mask')}>
                Undo stroke
              </Btn>
              <Btn size="sm" disabled={!l.mask.length && !l.maskAsset} onClick={() => api.updateLayer(l.id, { mask: [], maskAsset: undefined }, 'mask')}>
                Clear all
              </Btn>
            </div>
          </Section>
        </>
      )}

      <Section title="History" defaultOpen={false}>
        <div className="history-list">
          {api.history.length === 0 && <span className="hint">Nothing done yet.</span>}
          {api.history
            .slice()
            .reverse()
            .map((h) => (
              <button
                key={`${h.index}-${h.label}`}
                className="history-item"
                onClick={() => api.jumpHistory(h.index)}
                title="Go back to this step"
              >
                {h.label}
              </button>
            ))}
        </div>
      </Section>
    </div>
  );
}

/* ================================================================== */

export function LeftPanel({
  api,
  tab,
  setTab,
  fonts,
  onUploadFont,
  onImportImage,
  onApplyCrop,
  onUpscale,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onFlip,
  onRotateLayer,
}: {
  api: EditorApi;
  tab: string;
  setTab: (t: string) => void;
  fonts: { itf: FontOption[]; google: FontOption[]; custom: FontOption[] };
  onUploadFont: (file: File) => void;
  onImportImage: () => void;
  onApplyCrop: () => void;
  onUpscale: (f: number) => void;
  onAddPage: () => void;
  onDuplicatePage: () => void;
  onDeletePage: () => void;
  onFlip: (axis: 'x' | 'y') => void;
  onRotateLayer: (dir: 1 | -1) => void;
}) {
  const tabs = [
    { id: 'layers', label: 'Layers' },
    { id: 'adjust', label: 'Adjust' },
    { id: 'select', label: 'Select' },
    { id: 'type', label: 'Type' },
    { id: 'canvas', label: 'Canvas' },
  ];
  return (
    <>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={'tab' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="side-body">
        {tab === 'layers' && (
          <LayersPanel
            api={api}
            onFlip={onFlip}
            onRotateLayer={onRotateLayer}
            onImportImage={onImportImage}
          />
        )}
        {tab === 'adjust' && <AdjustPanel api={api} />}
        {tab === 'select' && <SelectionPanel api={api} />}
        {tab === 'type' && <TypePanel api={api} fonts={fonts} onUploadFont={onUploadFont} />}
        {tab === 'canvas' && (
          <CanvasPanel
            api={api}
            onApplyCrop={onApplyCrop}
            onUpscale={onUpscale}
            onAddPage={onAddPage}
            onDuplicatePage={onDuplicatePage}
            onDeletePage={onDeletePage}
          />
        )}
      </div>
    </>
  );
}
