/* Project persistence: IndexedDB documents, thumbnails and binary assets. */

import { Doc, ProjectMeta } from '../types';
import { cloneDoc } from './doc';
import {
  idbDelete,
  idbGet,
  idbGetAll,
  idbKeys,
  idbPut,
  STORE_ASSETS,
  STORE_DOCS,
  STORE_PROJECTS,
} from './idb';
import { AssetMap } from './render';
import { uid } from './utils';

export async function listProjects(): Promise<ProjectMeta[]> {
  const all = await idbGetAll<ProjectMeta>(STORE_PROJECTS);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProjectMeta(id: string): Promise<ProjectMeta | undefined> {
  return idbGet<ProjectMeta>(STORE_PROJECTS, id);
}

export async function getDoc(id: string): Promise<Doc | null> {
  const d = await idbGet<Doc>(STORE_DOCS, id);
  return d ?? null;
}

export async function saveDoc(doc: Doc, thumb: string): Promise<ProjectMeta> {
  const meta: ProjectMeta = {
    id: doc.id,
    name: doc.name,
    createdAt: 0,
    updatedAt: Date.now(),
    thumb,
    width: doc.pages[0]?.width ?? 0,
    height: doc.pages[0]?.height ?? 0,
    pages: doc.pages.length,
  };
  const prev = await idbGet<ProjectMeta>(STORE_PROJECTS, doc.id);
  meta.createdAt = prev?.createdAt ?? Date.now();
  if (!thumb && prev) meta.thumb = prev.thumb;
  await idbPut(STORE_DOCS, doc.id, doc);
  await idbPut(STORE_PROJECTS, doc.id, meta);
  return meta;
}

export async function touchDoc(doc: Doc): Promise<void> {
  const prev = await idbGet<ProjectMeta>(STORE_PROJECTS, doc.id);
  const meta: ProjectMeta = {
    id: doc.id,
    name: doc.name,
    createdAt: prev?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    thumb: prev?.thumb ?? '',
    width: doc.pages[0]?.width ?? 0,
    height: doc.pages[0]?.height ?? 0,
    pages: doc.pages.length,
  };
  await idbPut(STORE_DOCS, doc.id, doc);
  await idbPut(STORE_PROJECTS, doc.id, meta);
}

export async function renameProject(id: string, name: string): Promise<void> {
  const doc = await getDoc(id);
  if (!doc) return;
  doc.name = name;
  await touchDoc(doc);
}

export async function duplicateProject(id: string): Promise<Doc | null> {
  const doc = await getDoc(id);
  if (!doc) return null;
  const prev = await idbGet<ProjectMeta>(STORE_PROJECTS, id);
  const copy = cloneDoc(doc, `${doc.name} copy`);
  await saveDoc(copy, prev?.thumb ?? '');
  return copy;
}

export async function removeProject(id: string): Promise<void> {
  await idbDelete(STORE_PROJECTS, id);
  await idbDelete(STORE_DOCS, id);
  await pruneAssets();
}

/** Delete asset blobs no document references any more. */
export async function pruneAssets(): Promise<void> {
  const docs = await idbGetAll<Doc>(STORE_DOCS);
  const keep = new Set<string>();
  for (const d of docs) {
    for (const p of d.pages ?? []) {
      for (const l of p.layers ?? []) {
        if (l.type === 'image' && l.image?.assetId) keep.add(l.image.assetId);
        if (l.maskAsset) keep.add(l.maskAsset);
      }
    }
  }
  const keys = await idbKeys(STORE_ASSETS);
  for (const k of keys) {
    if (!keep.has(k)) await idbDelete(STORE_ASSETS, k);
  }
}

export async function putAssetBlob(blob: Blob): Promise<string> {
  const id = uid('a_');
  await idbPut(STORE_ASSETS, id, blob);
  return id;
}

export async function putAssetWithId(id: string, blob: Blob): Promise<void> {
  await idbPut(STORE_ASSETS, id, blob);
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  return idbGet<Blob>(STORE_ASSETS, id);
}

const bitmapCache = new Map<string, ImageBitmap>();

export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

export async function loadAssetMap(
  ids: string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<AssetMap> {
  const map: AssetMap = new Map();
  const missing = ids.filter((id) => !bitmapCache.has(id));
  let done = 0;
  await Promise.all(
    missing.map(async (id) => {
      const blob = await getAssetBlob(id);
      if (!blob) return;
      try {
        const bmp = await decodeImage(blob);
        bitmapCache.set(id, bmp);
      } catch {
        /* unreadable asset */
      }
      done++;
      onProgress?.(done, missing.length);
    }),
  );
  for (const id of ids) {
    const bmp = bitmapCache.get(id);
    if (bmp) map.set(id, bmp);
  }
  return map;
}

export function getCachedBitmap(id: string): ImageBitmap | undefined {
  return bitmapCache.get(id);
}

export function cacheBitmap(id: string, bmp: ImageBitmap) {
  bitmapCache.set(id, bmp);
}

export async function importImageFile(file: File): Promise<{ assetId: string; w: number; h: number }> {
  const bmp = await decodeImage(file);
  const assetId = await putAssetBlob(file);
  cacheBitmap(assetId, bmp);
  return { assetId, w: bmp.width, h: bmp.height };
}

export function countProjects(metas: ProjectMeta[]): number {
  return metas.length;
}
