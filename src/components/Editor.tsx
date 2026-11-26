import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CursorInfo, Doc, Grade, Layer, Page, SelectionMode } from '../types';
import { CollabSession, CollabStatus } from '../lib/collab';
import {
  boundsOfLayers,
  clone,
  docAssetIds,
  fitTextLayer,
  flipLayer,
  newDoc,
  newGradientLayer,
  newImageLayer,
  newShapeLayer,
  newTextLayer,
  rotateLayerQuarter,
} from '../lib/doc';
import { allFontOptions, ensureFont, FontOption, registerCustomFont } from '../lib/fonts';
import { FontRecord, STORE_FONTS, idbGetAll, idbPut } from '../lib/idb';
import { analyseImage, enhanceUpscale, sharpenInPlace } from '../lib/pixels';
import { AssetMap, exportPage, makeThumb, renderPageToCanvas } from '../lib/render';
import {
  cacheBitmap,
  getAssetBlob,
  importImageFile,
  loadAssetMap,
  putAssetBlob,
  saveDoc,
} from '../lib/store';
import { clamp, downloadBlob, rgbToHex, randomCode, safeName } from '../lib/utils';
import { CanvasStage } from './CanvasStage';
import { ToolBar } from './ToolBar';
import { CropRect, EditorApi, SelectionState, Tool } from './editorApi';
import { Header } from './Header';
import { ExportModal, ExportOptions, ShareModal } from './Modals';
import { LeftPanel, PropertiesPanel } from './Panels';
import { Btn, IconBtn } from './ui';

const MIME: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
const EXT: Record<string, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

function getDisplayName(): string {
  try {
    const existing = localStorage.getItem('imt:name');
    if (existing) return existing;
    const name = 'Artist ' + Math.floor(100 + Math.random() * 900);
    localStorage.setItem('imt:name', name);
    return name;
  } catch {
    return 'Artist';
  }
}

function safeDoc(d: Doc): Doc {
  if (d && Array.isArray(d.pages) && d.pages.length) return d;
  return newDoc(d?.name || 'Untitled');
}

async function canvasToBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

export function Editor({
  initialDoc,
  collab,
  onExit,
  onToast,
}: {
  initialDoc: Doc;
  collab?: { role: 'host' | 'guest'; code: string } | null;
  onExit: () => void;
  onToast: (msg: string) => void;
}) {
  const [doc, setDoc] = useState<Doc>(() => safeDoc(initialDoc));
  const docRef = useRef<Doc>(doc);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('move');
  const [zoom, setZoom] = useState(0.4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brushSize, setBrushSize] = useState(140);
  const [cloneAnchor, setCloneAnchor] = useState<{ x: number; y: number } | null>(null);
  const [gradeTarget, setGradeTarget] = useState<'layer' | 'page'>('page');
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [tab, setTab] = useState('layers');
  const [assets, setAssets] = useState<AssetMap>(new Map());
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftW, setLeftW] = useState(268);
  const [rightW, setRightW] = useState(238);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [customFonts, setCustomFonts] = useState<FontOption[]>([]);
  const [histTick, setHistTick] = useState(0);
  const [online, setOnline] = useState(false);

  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [selectionMode, setSelectionModeState] = useState<SelectionMode>('new');
  const selectionModeRef = useRef<SelectionMode>('new');
  const [wandTolerance, setWandTolerance] = useState(24);
  const [showGrid, setShowGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [pickedColor, setPickedColor] = useState('#ffffff');
  const [histogram, setHistogram] = useState<number[] | null>(null);

  const [code, setCode] = useState(collab?.code ?? randomCode());
  const [sharing, setSharing] = useState(!!collab);
  const [collabStatus, setCollabStatus] = useState<CollabStatus>('idle');
  const [collabDetail, setCollabDetail] = useState<string | undefined>();
  const [peers, setPeers] = useState(0);
  const [remoteName, setRemoteName] = useState<string | null>(null);
  const [remoteCursor, setRemoteCursor] = useState<CursorInfo | null>(null);

  const past = useRef<{ label: string; doc: Doc }[]>([]);
  const future = useRef<Doc[]>([]);
  const lastEdit = useRef<{ label: string; time: number }>({ label: '', time: 0 });
  const dirty = useRef(false);
  const sessionRef = useRef<CollabSession | null>(null);
  const cursorClock = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  const page: Page = doc.pages[Math.min(pageIndex, doc.pages.length - 1)] ?? doc.pages[0];
  const selected: Layer | null = useMemo(
    () =>
      selectedIds.length === 1 ? page.layers.find((l) => l.id === selectedIds[0]) ?? null : null,
    [page.layers, selectedIds],
  );

  /* ---------------- history + mutation ---------------- */

  const mutate = useCallback((fn: (d: Doc) => void, label = 'edit') => {
    const prev = docRef.current;
    const next = clone(prev);
    fn(next);
    for (const p of next.pages) {
      for (const l of p.layers) if (l.type === 'text') fitTextLayer(l);
    }
    next.updatedAt = Date.now();
    next.rev = prev.rev + 1;
    const now = Date.now();
    if (label !== lastEdit.current.label || now - lastEdit.current.time > 750) {
      past.current.push({ label, doc: prev });
      if (past.current.length > 80) past.current.shift();
      future.current = [];
      lastEdit.current = { label, time: now };
      setHistTick((t) => t + 1);
    } else {
      lastEdit.current.time = now;
    }
    docRef.current = next;
    dirty.current = true;
    setDoc(next);
  }, []);

  const updateLayer = useCallback(
    (id: string, patch: Partial<Layer>, label = 'edit') => {
      mutate((d) => {
        for (const p of d.pages) {
          const l = p.layers.find((x) => x.id === id);
          if (l) Object.assign(l, patch);
        }
      }, label);
    },
    [mutate],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(docRef.current);
    docRef.current = prev.doc;
    setDoc(prev.doc);
    setHistTick((t) => t + 1);
    dirty.current = true;
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push({ label: 'redo', doc: docRef.current });
    docRef.current = next;
    setDoc(next);
    setHistTick((t) => t + 1);
    dirty.current = true;
  }, []);

  const jumpHistory = useCallback((index: number) => {
    const target = past.current[index];
    if (!target) return;
    const rest = past.current.slice(index + 1).map((p) => p.doc);
    future.current = [docRef.current, ...[...rest].reverse(), ...future.current];
    past.current = past.current.slice(0, index);
    docRef.current = target.doc;
    setDoc(target.doc);
    setHistTick((t) => t + 1);
    dirty.current = true;
  }, []);

  /* ---------------- assets ---------------- */

  const assetKey = useMemo(() => docAssetIds(doc).sort().join('|'), [doc]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await loadAssetMap(docAssetIds(docRef.current));
      if (!cancelled) setAssets(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [assetKey]);

  /* ---------------- persistence ---------------- */

  const persist = useCallback(async () => {
    const current = docRef.current;
    if (!current.pages.length) return;
    try {
      const thumb = await makeThumb(current, assets);
      await saveDoc(current, thumb);
      dirty.current = false;
    } catch {
      /* storage may be full or unavailable */
    }
  }, [assets]);

  useEffect(() => {
    if (!dirty.current) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist();
    }, 800);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [doc, persist]);

  /* ---------------- histogram ---------------- */

  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        const scale = Math.min(220 / page.width, 220 / page.height, 1);
        const c = await renderPageToCanvas(page, assets, scale);
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const stats = analyseImage(ctx.getImageData(0, 0, c.width, c.height), 1);
        setHistogram(stats.histogram);
      } catch {
        /* ignore */
      }
    }, 380);
    return () => window.clearTimeout(t);
  }, [page, assets]);

  /* ---------------- collaboration ---------------- */

  const applyRemote = useCallback((remote: Doc) => {
    if (!remote || !Array.isArray(remote.pages) || !remote.pages.length) return;
    const cur = docRef.current;
    if (remote.id === cur.id && (remote.rev ?? 0) <= (cur.rev ?? 0)) return;
    const next: Doc = { ...remote, pages: remote.pages };
    docRef.current = next;
    dirty.current = true;
    setDoc(next);
    setPageIndex((i) => Math.min(i, next.pages.length - 1));
  }, []);

  useEffect(() => {
    if (!sharing) return;
    const session = new CollabSession(code, collab?.role ?? 'host', getDisplayName(), {
      onStatus: (s, d) => {
        setCollabStatus(s);
        setCollabDetail(d);
        setOnline(s === 'live');
      },
      onDoc: (remote) => applyRemote(remote),
      onCursor: (c) => setRemoteCursor(c),
      onPeers: (n) => {
        setPeers(n);
        setOnline(n > 0);
      },
      onRemoteName: (n) => {
        setRemoteName(n);
        sessionRef.current?.setRemoteName(n ?? '');
      },
      onAssets: () => {
        void loadAssetMap(docAssetIds(docRef.current)).then((map) => setAssets(map));
      },
    });
    sessionRef.current = session;
    session.setCurrentDoc(docRef.current);
    session.start();
    return () => {
      session.destroy();
      sessionRef.current = null;
      setOnline(false);
    };
  }, [sharing, code, collab?.role, applyRemote]);

  useEffect(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.setCurrentDoc(doc);
    if (s.status === 'live') s.sendDoc(doc);
  }, [doc]);

  useEffect(() => {
    const onLeave = () => {
      void persist();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [persist]);

  /* ---------------- fonts ---------------- */

  useEffect(() => {
    (async () => {
      try {
        const records = await idbGetAll<FontRecord>(STORE_FONTS);
        const list: FontOption[] = [];
        for (const r of records) {
          const ok = await registerCustomFont(r.family, r.buffer, r.weight, r.style);
          if (ok) list.push({ family: r.family, source: 'custom' });
        }
        setCustomFonts(list);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const uploadFont = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const family = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const ok = await registerCustomFont(family, buffer);
      if (!ok) {
        onToast('That font file could not be read.');
        return;
      }
      await idbPut(STORE_FONTS, family, { family, buffer, weight: 400, style: 'normal' });
      setCustomFonts((list) =>
        list.some((f) => f.family === family) ? list : [...list, { family, source: 'custom' }],
      );
      onToast(`${family} added to this session.`);
    },
    [onToast],
  );

  const fonts = useMemo(() => allFontOptions(customFonts), [customFonts]);

  /* ---------------- layer helpers ---------------- */

  const addLayer = useCallback(
    (layer: Layer) => {
      mutate((d) => {
        d.pages[Math.min(pageIndex, d.pages.length - 1)].layers.push(layer);
      }, 'add');
      setSelectedIds([layer.id]);
    },
    [mutate, pageIndex],
  );

  const importImages = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (!images.length) {
        onToast('Those files are not images.');
        return;
      }
      const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      let added = 0;
      for (const file of images) {
        try {
          const info = await importImageFile(file);
          const scale = Math.min((p.width * 0.82) / info.w, (p.height * 0.82) / info.h, 1);
          const w = Math.max(8, Math.round(info.w * scale));
          const h = Math.max(8, Math.round(info.h * scale));
          addLayer(
            newImageLayer(
              Math.round((p.width - w) / 2),
              Math.round((p.height - h) / 2),
              w,
              h,
              { assetId: info.assetId, naturalW: info.w, naturalH: info.h, fit: 'cover' },
              file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Image',
            ),
          );
          added++;
        } catch {
          /* unreadable file */
        }
      }
      setAssets(await loadAssetMap(docAssetIds(docRef.current)));
      if (added) {
        setTool('move');
        setTab('layers');
        onToast(added === 1 ? 'Image added to the canvas.' : `${added} images added.`);
      } else {
        onToast('Those files could not be read.');
      }
    },
    [pageIndex, addLayer, onToast],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('input, textarea, [contenteditable="true"]')) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        void importImages(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [importImages]);

  const addPage = useCallback(() => {
    mutate((d) => {
      const cur = d.pages[Math.min(pageIndex, d.pages.length - 1)];
      d.pages.push({
        id: 'p_' + Math.random().toString(36).slice(2, 10),
        name: `Page ${d.pages.length + 1}`,
        width: cur.width,
        height: cur.height,
        bg: cur.bg,
        bgAlpha: cur.bgAlpha,
        grade: clone(cur.grade),
        layers: [],
      });
    }, 'page');
    setPageIndex(docRef.current.pages.length - 1);
  }, [mutate, pageIndex]);

  const duplicatePage = useCallback(() => {
    mutate((d) => {
      const i = Math.min(pageIndex, d.pages.length - 1);
      const copy = clone(d.pages[i]);
      copy.id = 'p_' + Math.random().toString(36).slice(2, 10);
      copy.name = d.pages[i].name + ' copy';
      copy.layers = copy.layers.map((l) => ({
        ...l,
        id: 'l_' + Math.random().toString(36).slice(2, 10),
      }));
      d.pages.splice(i + 1, 0, copy);
    }, 'page');
    setPageIndex((i) => i + 1);
  }, [mutate, pageIndex]);

  const deletePage = useCallback(() => {
    if (docRef.current.pages.length < 2) return;
    mutate((d) => {
      d.pages.splice(Math.min(pageIndex, d.pages.length - 1), 1);
    }, 'page');
    setPageIndex((i) => Math.max(0, Math.min(i, docRef.current.pages.length - 1)));
  }, [mutate, pageIndex]);

  /* ---------------- crop ---------------- */

  const cropToBox = useCallback(
    (box: CropRect, label = 'crop') => {
      const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      const x = Math.round(clamp(box.x, 0, p.width - 4));
      const y = Math.round(clamp(box.y, 0, p.height - 4));
      const w = Math.round(Math.min(box.w, p.width - x));
      const h = Math.round(Math.min(box.h, p.height - y));
      if (w < 4 || h < 4) return;
      mutate((d) => {
        const pg = d.pages[Math.min(pageIndex, d.pages.length - 1)];
        pg.width = w;
        pg.height = h;
        for (const l of pg.layers) {
          l.x -= x;
          l.y -= y;
        }
      }, label);
      setSelection(null);
    },
    [mutate, pageIndex],
  );

  const applyCrop = useCallback(() => {
    if (!crop) return;
    cropToBox(crop);
    setCrop(null);
    setTool('move');
  }, [crop, cropToBox]);

  /* ---------------- selections ---------------- */

  const clearSelection = useCallback(() => setSelection(null), []);

  const setSelectionMode = useCallback((m: SelectionMode) => {
    selectionModeRef.current = m;
    setSelectionModeState(m);
  }, []);

  const commitSelection = useCallback(
    (mask: HTMLCanvasElement, box: CropRect, kind: string) => {
      const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      const W = Math.max(1, Math.round(p.width));
      const H = Math.max(1, Math.round(p.height));
      const mode = selectionModeRef.current;
      setSelection((prev) => {
        if (mode === 'new' || !prev) {
          const c = document.createElement('canvas');
          c.width = W;
          c.height = H;
          const g = c.getContext('2d');
          if (!g) return null;
          g.drawImage(mask, 0, 0, W, H);
          return { canvas: c, x: box.x, y: box.y, w: box.w, h: box.h, kind };
        }
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const g = c.getContext('2d');
        if (!g) return prev;
        g.drawImage(prev.canvas, 0, 0);
        if (mode === 'add') {
          g.globalCompositeOperation = 'lighter';
          g.drawImage(mask, 0, 0, W, H);
          const x0 = Math.min(prev.x, box.x);
          const y0 = Math.min(prev.y, box.y);
          const x1 = Math.max(prev.x + prev.w, box.x + box.w);
          const y1 = Math.max(prev.y + prev.h, box.y + box.h);
          return { canvas: c, x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'combined' };
        }
        g.globalCompositeOperation = 'destination-out';
        g.drawImage(mask, 0, 0, W, H);
        return { ...prev, canvas: c, kind: 'combined' };
      });
    },
    [pageIndex],
  );

  const selectAll = useCallback(() => {
    const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(p.width));
    c.height = Math.max(1, Math.round(p.height));
    const g = c.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    setSelection({ canvas: c, x: 0, y: 0, w: p.width, h: p.height, kind: 'all' });
  }, [pageIndex]);

  const invertSelection = useCallback(() => {
    setSelection((prev) => {
      const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      const W = Math.max(1, Math.round(p.width));
      const H = Math.max(1, Math.round(p.height));
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d');
      if (!g) return prev;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, W, H);
      if (prev) {
        g.globalCompositeOperation = 'destination-out';
        g.drawImage(prev.canvas, 0, 0, W, H);
      }
      return { canvas: c, x: 0, y: 0, w: p.width, h: p.height, kind: 'inverted' };
    });
  }, [pageIndex]);

  const magicWand = useCallback(
    async (x: number, y: number) => {
      const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      const composite = await renderPageToCanvas(p, assets, 1);
      const ctx = composite.getContext('2d');
      if (!ctx) return;
      const W = composite.width;
      const H = composite.height;
      const img = ctx.getImageData(0, 0, W, H);
      const data = img.data;
      const sx = clamp(Math.round(x), 0, W - 1);
      const sy = clamp(Math.round(y), 0, H - 1);
      const seed = (sy * W + sx) * 4;
      const sr = data[seed];
      const sg = data[seed + 1];
      const sb = data[seed + 2];
      const threshold = (wandTolerance / 100) * 255 * 1.732;

      const out = new ImageData(W, H);
      const visited = new Uint8Array(W * H);
      const stack: number[] = [sy * W + sx];
      let minX = W;
      let minY = H;
      let maxX = 0;
      let maxY = 0;

      while (stack.length) {
        const p1 = stack.pop() as number;
        if (visited[p1]) continue;
        visited[p1] = 1;
        const o = p1 * 4;
        const dr = data[o] - sr;
        const dg = data[o + 1] - sg;
        const db = data[o + 2] - sb;
        if (Math.sqrt(dr * dr + dg * dg + db * db) > threshold) continue;
        out.data[o] = 255;
        out.data[o + 1] = 255;
        out.data[o + 2] = 255;
        out.data[o + 3] = 255;
        const px = p1 % W;
        const py = (p1 - px) / W;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (px > 0 && !visited[p1 - 1]) stack.push(p1 - 1);
        if (px < W - 1 && !visited[p1 + 1]) stack.push(p1 + 1);
        if (py > 0 && !visited[p1 - W]) stack.push(p1 - W);
        if (py < H - 1 && !visited[p1 + W]) stack.push(p1 + W);
      }

      if (maxX <= minX || maxY <= minY) {
        onToast('Nothing matched at that point — raise the tolerance.');
        return;
      }

      const mask = document.createElement('canvas');
      mask.width = W;
      mask.height = H;
      const mc = mask.getContext('2d');
      if (!mc) return;
      mc.putImageData(out, 0, 0);
      commitSelection(
        mask,
        { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        'wand',
      );
    },
    [assets, pageIndex, wandTolerance, commitSelection, onToast],
  );

  const maskFromSelection = useCallback(
    async (
      sel: SelectionState,
      box: { x: number; y: number; w: number; h: number },
      invert: boolean,
    ): Promise<string | null> => {
      const w = Math.max(1, Math.round(box.w));
      const h = Math.max(1, Math.round(box.h));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      if (!g) return null;
      g.fillStyle = invert ? '#ffffff' : '#000000';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = invert ? 'destination-out' : 'source-over';
      g.drawImage(sel.canvas, box.x, box.y, w, h, 0, 0, w, h);
      const blob = await canvasToBlob(c);
      if (!blob) return null;
      const id = await putAssetBlob(blob);
      cacheBitmap(id, await createImageBitmap(blob));
      return id;
    },
    [],
  );

  const maskToSelection = useCallback(async () => {
    if (!selection || !selected) {
      onToast('Pick a layer and make a selection first.');
      return;
    }
    const id = await maskFromSelection(
      selection,
      { x: selected.x, y: selected.y, w: selected.w, h: selected.h },
      false,
    );
    if (!id) return;
    updateLayer(selected.id, { maskAsset: id }, 'mask');
    setAssets(await loadAssetMap(docAssetIds(docRef.current)));
    onToast('Layer masked to the selection.');
  }, [selection, selected, maskFromSelection, updateLayer, onToast]);

  const deleteSelection = useCallback(async () => {
    if (!selection || !selected) {
      onToast('Pick a layer and make a selection first.');
      return;
    }
    const id = await maskFromSelection(
      selection,
      { x: selected.x, y: selected.y, w: selected.w, h: selected.h },
      true,
    );
    if (!id) return;
    updateLayer(selected.id, { maskAsset: id }, 'erase');
    setAssets(await loadAssetMap(docAssetIds(docRef.current)));
    onToast('Selection removed from that layer.');
  }, [selection, selected, maskFromSelection, updateLayer, onToast]);

  const fillSelection = useCallback(
    async (color: string) => {
      if (!selection) {
        onToast('Make a selection first.');
        return;
      }
      const box = { x: selection.x, y: selection.y, w: selection.w, h: selection.h };
      const id = await maskFromSelection(selection, box, false);
      if (!id) return;
      const layer = newShapeLayer(box.x, box.y, box.w, box.h, { kind: 'rect', fill: color });
      layer.maskAsset = id;
      layer.name = 'Fill';
      addLayer(layer);
      setAssets(await loadAssetMap(docAssetIds(docRef.current)));
    },
    [selection, maskFromSelection, addLayer, onToast],
  );

  const cropToSelection = useCallback(() => {
    if (!selection) return;
    cropToBox({ x: selection.x, y: selection.y, w: selection.w, h: selection.h }, 'crop');
  }, [selection, cropToBox]);

  /* ---------------- raster tools ---------------- */

  const sampleColor = useCallback(
    async (x: number, y: number) => {
      const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      const c = await renderPageToCanvas(p, assets, 1);
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const px = clamp(Math.round(x), 0, c.width - 1);
      const py = clamp(Math.round(y), 0, c.height - 1);
      const d = ctx.getImageData(px, py, 1, 1).data;
      const hex = rgbToHex(d[0], d[1], d[2]);
      setPickedColor(hex);
      if (selected?.type === 'text' && selected.text) {
        updateLayer(selected.id, { text: { ...selected.text, color: hex } }, 'colour');
      } else if (selected?.type === 'shape' && selected.shape) {
        updateLayer(selected.id, { shape: { ...selected.shape, fill: hex } }, 'colour');
      } else if (selected?.type === 'gradient' && selected.gradient) {
        updateLayer(selected.id, { gradient: { ...selected.gradient, stopA: hex } }, 'colour');
      } else {
        onToast(`Picked ${hex}.`);
      }
    },
    [assets, pageIndex, selected, updateLayer, onToast],
  );

  const cloneStroke = useCallback(
    async (pts: { x: number; y: number }[], anchor: { x: number; y: number } | null) => {
      if (!pts.length) return;
      const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      const src = await renderPageToCanvas(p, assets, 1);
      const W = Math.max(1, Math.round(p.width));
      const H = Math.max(1, Math.round(p.height));
      const out = document.createElement('canvas');
      out.width = W;
      out.height = H;
      const og = out.getContext('2d');
      if (!og) return;
      const size = Math.max(6, brushSize);
      const a = anchor ?? { x: pts[0].x + size * 0.9, y: pts[0].y - size * 0.9 };
      const offX = a.x - pts[0].x;
      const offY = a.y - pts[0].y;

      og.save();
      og.beginPath();
      for (const pt of pts) {
        og.moveTo(pt.x + size / 2, pt.y);
        og.arc(pt.x, pt.y, size / 2, 0, Math.PI * 2);
      }
      og.clip();
      og.drawImage(src, offX, offY);
      og.restore();

      const blob = await canvasToBlob(out);
      if (!blob) return;
      const assetId = await putAssetBlob(blob);
      cacheBitmap(assetId, await createImageBitmap(blob));
      const layer = newImageLayer(
        0,
        0,
        p.width,
        p.height,
        { assetId, naturalW: W, naturalH: H, fit: 'fill' },
        'Retouch',
      );
      addLayer(layer);
      setAssets(await loadAssetMap(docAssetIds(docRef.current)));
    },
    [assets, pageIndex, brushSize, addLayer],
  );

  const paintStroke = useCallback(
    async (pts: { x: number; y: number }[]) => {
      if (!pts.length) return;
      const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      const W = Math.max(1, Math.round(p.width));
      const H = Math.max(1, Math.round(p.height));

      const existing = p.layers.find(
        (l) => l.type === 'image' && l.name === 'Brush' && Math.abs(l.w - p.width) < 1,
      );

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext('2d');
      if (!g) return;

      if (existing?.image) {
        let bmp: ImageBitmap | undefined = assets.get(existing.image.assetId);
        if (!bmp) {
          const blob = await getAssetBlob(existing.image.assetId);
          if (blob) bmp = await createImageBitmap(blob);
        }
        if (bmp) g.drawImage(bmp as CanvasImageSource, 0, 0, W, H);
      }

      g.strokeStyle = pickedColor;
      g.lineWidth = Math.max(1, brushSize);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      pts.forEach((pt, i) => (i ? g.lineTo(pt.x, pt.y) : g.moveTo(pt.x, pt.y)));
      if (pts.length === 1) g.lineTo(pts[0].x + 0.01, pts[0].y);
      g.stroke();

      const blob = await canvasToBlob(canvas);
      if (!blob) return;
      const assetId = await putAssetBlob(blob);
      cacheBitmap(assetId, await createImageBitmap(blob));
      const image = { assetId, naturalW: W, naturalH: H, fit: 'fill' as const };

      if (existing) {
        updateLayer(existing.id, { image }, 'paint');
      } else {
        addLayer(newImageLayer(0, 0, p.width, p.height, image, 'Brush'));
      }
      setAssets(await loadAssetMap(docAssetIds(docRef.current)));
    },
    [assets, pageIndex, pickedColor, brushSize, addLayer, updateLayer],
  );

  const dropGradient = useCallback(
    (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
      const layer = newGradientLayer(p.width, p.height, {
        kind: 'linear',
        angle,
        stopA: pickedColor,
        stopB: '#000000',
      });
      addLayer(layer);
      setTab('layers');
    },
    [pageIndex, pickedColor, addLayer],
  );

  /* ---------------- auto adjustments ---------------- */

  const autoTone = useCallback(async () => {
    const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
    const scale = Math.min(1, 900 / Math.max(p.width, p.height));
    const c = await renderPageToCanvas(p, assets, scale);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const stats = analyseImage(ctx.getImageData(0, 0, c.width, c.height), 2);
    const inBlack = Math.round(clamp(stats.low, 0, 0.42) * 255);
    const inWhite = Math.round(clamp(Math.max(stats.high, 0.5), 0.5, 1) * 255);
    const patch = {
      levels: { inBlack, inWhite: Math.max(inBlack + 10, inWhite), gamma: 1, outBlack: 0, outWhite: 255 },
    };
    if (gradeTarget === 'layer' && selected) {
      updateLayer(selected.id, { grade: { ...selected.grade, levels: patch.levels } }, 'auto');
    } else {
      mutate((d) => {
        const pg = d.pages[Math.min(pageIndex, d.pages.length - 1)];
        pg.grade.levels = patch.levels;
      }, 'auto');
    }
    onToast('Auto tone applied.');
    setTab('adjust');
  }, [assets, pageIndex, gradeTarget, selected, updateLayer, mutate, onToast]);

  const autoWhiteBalance = useCallback(async () => {
    const p = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
    const scale = Math.min(1, 900 / Math.max(p.width, p.height));
    const c = await renderPageToCanvas(p, assets, scale);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const stats = analyseImage(ctx.getImageData(0, 0, c.width, c.height), 2);
    const temperature = clamp(Math.round((stats.meanB - stats.meanR) * 320), -100, 100);
    const tint = clamp(Math.round((stats.meanG - (stats.meanR + stats.meanB) / 2) * 420), -100, 100);
    if (gradeTarget === 'layer' && selected) {
      updateLayer(
        selected.id,
        { grade: { ...selected.grade, temperature, tint } },
        'auto',
      );
    } else {
      mutate((d) => {
        const pg = d.pages[Math.min(pageIndex, d.pages.length - 1)];
        pg.grade.temperature = temperature;
        pg.grade.tint = tint;
      }, 'auto');
    }
    onToast(`White balance neutralised (${temperature > 0 ? '+' : ''}${temperature} temp).`);
    setTab('adjust');
  }, [assets, pageIndex, gradeTarget, selected, updateLayer, mutate, onToast]);

  /* ---------------- upscale ---------------- */

  const upscaleAsset = useCallback(
    async (layer: Layer, factor: number): Promise<Layer['image'] | null> => {
      if (!layer.image) return null;
      const blob = await getAssetBlob(layer.image.assetId);
      if (!blob) return null;
      const bmp = await createImageBitmap(blob);
      const outW = Math.round(bmp.width * factor);
      const outH = Math.round(bmp.height * factor);
      const outPixels = outW * outH;
      if (outPixels > 40_000_000) return null;

      let out: ImageData;
      if (outPixels <= 8_000_000) {
        const src = document.createElement('canvas');
        src.width = bmp.width;
        src.height = bmp.height;
        const sg = src.getContext('2d');
        if (!sg) return null;
        sg.drawImage(bmp, 0, 0);
        out = enhanceUpscale(sg.getImageData(0, 0, src.width, src.height), factor);
      } else {
        const dest = document.createElement('canvas');
        dest.width = outW;
        dest.height = outH;
        const dg = dest.getContext('2d');
        if (!dg) return null;
        dg.imageSmoothingEnabled = true;
        dg.imageSmoothingQuality = 'high';
        dg.drawImage(bmp, 0, 0, outW, outH);
        out = dg.getImageData(0, 0, outW, outH);
        sharpenInPlace(out, 0.55, Math.max(1, Math.round(factor)));
      }

      const oc = document.createElement('canvas');
      oc.width = out.width;
      oc.height = out.height;
      const ocg = oc.getContext('2d');
      if (!ocg) return null;
      ocg.putImageData(out, 0, 0);
      const outBlob = await canvasToBlob(oc);
      if (!outBlob) return null;
      const newId = await putAssetBlob(outBlob);
      cacheBitmap(newId, await createImageBitmap(outBlob));
      return { ...layer.image, assetId: newId, naturalW: out.width, naturalH: out.height };
    },
    [],
  );

  const upscaleLayer = useCallback(
    async (factor: number) => {
      if (!selected || selected.type !== 'image') return;
      onToast('Re-sampling the image…');
      const image = await upscaleAsset(selected, factor);
      if (!image) {
        onToast('That image is already at the maximum size.');
        return;
      }
      updateLayer(selected.id, { image }, 'upscale');
      setAssets(await loadAssetMap(docAssetIds(docRef.current)));
      onToast(`Upscaled to ${image.naturalW} × ${image.naturalH}.`);
    },
    [selected, upscaleAsset, updateLayer, onToast],
  );

  const upscalePage = useCallback(
    async (factor: number) => {
      onToast(`Rebuilding the canvas at ${factor}× …`);
      const current = docRef.current.pages[Math.min(pageIndex, docRef.current.pages.length - 1)];
      const replacements: { id: string; image: NonNullable<Layer['image']> }[] = [];
      for (const l of current.layers) {
        if (l.type === 'image' && l.image) {
          const image = await upscaleAsset(l, factor);
          if (image) replacements.push({ id: l.id, image });
        }
      }
      mutate((d) => {
        const p = d.pages[Math.min(pageIndex, d.pages.length - 1)];
        p.width = Math.round(p.width * factor);
        p.height = Math.round(p.height * factor);
        for (const l of p.layers) {
          l.x *= factor;
          l.y *= factor;
          l.w *= factor;
          l.h *= factor;
          if (l.type === 'text' && l.text) l.text.size *= factor;
          const rep = replacements.find((r) => r.id === l.id);
          if (rep) l.image = rep.image;
        }
      }, 'upscale');
      setAssets(await loadAssetMap(docAssetIds(docRef.current)));
      onToast('Canvas upscaled.');
    },
    [mutate, pageIndex, upscaleAsset, onToast],
  );

  /* ---------------- export ---------------- */

  const doExport = useCallback(
    async (opts: ExportOptions & { clipboard?: boolean }) => {
      const mime = MIME[opts.format] ?? 'image/png';
      if (opts.clipboard) {
        try {
          const result = await exportPage(page, assets, opts.scale, 'image/png', 1);
          if (!result) throw new Error('no blob');
          const item = new ClipboardItem({ 'image/png': result.blob });
          await navigator.clipboard.write([item]);
          onToast('Copied to the clipboard.');
        } catch {
          onToast('Your browser blocked the clipboard. Use Export instead.');
        }
        return;
      }
      const pages = opts.allPages ? docRef.current.pages : [page];
      for (const p of pages) {
        const result = await exportPage(p, assets, opts.scale, mime as 'image/png', opts.quality);
        if (!result) {
          onToast('That export could not be rendered. Try a smaller size.');
          continue;
        }
        const name =
          pages.length > 1
            ? `${safeName(docRef.current.name)}-${safeName(p.name)}.${EXT[opts.format]}`
            : `${safeName(docRef.current.name)}.${EXT[opts.format]}`;
        downloadBlob(result.blob, name);
        if (result.flat) {
          onToast('Exported, but it came out as one flat colour — check that your layers are visible and not fully masked.');
        } else if (pages.length === 1) {
          onToast(`Exported at ${result.width} × ${result.height}.`);
        }
      }
    },
    [assets, page, onToast],
  );

  const reportCursor = useCallback((x: number, y: number) => {
    const s = sessionRef.current;
    if (!s || s.status !== 'live') return;
    const now = Date.now();
    if (now - cursorClock.current < 70) return;
    cursorClock.current = now;
    s.sendCursor(x, y);
  }, []);

  const exit = useCallback(async () => {
    if (dirty.current || !collab || collab.role !== 'guest') await persist();
    onExit();
  }, [persist, onExit, collab]);

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest('input, textarea, select, [contenteditable="true"]')) return;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (meta && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        invertSelection();
        return;
      }
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void persist().then(() => onToast('Saved to this browser.'));
        return;
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (selected) {
          mutate((d) => {
            for (const p of d.pages) {
              const i = p.layers.findIndex((l) => l.id === selected.id);
              if (i >= 0) {
                const copy = clone(p.layers[i]);
                copy.id = 'l_' + Math.random().toString(36).slice(2, 10);
                copy.name += ' copy';
                copy.x += 18;
                copy.y += 18;
                p.layers.splice(i + 1, 0, copy);
                setSelectedIds([copy.id]);
              }
            }
          }, 'duplicate');
        }
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedIds.length) {
          e.preventDefault();
          mutate((d) => {
            for (const p of d.pages) p.layers = p.layers.filter((l) => !selectedIds.includes(l.id));
          }, 'delete');
          setSelectedIds([]);
        }
        return;
      }
      if (e.key === 'Escape') {
        setCrop(null);
        setSelectedIds([]);
        setSelection(null);
        return;
      }
      if (e.key.startsWith('Arrow') && selected) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        updateLayer(selected.id, { x: selected.x + dx, y: selected.y + dy }, 'nudge');
        return;
      }
      if (!meta) {
        const map: Record<string, Tool> = {
          v: 'move',
          m: 'marquee',
          l: 'lasso',
          w: 'wand',
          c: 'crop',
          b: 'brush',
          e: 'erase',
          s: 'clone',
          g: 'gradient',
          t: 'text',
          i: 'eyedrop',
          h: 'hand',
          z: 'zoom',
        };
        const t = map[e.key.toLowerCase()];
        if (t) setTool(t);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    undo,
    redo,
    selected,
    selectedIds,
    updateLayer,
    mutate,
    persist,
    onToast,
    selectAll,
    invertSelection,
  ]);

  /* ---------------- api ---------------- */

  const api: EditorApi = useMemo(
    () => ({
      doc,
      page,
      pageIndex,
      assets,
      tool,
      zoom,
      pan,
      selectedIds,
      selected,
      brushSize,
      cloneAnchor,
      gradeTarget,
      crop,
      remoteCursor,
      selection,
      selectionMode,
      wandTolerance,
      showGrid,
      snap,
      pickedColor,
      histogram,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
      history: past.current.map((p, i) => ({ label: p.label, index: i })),
      setTool: (t) => {
        setTool(t);
        if (t === 'crop') setCrop(null);
      },
      setZoom,
      setPan,
      setPageIndex: (i) => {
        setPageIndex(clamp(i, 0, doc.pages.length - 1));
        setSelectedIds([]);
        setSelection(null);
      },
      select: setSelectedIds,
      setBrushSize,
      setGradeTarget,
      setCrop,
      setSelectionMode,
      setWandTolerance,
      setShowGrid,
      setSnap,
      setPickedColor,
      autoTone: () => void autoTone(),
      autoWhiteBalance: () => void autoWhiteBalance(),
      jumpHistory,
      mutate,
      updateLayer,
      setGrade: (patch: Partial<Grade>, label = 'grade') => {
        mutate((d) => {
          if (gradeTarget === 'page') {
            const p = d.pages[Math.min(pageIndex, d.pages.length - 1)];
            Object.assign(p.grade, patch);
          } else if (selected) {
            for (const p of d.pages) {
              const l = p.layers.find((x) => x.id === selected.id);
              if (l) Object.assign(l.grade, patch);
            }
          }
        }, label);
      },
      setPage: (patch: Partial<Page>, label = 'page') => {
        mutate((d) => {
          Object.assign(d.pages[Math.min(pageIndex, d.pages.length - 1)], patch);
        }, label);
      },
      addLayer,
      notify: onToast,
      openTypeTab: () => setTab('type'),
      reportCursor,
      commitSelection,
      clearSelection,
      invertSelection,
      selectAll,
      magicWand: (x, y) => void magicWand(x, y),
      maskToSelection: () => void maskToSelection(),
      fillSelection: (color) => void fillSelection(color),
      deleteSelection: () => void deleteSelection(),
      cropToSelection,
      setCloneAnchor: (x: number, y: number) => setCloneAnchor({ x, y }),
      cloneStroke: (pts, anchor) => void cloneStroke(pts, anchor),
      paintStroke: (pts) => void paintStroke(pts),
      sampleColor: (x, y) => void sampleColor(x, y),
      dropGradient,
    }),
    [
      doc,
      page,
      pageIndex,
      assets,
      tool,
      zoom,
      pan,
      selectedIds,
      selected,
      brushSize,
      cloneAnchor,
      gradeTarget,
      crop,
      remoteCursor,
      selection,
      selectionMode,
      wandTolerance,
      showGrid,
      snap,
      pickedColor,
      histogram,
      histTick,
      mutate,
      updateLayer,
      addLayer,
      onToast,
      reportCursor,
      commitSelection,
      clearSelection,
      invertSelection,
      selectAll,
      magicWand,
      maskToSelection,
      fillSelection,
      deleteSelection,
      cropToSelection,
      cloneStroke,
      paintStroke,
      sampleColor,
      dropGradient,
      autoTone,
      autoWhiteBalance,
      jumpHistory,
      setSelectionMode,
    ],
  );

  /* ---------------- sidebar resizing ---------------- */

  const startResize = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = side === 'left' ? leftW : rightW;
    const move = (ev: PointerEvent) => {
      const d = ev.clientX - startX;
      if (side === 'left') setLeftW(clamp(startW + d, 204, 500));
      else setRightW(clamp(startW - d, 190, 470));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  /* Tools live in ToolBar.tsx */

  const statusDot =
    collabStatus === 'live' ? 'live' : collabStatus === 'error' ? 'err' : sharing ? 'wait' : '';

  const optionsBar = (() => {
    if (tool === 'brush' || tool === 'erase' || tool === 'clone') {
      return (
        <>
          <span className="lbl" style={{ width: 62 }}>
            Brush
          </span>
          <input
            type="range"
            min={4}
            max={900}
            value={brushSize}
            style={{ maxWidth: 220 }}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span className="hint mono">{brushSize}px</span>
          <span className="hint">
            {tool === 'clone'
              ? 'Alt-click to set the source, then drag to retouch.'
              : tool === 'erase'
                ? 'Cuts into the selected layer with a mask.'
                : `Paints ${pickedColor} onto a Brush layer. Pick a colour with the eyedropper.`}
          </span>
        </>
      );
    }
    if (tool === 'wand') {
      return (
        <>
          <span className="lbl" style={{ width: 62 }}>
            Tolerance
          </span>
          <input
            type="range"
            min={1}
            max={100}
            value={wandTolerance}
            style={{ maxWidth: 220 }}
            onChange={(e) => setWandTolerance(Number(e.target.value))}
          />
          <span className="hint mono">{wandTolerance}</span>
          <span className="hint">Click a colour region to select it.</span>
        </>
      );
    }
    if (tool === 'marquee' || tool === 'ellipse' || tool === 'lasso') {
      return (
        <>
          <span className="lbl" style={{ width: 62 }}>
            Mode
          </span>
          {(['new', 'add', 'subtract'] as SelectionMode[]).map((m) => (
            <Btn
              key={m}
              size="sm"
              variant={selectionMode === m ? 'solid' : 'ghost'}
              onClick={() => setSelectionMode(m)}
            >
              {m === 'new' ? 'New' : m === 'add' ? 'Add' : 'Subtract'}
            </Btn>
          ))}
          <span className="hint">Shift adds, Option subtracts. ⌘A selects all, ⌘I inverts.</span>
        </>
      );
    }
    if (tool === 'gradient') {
      return <span className="hint">Drag across the canvas to place a gradient layer.</span>;
    }
    return (
      <span className="hint">
        {selection
          ? `Selection ${Math.round(selection.w)} × ${Math.round(selection.h)} — Delete, Fill or Mask from the Select panel.`
          : 'Snap and grid live in the bottom left of the canvas.'}
      </span>
    );
  })();

  return (
    <div className="app fixed">
      <Header
        onHome={() => void exit()}
        actions={
          <>
            <IconBtn title="Undo (⌘Z)" onClick={undo}>
              ↺
            </IconBtn>
            <IconBtn title="Redo (⌘⇧Z)" onClick={redo}>
              ↻
            </IconBtn>
            <span className="hdr-sep" />
            <Btn
              onClick={() => {
                setShowShare(true);
                if (!sharing) setSharing(true);
              }}
            >
              Share
            </Btn>
            <Btn variant="solid" onClick={() => setShowExport(true)}>
              Export
            </Btn>
            <IconBtn title="Back to projects" onClick={() => void exit()}>
              ✕
            </IconBtn>
          </>
        }
      >
        <div className="hdr-sub">
          <input
            className="hdr-sub-name"
            value={doc.name}
            onChange={(e) => {
              const name = e.target.value;
              mutate((d) => {
                d.name = name;
              }, 'rename');
            }}
            spellCheck={false}
          />
          <span className="hdr-sep" />
          <span className="hint" style={{ fontSize: 9 }}>
            Page {pageIndex + 1}/{doc.pages.length}
          </span>
        </div>
      </Header>

      <ToolBar
        api={api}
        onImportImage={() => imageInputRef.current?.click()}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
      />

      <div className="main">
        <div
          className="editor"
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setDragOver(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragOver(false);
            const files = Array.from(e.dataTransfer.files);
            if (files.length) void importImages(files);
          }}
        >
          {leftOpen && (
            <>
              <aside className="side left" style={{ width: leftW }}>
                <div className="side-head">
                  <span className="side-title">Editor</span>
                  <IconBtn title="Collapse panel" onClick={() => setLeftOpen(false)}>
                    ‹
                  </IconBtn>
                </div>
                <LeftPanel
                  api={api}
                  tab={tab}
                  setTab={setTab}
                  fonts={fonts}
                  onUploadFont={(f) => void uploadFont(f)}
                  onImportImage={() => imageInputRef.current?.click()}
                  onApplyCrop={applyCrop}
                  onUpscale={(f) => void upscalePage(f)}
                  onAddPage={addPage}
                  onDuplicatePage={duplicatePage}
                  onDeletePage={deletePage}
                  onFlip={(axis) => selected && updateLayer(selected.id, { flipX: axis === 'x' ? !selected.flipX : selected.flipX, flipY: axis === 'y' ? !selected.flipY : selected.flipY }, 'flip')}
                  onRotateLayer={(dir) =>
                    mutate((d) => {
                      for (const p of d.pages) {
                        const l = p.layers.find((x) => x.id === selected?.id);
                        if (l) rotateLayerQuarter(l, dir);
                      }
                    }, 'rotate')
                  }
                />
              </aside>
              <div className="resizer" onPointerDown={startResize('left')} />
            </>
          )}

          <div className="stage-wrap">
            <CanvasStage api={api} />
            {page.layers.length === 0 && (
              <div className="stage-empty">
                <h3>This canvas is empty</h3>
                <p>Drop a photo anywhere, paste it with ⌘V, or import one.</p>
                <Btn variant="solid" onClick={() => imageInputRef.current?.click()}>
                  Import an image
                </Btn>
              </div>
            )}
            {dragOver && <div className="stage-drop">Drop to place on the canvas</div>}
          </div>

          {rightOpen && (
            <>
              <div className="resizer" onPointerDown={startResize('right')} />
              <aside className="side right" style={{ width: rightW }}>
                <div className="side-head">
                  <span className="side-title">Properties</span>
                  {sharing && (
                    <span className="hstack" title={collabDetail ?? ''}>
                      <span className={'dot ' + statusDot} />
                    </span>
                  )}
                  <IconBtn title="Collapse panel" onClick={() => setRightOpen(false)}>
                    ›
                  </IconBtn>
                </div>
                <div className="side-body">
                  <PropertiesPanel
                    api={api}
                    onUpscaleLayer={(f) => void upscaleLayer(f)}
                    onAlign={(mode) => {
                      const layers = page.layers.filter((l) => selectedIds.includes(l.id));
                      if (!layers.length) return;
                      const box = boundsOfLayers(layers);
                      if (!box) return;
                      mutate((d) => {
                        const pg = d.pages[Math.min(pageIndex, d.pages.length - 1)];
                        const targets = pg.layers.filter((l) => selectedIds.includes(l.id));
                        for (const l of targets) {
                          if (mode === 'left') l.x = 0;
                          if (mode === 'right') l.x = pg.width - l.w;
                          if (mode === 'hcenter') l.x = Math.round((pg.width - l.w) / 2);
                          if (mode === 'top') l.y = 0;
                          if (mode === 'bottom') l.y = pg.height - l.h;
                          if (mode === 'vcenter') l.y = Math.round((pg.height - l.h) / 2);
                          if (mode === 'distributeH' && targets.length > 1) {
                            const gap = (pg.width - targets.reduce((s, t) => s + t.w, 0)) / (targets.length + 1);
                            let cursor = gap;
                            for (const t of targets) {
                              t.x = Math.round(cursor);
                              cursor += t.w + gap;
                            }
                          }
                          if (mode === 'distributeV' && targets.length > 1) {
                            const gap = (pg.height - targets.reduce((s, t) => s + t.h, 0)) / (targets.length + 1);
                            let cursor = gap;
                            for (const t of targets) {
                              t.y = Math.round(cursor);
                              cursor += t.h + gap;
                            }
                          }
                        }
                      }, 'align');
                    }}
                    onFlip={(axis) => {
                      const layers = page.layers.filter((l) => selectedIds.includes(l.id));
                      if (!layers.length) return;
                      mutate((d) => {
                        const pg = d.pages[Math.min(pageIndex, d.pages.length - 1)];
                        for (const l of pg.layers) {
                          if (selectedIds.includes(l.id)) flipLayer(l, axis);
                        }
                      }, 'flip');
                    }}
                    onRotateLayer={(dir) =>
                      mutate((d) => {
                        const pg = d.pages[Math.min(pageIndex, d.pages.length - 1)];
                        for (const l of pg.layers) {
                          if (selectedIds.includes(l.id)) rotateLayerQuarter(l, dir);
                        }
                      }, 'rotate')
                    }
                  />
                </div>
              </aside>
            </>
          )}
        </div>

        <div
          className="row"
          style={{
            padding: '6px 12px',
            borderTop: '1px solid var(--line)',
            background: 'var(--panel)',
            gap: 12,
            minHeight: 34,
            flexWrap: 'wrap',
          }}
        >
          {optionsBar}
          <span className="spacer" />
          <span className="hstack" title="Picked colour">
            <span
              className="swatch-chip"
              style={{ background: pickedColor, width: 16, height: 16, border: '1px solid #333' }}
            />
            <span className="hint mono">{pickedColor}</span>
          </span>
        </div>

        <div className="pages-bar">
          <span className="pages-label">Pages</span>
          {doc.pages.map((p, i) => (
            <button
              key={p.id}
              className={'page-chip' + (i === pageIndex ? ' active' : '')}
              onClick={() => {
                setPageIndex(i);
                setSelectedIds([]);
                setSelection(null);
              }}
            >
              {i + 1}. {p.name}
            </button>
          ))}
          <button className="page-chip" onClick={addPage} title="Add page">
            +
          </button>
          <span className="spacer" />
          <span className="hint mono">
            {page.width} × {page.height}
          </span>
          <span className="hint" style={{ marginLeft: 10 }}>
            {docAssetIds(doc).length} asset(s)
          </span>
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void importImages(files);
        }}
      />

      {showExport && (
        <ExportModal
          page={page}
          pageCount={doc.pages.length}
          projectName={doc.name}
          onExport={doExport}
          onClose={() => setShowExport(false)}
        />
      )}

      {showShare && (
        <ShareModal
          code={code}
          status={sharing ? collabStatus : 'idle'}
          detail={collabDetail}
          peers={peers}
          remoteName={remoteName}
          onRegenerate={() => {
            if (collab?.role === 'guest') {
              onToast('Only the host can change the code.');
              return;
            }
            setSharing(true);
            setCode(randomCode());
            onToast('New code generated.');
          }}
          onCopy={async () => {
            if (!sharing) setSharing(true);
            try {
              await navigator.clipboard.writeText(code);
              onToast('Code copied. Send it to your collaborator.');
            } catch {
              onToast(`Your code is ${code}`);
            }
          }}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

export function ensureFontsReady(_families: string[]) {
  void ensureFont('Supreme');
}
