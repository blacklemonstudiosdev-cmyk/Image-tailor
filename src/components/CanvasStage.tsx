import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Layer } from '../types';
import { newShapeLayer, newTextLayer } from '../lib/doc';
import { renderPage } from '../lib/render';
import { clamp, hexToRgb } from '../lib/utils';
import { EditorApi } from './editorApi';

type Vec = { x: number; y: number };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const HANDLES: [string, number, number][] = [
  ['nw', 0, 0],
  ['n', 0.5, 0],
  ['ne', 1, 0],
  ['e', 1, 0.5],
  ['se', 1, 1],
  ['s', 0.5, 1],
  ['sw', 0, 1],
  ['w', 0, 0.5],
];

type Preview =
  | { kind: 'rect'; rect: Rect }
  | { kind: 'lasso'; pts: Vec[] }
  | { kind: 'gradient'; from: Vec; to: Vec }
  | { kind: 'clone'; pts: Vec[] }
  | { kind: 'paint'; pts: Vec[] }
  | null;

type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
  | { kind: 'move'; sx: number; sy: number; starts: { id: string; x: number; y: number }[] }
  | { kind: 'scale'; id: string; handle: string; start: Layer; pointer: Vec }
  | { kind: 'rotate'; id: string; center: Vec; startAngle: number; startRot: number }
  | { kind: 'brush'; id: string }
  | { kind: 'crop-move'; sx: number; sy: number; rect: Rect }
  | { kind: 'crop-scale'; handle: string; start: Rect; pointer: Vec }
  | { kind: 'marquee'; start: Vec; end: Vec; shape: 'rect' | 'ellipse'; mode: 'new' | 'add' | 'subtract' }
  | { kind: 'lasso'; pts: Vec[]; mode: 'new' | 'add' | 'subtract' }
  | { kind: 'gradientDrag'; from: Vec; end: Vec }
  | { kind: 'clone'; pts: Vec[] }
  | { kind: 'paint'; pts: Vec[] };

function worldOfLocal(
  l: { x: number; y: number; w: number; h: number; rotate: number },
  u: number,
  v: number,
): Vec {
  const cx = l.x + l.w / 2;
  const cy = l.y + l.h / 2;
  const a = (l.rotate * Math.PI) / 180;
  const lx = (u - 0.5) * l.w;
  const ly = (v - 0.5) * l.h;
  return { x: cx + lx * Math.cos(a) - ly * Math.sin(a), y: cy + lx * Math.sin(a) + ly * Math.cos(a) };
}

function toLocalPoint(
  l: { x: number; y: number; w: number; h: number; rotate: number },
  px: number,
  py: number,
): Vec {
  const cx = l.x + l.w / 2;
  const cy = l.y + l.h / 2;
  const a = (-l.rotate * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: dx * Math.cos(a) - dy * Math.sin(a) + l.w / 2,
    y: dx * Math.sin(a) + dy * Math.cos(a) + l.h / 2,
  };
}

function insideLayer(l: Layer, px: number, py: number): boolean {
  const p = toLocalPoint(l, px, py);
  return p.x >= 0 && p.y >= 0 && p.x <= l.w && p.y <= l.h;
}

function normaliseRect(r: Rect): Rect {
  const x = r.w < 0 ? r.x + r.w : r.x;
  const y = r.h < 0 ? r.y + r.h : r.y;
  return { x, y, w: Math.abs(r.w), h: Math.abs(r.h) };
}

function isLightBackground(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55;
}

export function CanvasStage({ api }: { api: EditorApi }) {
  const paintRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture>({ kind: 'none' });
  const renderToken = useRef(0);
  const [spaceDown, setSpaceDown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview>(null);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const [hover, setHover] = useState<Vec | null>(null);

  const page = api.page;
  const zoom = api.zoom;

  /* ---------------- paint ---------------- */

  useEffect(() => {
    const token = ++renderToken.current;
    const id = requestAnimationFrame(async () => {
      const canvas = paintRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const maxPixels = busy ? 8_000_000 : 34_000_000;
      let rs = zoom * dpr;
      const px = page.width * page.height * rs * rs;
      if (px > maxPixels) rs = Math.sqrt(maxPixels / (page.width * page.height));
      if (token !== renderToken.current) return;
      await renderPage({ page, canvas, assets: api.assets, scale: Math.max(0.01, rs) });
    });
    return () => cancelAnimationFrame(id);
  }, [page, api.assets, zoom, busy]);

  /* ---------------- overlay ---------------- */

  const drawOverlay = useCallback(() => {
    const c = overlayRef.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(page.width * zoom));
    const H = Math.max(1, Math.round(page.height * zoom));
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (api.showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo((page.width * i * zoom) / 3, 0);
        ctx.lineTo((page.width * i * zoom) / 3, H);
        ctx.moveTo(0, (page.height * i * zoom) / 3);
        ctx.lineTo(W, (page.height * i * zoom) / 3);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.moveTo(0, H / 2);
      ctx.lineTo(W, H / 2);
      ctx.stroke();
    }

    const sel = api.selection;
    if (sel) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.drawImage(sel.canvas, 0, 0, W, H);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(sel.x * zoom + 0.5, sel.y * zoom + 0.5, sel.w * zoom, sel.h * zoom);
      ctx.restore();
    }

    if (preview?.kind === 'rect') {
      const r = normaliseRect(preview.rect);
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x * zoom, r.y * zoom, r.w * zoom, r.h * zoom);
      ctx.restore();
    }
    if (preview?.kind === 'lasso') {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      preview.pts.forEach((p, i) =>
        i ? ctx.lineTo(p.x * zoom, p.y * zoom) : ctx.moveTo(p.x * zoom, p.y * zoom),
      );
      ctx.stroke();
      ctx.restore();
    }
    if (preview?.kind === 'gradient') {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(preview.from.x * zoom, preview.from.y * zoom);
      ctx.lineTo(preview.to.x * zoom, preview.to.y * zoom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(preview.from.x * zoom, preview.from.y * zoom, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(preview.to.x * zoom, preview.to.y * zoom, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (preview?.kind === 'paint') {
      ctx.save();
      ctx.strokeStyle = api.pickedColor;
      ctx.globalAlpha = 0.92;
      ctx.lineWidth = Math.max(1, api.brushSize * zoom);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      preview.pts.forEach((p, i) =>
        i ? ctx.lineTo(p.x * zoom, p.y * zoom) : ctx.moveTo(p.x * zoom, p.y * zoom),
      );
      if (preview.pts.length === 1) {
        ctx.lineTo(preview.pts[0].x * zoom + 0.01, preview.pts[0].y * zoom);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (hover && (api.tool === 'brush' || api.tool === 'erase' || api.tool === 'clone')) {
      const radius = Math.max(2, (api.brushSize / 2) * zoom);
      ctx.save();
      ctx.beginPath();
      ctx.arc(hover.x * zoom, hover.y * zoom, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (api.tool === 'brush') {
        ctx.beginPath();
        ctx.arc(hover.x * zoom, hover.y * zoom, Math.max(1.5, radius * 0.14), 0, Math.PI * 2);
        ctx.fillStyle = api.pickedColor;
        ctx.fill();
      }
      ctx.restore();
    }

    if (api.cloneAnchor) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(
        api.cloneAnchor.x * zoom,
        api.cloneAnchor.y * zoom,
        Math.max(3, (api.brushSize / 2) * zoom),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(api.cloneAnchor.x * zoom - 6, api.cloneAnchor.y * zoom);
      ctx.lineTo(api.cloneAnchor.x * zoom + 6, api.cloneAnchor.y * zoom);
      ctx.moveTo(api.cloneAnchor.x * zoom, api.cloneAnchor.y * zoom - 6);
      ctx.lineTo(api.cloneAnchor.x * zoom, api.cloneAnchor.y * zoom + 6);
      ctx.stroke();
      ctx.restore();
    }

    if (guides.x !== undefined) {
      ctx.strokeStyle = 'rgba(120,220,255,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(guides.x * zoom + 0.5, 0);
      ctx.lineTo(guides.x * zoom + 0.5, H);
      ctx.stroke();
    }
    if (guides.y !== undefined) {
      ctx.strokeStyle = 'rgba(120,220,255,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, guides.y * zoom + 0.5);
      ctx.lineTo(W, guides.y * zoom + 0.5);
      ctx.stroke();
    }

    const selected = page.layers.filter((l) => api.selectedIds.includes(l.id));
    for (const l of selected) {
      const corners = [
        worldOfLocal(l, 0, 0),
        worldOfLocal(l, 1, 0),
        worldOfLocal(l, 1, 1),
        worldOfLocal(l, 0, 1),
      ].map((q) => ({ x: q.x * zoom, y: q.y * zoom }));
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      corners.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.stroke();
    }

    if (selected.length === 1 && !selected[0].locked && api.tool === 'move') {
      const l = selected[0];
      const top = worldOfLocal(l, 0.5, 0);
      const centre = worldOfLocal(l, 0.5, 0.5);
      const dx = top.x - centre.x;
      const dy = top.y - centre.y;
      const len = Math.hypot(dx, dy) || 1;
      const rot = { x: top.x + (dx / len) * (26 / zoom), y: top.y + (dy / len) * (26 / zoom) };
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(top.x * zoom, top.y * zoom);
      ctx.lineTo(rot.x * zoom, rot.y * zoom);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(rot.x * zoom, rot.y * zoom, 4.5, 0, Math.PI * 2);
      ctx.fill();

      for (const [, u, v] of HANDLES) {
        const p = worldOfLocal(l, u, v);
        const x = p.x * zoom;
        const y = p.y * zoom;
        ctx.fillStyle = '#000000';
        ctx.fillRect(x - 4, y - 4, 8, 8);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
      }
    }

    const crop = api.crop;
    if (crop && crop.w > 1 && crop.h > 1) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(crop.x * zoom, crop.y * zoom, crop.w * zoom, crop.h * zoom);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(crop.x * zoom, crop.y * zoom, crop.w * zoom, crop.h * zoom);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo((crop.x + (crop.w * i) / 3) * zoom, crop.y * zoom);
        ctx.lineTo((crop.x + (crop.w * i) / 3) * zoom, (crop.y + crop.h) * zoom);
        ctx.moveTo(crop.x * zoom, (crop.y + (crop.h * i) / 3) * zoom);
        ctx.lineTo((crop.x + crop.w) * zoom, (crop.y + (crop.h * i) / 3) * zoom);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      for (const [, u, v] of HANDLES) {
        const x = (crop.x + crop.w * u) * zoom;
        const y = (crop.y + crop.h * v) * zoom;
        ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
      }
      ctx.restore();
    }

    const rc = api.remoteCursor;
    if (rc) {
      const x = rc.x * zoom;
      const y = rc.y * zoom;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 9, y + 9);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '10px Supreme, sans-serif';
      const label = rc.name || 'Guest';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(x + 10, y + 10, tw + 8, 15);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x + 14, y + 21);
    }
  }, [
    api.selectedIds,
    api.crop,
    api.remoteCursor,
    api.tool,
    api.showGrid,
    api.selection,
    api.cloneAnchor,
    api.brushSize,
    page,
    zoom,
    preview,
    guides,
    hover,
    api.pickedColor,
  ]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay, page]);

  /* ---------------- space key pan ---------------- */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement)?.matches?.('input, textarea')) {
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* ---------------- fit ---------------- */

  const fitToScreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const z = clamp(
      Math.min((rect.width - 96) / page.width, (rect.height - 96) / page.height),
      0.04,
      4,
    );
    api.setZoom(z);
    api.setPan({ x: 0, y: 0 });
  }, [api, page.width, page.height]);

  const fittedFor = useRef('');
  useEffect(() => {
    if (fittedFor.current === page.id) return;
    fittedFor.current = page.id;
    const t = window.setTimeout(fitToScreen, 30);
    return () => window.clearTimeout(t);
  }, [page.id, fitToScreen]);

  /* ---------------- coordinate helpers ---------------- */

  const toPage = (e: React.PointerEvent) => {
    const c = overlayRef.current;
    if (!c) return { x: 0, y: 0, sx: 0, sy: 0 };
    const r = c.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    return { x: sx / zoom, y: sy / zoom, sx, sy };
  };

  const handleAt = (l: Layer, sx: number, sy: number): string | null => {
    const top = worldOfLocal(l, 0.5, 0);
    const centre = worldOfLocal(l, 0.5, 0.5);
    const dx = top.x - centre.x;
    const dy = top.y - centre.y;
    const len = Math.hypot(dx, dy) || 1;
    const rot = { x: top.x + (dx / len) * (26 / zoom), y: top.y + (dy / len) * (26 / zoom) };
    if (Math.hypot(rot.x * zoom - sx, rot.y * zoom - sy) < 10) return 'rotate';
    for (const [name, u, v] of HANDLES) {
      const p = worldOfLocal(l, u, v);
      if (Math.hypot(p.x * zoom - sx, p.y * zoom - sy) < 9) return name;
    }
    return null;
  };

  const topLayerAt = (x: number, y: number): Layer | null => {
    for (let i = page.layers.length - 1; i >= 0; i--) {
      const l = page.layers[i];
      if (!l.visible || l.locked) continue;
      if (insideLayer(l, x, y)) return l;
    }
    return null;
  };

  const snapMove = (
    id: string,
    dx: number,
    dy: number,
    layer: { x: number; y: number; w: number; h: number },
  ): { dx: number; dy: number; gx?: number; gy?: number } => {
    if (!api.snap) return { dx, dy };
    const threshold = 7 / zoom;
    const xs: number[] = [0, page.width / 2, page.width];
    const ys: number[] = [0, page.height / 2, page.height];
    for (const l of page.layers) {
      if (l.id === id || !l.visible) continue;
      xs.push(l.x, l.x + l.w / 2, l.x + l.w);
      ys.push(l.y, l.y + l.h / 2, l.y + l.h);
    }
    const mineX = [layer.x + dx, layer.x + dx + layer.w / 2, layer.x + dx + layer.w];
    const mineY = [layer.y + dy, layer.y + dy + layer.h / 2, layer.y + dy + layer.h];
    let bestX: { delta: number; guide: number } | null = null;
    let bestY: { delta: number; guide: number } | null = null;
    for (const t of xs) {
      for (const m of mineX) {
        const d = t - m;
        if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) {
          bestX = { delta: d, guide: t };
        }
      }
    }
    for (const t of ys) {
      for (const m of mineY) {
        const d = t - m;
        if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) {
          bestY = { delta: d, guide: t };
        }
      }
    }
    return {
      dx: dx + (bestX ? bestX.delta : 0),
      dy: dy + (bestY ? bestY.delta : 0),
      gx: bestX?.guide,
      gy: bestY?.guide,
    };
  };

  /* ---------------- pointer ---------------- */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toPage(e);

    if (spaceDown || api.tool === 'hand' || e.button === 1) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: api.pan.x, py: api.pan.y };
      return;
    }

    if (api.tool === 'zoom') {
      api.setZoom(clamp(e.shiftKey ? zoom / 1.6 : zoom * 1.6, 0.04, 8));
      return;
    }

    if (api.tool === 'eyedrop') {
      api.sampleColor(p.x, p.y);
      return;
    }

    if (api.tool === 'wand') {
      api.magicWand(p.x, p.y);
      return;
    }

    if (api.tool === 'text') {
      const size = Math.max(24, Math.round(page.height * 0.07));
      const light = isLightBackground(page.bg);
      const layer = newTextLayer(
        Math.round(p.x),
        Math.round(p.y - size * 0.9),
        Math.round(page.width * 0.6),
        { size, family: 'Panchang', weight: 800, color: light ? '#111111' : '#ffffff' },
      );
      api.addLayer(layer);
      api.setTool('move');
      api.openTypeTab();
      return;
    }

    if (api.tool === 'shape') {
      const w = Math.round(page.width * 0.32);
      const h = Math.round(page.height * 0.24);
      const layer = newShapeLayer(
        Math.round(p.x - w / 2),
        Math.round(p.y - h / 2),
        w,
        h,
        { kind: 'rect', fill: '#ffffff' },
      );
      api.addLayer(layer);
      api.setTool('move');
      return;
    }

    if (api.tool === 'marquee' || api.tool === 'ellipse') {
      const mode: 'new' | 'add' | 'subtract' = e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'new';
      setPreview({ kind: 'rect', rect: { x: p.x, y: p.y, w: 0, h: 0 } });
      gesture.current = {
        kind: 'marquee',
        start: { x: p.x, y: p.y },
        end: { x: p.x, y: p.y },
        shape: api.tool === 'ellipse' ? 'ellipse' : 'rect',
        mode,
      };
      return;
    }

    if (api.tool === 'lasso') {
      const mode: 'new' | 'add' | 'subtract' = e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'new';
      gesture.current = { kind: 'lasso', pts: [{ x: p.x, y: p.y }], mode };
      setPreview({ kind: 'lasso', pts: [{ x: p.x, y: p.y }] });
      return;
    }

    if (api.tool === 'gradient') {
      gesture.current = {
        kind: 'gradientDrag',
        from: { x: p.x, y: p.y },
        end: { x: p.x, y: p.y },
      };
      setPreview({ kind: 'gradient', from: { x: p.x, y: p.y }, to: { x: p.x, y: p.y } });
      return;
    }

    if (api.tool === 'clone') {
      if (e.altKey) {
        api.setCloneAnchor(p.x, p.y);
        return;
      }
      gesture.current = { kind: 'clone', pts: [{ x: p.x, y: p.y }] };
      setPreview({ kind: 'clone', pts: [{ x: p.x, y: p.y }] });
      setBusy(true);
      return;
    }

    if (api.tool === 'crop') {
      const cr = api.crop;
      if (cr) {
        for (const [name, u, v] of HANDLES) {
          const hx = (cr.x + cr.w * u) * zoom;
          const hy = (cr.y + cr.h * v) * zoom;
          if (Math.hypot(hx - p.sx, hy - p.sy) < 10) {
            gesture.current = {
              kind: 'crop-scale',
              handle: name,
              start: { ...cr },
              pointer: { x: p.x, y: p.y },
            };
            return;
          }
        }
        if (p.x >= cr.x && p.y >= cr.y && p.x <= cr.x + cr.w && p.y <= cr.y + cr.h) {
          gesture.current = { kind: 'crop-move', sx: p.x, sy: p.y, rect: { ...cr } };
          return;
        }
      }
      api.setCrop({ x: p.x, y: p.y, w: 0, h: 0 });
      gesture.current = {
        kind: 'crop-move',
        sx: p.x,
        sy: p.y,
        rect: { x: p.x, y: p.y, w: 0, h: 0 },
      };
      return;
    }

    if (api.tool === 'brush') {
      gesture.current = { kind: 'paint', pts: [{ x: p.x, y: p.y }] };
      setPreview({ kind: 'paint', pts: [{ x: p.x, y: p.y }] });
      return;
    }

    if (api.tool === 'erase') {
      const target = api.selected;
      if (!target) {
        api.notify('Select a layer, then erase into it.');
        return;
      }
      if (target.locked) {
        api.notify('That layer is locked.');
        return;
      }
      const lp = toLocalPoint(target, p.x, p.y);
      const layerId = target.id;
      api.mutate((d) => {
        const l = d.pages[api.pageIndex].layers.find((x) => x.id === layerId);
        if (!l) return;
        l.mask.push({ erase: true, size: api.brushSize, pts: [lp.x / l.w, lp.y / l.h] });
      }, 'erase');
      gesture.current = { kind: 'brush', id: layerId };
      setBusy(true);
      return;
    }

    const current = api.selected;
    if (current && !current.locked && api.tool === 'move') {
      const h = handleAt(current, p.sx, p.sy);
      if (h === 'rotate') {
        const centre = worldOfLocal(current, 0.5, 0.5);
        gesture.current = {
          kind: 'rotate',
          id: current.id,
          center: centre,
          startAngle: Math.atan2(p.y - centre.y, p.x - centre.x),
          startRot: current.rotate,
        };
        return;
      }
      if (h) {
        gesture.current = {
          kind: 'scale',
          id: current.id,
          handle: h,
          start: structuredClone(current),
          pointer: { x: p.x, y: p.y },
        };
        return;
      }
    }

    const hit = topLayerAt(p.x, p.y);
    if (hit) {
      let ids: string[];
      if (e.shiftKey) {
        ids = api.selectedIds.includes(hit.id)
          ? api.selectedIds.filter((i) => i !== hit.id)
          : [...api.selectedIds, hit.id];
      } else {
        ids = api.selectedIds.includes(hit.id) ? api.selectedIds : [hit.id];
      }
      api.select(ids);
      if (api.tool === 'move') {
        const starts = page.layers
          .filter((l) => ids.includes(l.id) && !l.locked)
          .map((l) => ({ id: l.id, x: l.x, y: l.y }));
        gesture.current = { kind: 'move', sx: p.x, sy: p.y, starts };
      }
    } else if (!e.shiftKey) {
      api.select([]);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toPage(e);
    api.reportCursor(p.x, p.y);
    if (api.tool === 'brush' || api.tool === 'erase' || api.tool === 'clone') {
      setHover({ x: p.x, y: p.y });
    }
    const g = gesture.current;
    if (g.kind === 'none') return;

    if (g.kind === 'pan') {
      api.setPan({ x: g.px + (e.clientX - g.sx), y: g.py + (e.clientY - g.sy) });
      return;
    }

    if (g.kind === 'move') {
      let dx = p.x - g.sx;
      let dy = p.y - g.sy;
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const primaryId = g.starts[0]?.id;
      const primary = page.layers.find((l) => l.id === primaryId);
      if (primary && g.starts.length === 1) {
        const snapped = snapMove(primaryId, dx, dy, {
          x: primary.x,
          y: primary.y,
          w: primary.w,
          h: primary.h,
        });
        dx = snapped.dx;
        dy = snapped.dy;
        if (snapped.gx !== guides.x || snapped.gy !== guides.y) {
          setGuides({ x: snapped.gx, y: snapped.gy });
        }
      }
      api.mutate((d) => {
        const layers = d.pages[api.pageIndex].layers;
        for (const s of g.starts) {
          const l = layers.find((x) => x.id === s.id);
          if (l) {
            l.x = s.x + dx;
            l.y = s.y + dy;
          }
        }
      }, 'move');
      return;
    }

    if (g.kind === 'scale') {
      const a = (g.start.rotate * Math.PI) / 180;
      const dx = p.x - g.pointer.x;
      const dy = p.y - g.pointer.y;
      const lx = dx * Math.cos(a) + dy * Math.sin(a);
      const ly = -dx * Math.sin(a) + dy * Math.cos(a);

      const west = g.handle.includes('w');
      const east = g.handle.includes('e');
      const north = g.handle.includes('n');
      const south = g.handle.includes('s');

      const w = Math.max(8, g.start.w + (east ? lx : west ? -lx : 0));
      const h = Math.max(8, g.start.h + (south ? ly : north ? -ly : 0));

      const anchorU = west ? 1 : east ? 0 : 0.5;
      const anchorV = north ? 1 : south ? 0 : 0.5;
      const anchor = worldOfLocal(g.start, anchorU, anchorV);
      const cx = anchor.x - ((anchorU - 0.5) * w * Math.cos(a) - (anchorV - 0.5) * h * Math.sin(a));
      const cy = anchor.y - ((anchorU - 0.5) * w * Math.sin(a) + (anchorV - 0.5) * h * Math.cos(a));
      api.updateLayer(g.id, { x: cx - w / 2, y: cy - h / 2, w, h }, 'scale');
      return;
    }

    if (g.kind === 'rotate') {
      const angle = Math.atan2(p.y - g.center.y, p.x - g.center.x);
      let deg = g.startRot + ((angle - g.startAngle) * 180) / Math.PI;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      api.updateLayer(g.id, { rotate: Math.round(deg * 10) / 10 }, 'rotate');
      return;
    }

    if (g.kind === 'paint') {
      g.pts.push({ x: p.x, y: p.y });
      setPreview({ kind: 'paint', pts: [...g.pts] });
      return;
    }

    if (g.kind === 'brush') {
      const layer = page.layers.find((l) => l.id === g.id);
      if (!layer) return;
      const lp = toLocalPoint(layer, p.x, p.y);
      api.mutate((d) => {
        const l = d.pages[api.pageIndex].layers.find((x) => x.id === g.id);
        const stroke = l?.mask[l.mask.length - 1];
        if (!l || !stroke) return;
        stroke.pts.push(lp.x / l.w, lp.y / l.h);
      }, 'brush');
      return;
    }

    if (g.kind === 'marquee') {
      g.end = { x: p.x, y: p.y };
      setPreview({
        kind: 'rect',
        rect: { x: g.start.x, y: g.start.y, w: p.x - g.start.x, h: p.y - g.start.y },
      });
      return;
    }

    if (g.kind === 'lasso') {
      g.pts.push({ x: p.x, y: p.y });
      setPreview({ kind: 'lasso', pts: [...g.pts] });
      return;
    }

    if (g.kind === 'gradientDrag') {
      g.end = { x: p.x, y: p.y };
      setPreview({ kind: 'gradient', from: g.from, to: { x: p.x, y: p.y } });
      return;
    }

    if (g.kind === 'clone') {
      g.pts.push({ x: p.x, y: p.y });
      setPreview({ kind: 'clone', pts: [...g.pts] });
      return;
    }

    if (g.kind === 'crop-move') {
      api.setCrop({ ...g.rect, x: g.rect.x + (p.x - g.sx), y: g.rect.y + (p.y - g.sy) });
      return;
    }

    if (g.kind === 'crop-scale') {
      const s = g.start;
      let x = s.x;
      let y = s.y;
      let w = s.w;
      let h = s.h;
      const dx = p.x - g.pointer.x;
      const dy = p.y - g.pointer.y;
      if (g.handle.includes('e')) w = s.w + dx;
      if (g.handle.includes('s')) h = s.h + dy;
      if (g.handle.includes('w')) {
        x = s.x + dx;
        w = s.w - dx;
      }
      if (g.handle.includes('n')) {
        y = s.y + dy;
        h = s.h - dy;
      }
      api.setCrop(normaliseRect({ x, y, w, h }));
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = { kind: 'none' };
    setGuides({});
    setBusy(false);

    if (g.kind === 'paint') {
      const pts = g.pts;
      setPreview(null);
      if (pts.length) api.paintStroke(pts);
      return;
    }

    if (g.kind === 'brush') return;

    if (g.kind === 'marquee') {
      const r = normaliseRect({
        x: g.start.x,
        y: g.start.y,
        w: g.end.x - g.start.x,
        h: g.end.y - g.start.y,
      });
      setPreview(null);
      if (r.w < 3 || r.h < 3) {
        api.clearSelection();
        return;
      }
      const mask = document.createElement('canvas');
      mask.width = Math.max(1, Math.round(page.width));
      mask.height = Math.max(1, Math.round(page.height));
      const mc = mask.getContext('2d');
      if (!mc) return;
      mc.fillStyle = '#ffffff';
      if (g.shape === 'ellipse') {
        mc.beginPath();
        mc.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
        mc.fill();
      } else {
        mc.fillRect(r.x, r.y, r.w, r.h);
      }
      api.setSelectionMode(g.mode);
      api.commitSelection(mask, r, g.shape);
      return;
    }

    if (g.kind === 'lasso') {
      setPreview(null);
      if (g.pts.length < 3) {
        api.clearSelection();
        return;
      }
      const mask = document.createElement('canvas');
      mask.width = Math.max(1, Math.round(page.width));
      mask.height = Math.max(1, Math.round(page.height));
      const mc = mask.getContext('2d');
      if (!mc) return;
      mc.fillStyle = '#ffffff';
      mc.beginPath();
      g.pts.forEach((pt, i) => (i ? mc.lineTo(pt.x, pt.y) : mc.moveTo(pt.x, pt.y)));
      mc.closePath();
      mc.fill();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const pt of g.pts) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }
      api.setSelectionMode(g.mode);
      api.commitSelection(mask, { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, 'lasso');
      return;
    }

    if (g.kind === 'gradientDrag') {
      const to = g.end;
      setPreview(null);
      api.dropGradient(g.from, to);
      return;
    }

    if (g.kind === 'clone') {
      const pts = g.pts;
      setPreview(null);
      if (pts.length) api.cloneStroke(pts, api.cloneAnchor);
      return;
    }

    if (g.kind === 'crop-move' || g.kind === 'crop-scale') {
      const c = api.crop;
      if (c && (c.w < 4 || c.h < 4)) api.setCrop(null);
      else if (c) api.setCrop({ ...normaliseRect(c) });
    }
  };

  const onWheelNative = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const relX = e.clientX - rect.left - rect.width / 2;
      const relY = e.clientY - rect.top - rect.height / 2;
      const factor = Math.exp(-e.deltaY * 0.0016);
      const next = clamp(zoom * factor, 0.04, 8);
      const pcx = page.width / 2;
      const pcy = page.height / 2;
      const pageX = pcx + (relX - api.pan.x) / zoom;
      const pageY = pcy + (relY - api.pan.y) / zoom;
      api.setZoom(next);
      api.setPan({ x: relX - (pageX - pcx) * next, y: relY - (pageY - pcy) * next });
    },
    [api, zoom, page.width, page.height],
  );

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [onWheelNative]);

  const cursor =
    api.tool === 'hand' || spaceDown
      ? 'grab'
      : api.tool === 'brush' ||
          api.tool === 'erase' ||
          api.tool === 'crop' ||
          api.tool === 'marquee' ||
          api.tool === 'ellipse' ||
          api.tool === 'lasso' ||
          api.tool === 'clone' ||
          api.tool === 'gradient'
        ? 'crosshair'
        : api.tool === 'zoom' || api.tool === 'wand' || api.tool === 'eyedrop'
          ? 'zoom-in'
          : 'default';

  const dispW = Math.max(1, Math.round(page.width * zoom));
  const dispH = Math.max(1, Math.round(page.height * zoom));

  return (
    <div className="stage" ref={stageRef} onContextMenu={(e) => e.preventDefault()}>
      <div className="stage-inner" style={{ transform: `translate(${api.pan.x}px, ${api.pan.y}px)` }}>
        <div className="canvas-wrap" style={{ width: dispW, height: dispH }}>
          <canvas ref={paintRef} className="paint" />
          <canvas
            ref={overlayRef}
            className="stage-overlay"
            style={{ cursor }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={() => {
              if (api.selected?.type === 'text') api.openTypeTab();
            }}
          />
        </div>
      </div>

      <div className="stage-hud">
        <button
          className="hud-btn"
          title="Zoom out"
          onClick={() => api.setZoom(clamp(zoom / 1.25, 0.04, 8))}
        >
          −
        </button>
        <span className="hud-val">{Math.round(zoom * 100)}%</span>
        <button
          className="hud-btn"
          title="Zoom in"
          onClick={() => api.setZoom(clamp(zoom * 1.25, 0.04, 8))}
        >
          +
        </button>
        <button className="hud-btn" title="Fit to screen" onClick={fitToScreen}>
          Fit
        </button>
        <button
          className="hud-btn"
          title="Actual size"
          onClick={() => {
            api.setZoom(1);
            api.setPan({ x: 0, y: 0 });
          }}
        >
          1:1
        </button>
        <button
          className={'hud-btn' + (api.showGrid ? ' on' : '')}
          title="Toggle thirds grid"
          onClick={() => api.setShowGrid(!api.showGrid)}
        >
          Grid
        </button>
        <button
          className={'hud-btn' + (api.snap ? ' on' : '')}
          title="Toggle snapping"
          onClick={() => api.setSnap(!api.snap)}
        >
          Snap
        </button>
      </div>

      {api.crop && (
        <div className="crop-bar">
          <span className="hint" style={{ padding: '4px 8px' }}>
            {Math.round(api.crop.w)} × {Math.round(api.crop.h)}
          </span>
          <button className="btn sm" onClick={() => api.setCrop(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
