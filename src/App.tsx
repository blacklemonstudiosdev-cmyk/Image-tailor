import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Doc, ProjectMeta } from './types';
import { docAssetIds, newDoc, newImageLayer, newPage } from './lib/doc';
import { makeThumb, renderPageToBlob } from './lib/render';
import {
  duplicateProject,
  getDoc,
  importImageFile,
  listProjects,
  loadAssetMap,
  removeProject,
  renameProject,
  saveDoc,
} from './lib/store';
import { downloadBlob, safeName } from './lib/utils';
import { Dashboard } from './components/Dashboard';
import { Editor } from './components/Editor';
import { Header } from './components/Header';
import {
  JoinModal,
  NewProjectModal,
  StartFreshModal,
} from './components/Modals';
import { Btn, ToastItem, Toasts, Modal } from './components/ui';

type View =
  | { name: 'dashboard' }
  | { name: 'editor'; doc: Doc; collab?: { role: 'host' | 'guest'; code: string } };

export function App() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [modal, setModal] = useState<'new' | 'fresh' | 'join' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const toast = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await listProjects();
      setProjects(list);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openEditor = useCallback(
    (doc: Doc, collab?: { role: 'host' | 'guest'; code: string }) => {
      setView({ name: 'editor', doc, collab });
    },
    [],
  );

  /* ---------------- creating ---------------- */

  const finishCreate = useCallback(
    async (doc: Doc) => {
      const assets = await loadAssetMap(docAssetIds(doc));
      const thumb = await makeThumb(doc, assets);
      await saveDoc(doc, thumb);
      await refresh();
      openEditor(doc);
    },
    [openEditor, refresh],
  );

  const createFromFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (!images.length) {
        toast('Those files are not images.');
        return;
      }
      setBusy('Importing…');
      try {
        const first = await importImageFile(images[0]);
        const page = newPage(first.w, first.h, 'Page 1');
        page.bg = '#000000';
        page.bgAlpha = 100;
        page.layers.push(
          newImageLayer(
            0,
            0,
            first.w,
            first.h,
            { assetId: first.assetId, naturalW: first.w, naturalH: first.h, fit: 'cover' },
            images[0].name.replace(/\.[^.]+$/, '').slice(0, 40),
          ),
        );
        for (const file of images.slice(1)) {
          const info = await importImageFile(file);
          const scale = Math.min((first.w * 0.6) / info.w, (first.h * 0.6) / info.h, 1);
          const w = Math.round(info.w * scale);
          const h = Math.round(info.h * scale);
          page.layers.push(
            newImageLayer(
              Math.round((first.w - w) / 2),
              Math.round((first.h - h) / 2),
              w,
              h,
              { assetId: info.assetId, naturalW: info.w, naturalH: info.h, fit: 'cover' },
              file.name.replace(/\.[^.]+$/, '').slice(0, 40),
            ),
          );
        }
        const doc = newDoc(images[0].name.replace(/\.[^.]+$/, '').slice(0, 48) || 'Untitled', [page]);
        await finishCreate(doc);
        setModal(null);
      } catch {
        toast('That file could not be opened.');
      } finally {
        setBusy(null);
      }
    },
    [finishCreate, toast],
  );

  const createFresh = useCallback(
    async (opts: {
      width: number;
      height: number;
      bg: string;
      name: string;
      transparent: boolean;
    }) => {
      const page = newPage(opts.width, opts.height, 'Page 1');
      page.bg = opts.bg;
      page.bgAlpha = opts.transparent ? 0 : 100;
      const doc = newDoc(opts.name, [page]);
      setBusy('Creating…');
      try {
        await finishCreate(doc);
        setModal(null);
      } finally {
        setBusy(null);
      }
    },
    [finishCreate],
  );

  /* ---------------- dashboard actions ---------------- */

  const openProject = useCallback(
    async (id: string) => {
      const doc = await getDoc(id);
      if (!doc) {
        toast('That project could not be found.');
        void refresh();
        return;
      }
      openEditor(doc);
    },
    [openEditor, refresh, toast],
  );

  const onDuplicate = useCallback(
    async (id: string) => {
      const copy = await duplicateProject(id);
      await refresh();
      toast(copy ? `Duplicated as “${copy.name}”.` : 'Could not duplicate.');
    },
    [refresh, toast],
  );

  const onDelete = useCallback(
    async (id: string) => {
      await removeProject(id);
      await refresh();
      toast('Project deleted.');
    },
    [refresh, toast],
  );

  const onRename = useCallback(
    async (id: string, name: string) => {
      await renameProject(id, name);
      await refresh();
    },
    [refresh],
  );

  const onExport = useCallback(
    async (id: string) => {
      const doc = await getDoc(id);
      if (!doc) return;
      toast('Rendering export…');
      const assets = await loadAssetMap(docAssetIds(doc));
      const blob = await renderPageToBlob(doc.pages[0], assets, 1, 'image/png', 0.92);
      if (blob) downloadBlob(blob, `${safeName(doc.name)}.png`);
      else toast('Export failed.');
    },
    [toast],
  );

  const onJoin = useCallback(
    (code: string) => {
      const doc = newDoc(`Shared session ${code}`);
      setModal(null);
      setView({ name: 'editor', doc, collab: { role: 'guest', code } });
      toast(`Joining session ${code}…`);
    },
    [toast],
  );

  const goHome = useCallback(() => {
    setView({ name: 'dashboard' });
    void refresh();
  }, [refresh]);

  /* ---------------- render ---------------- */

  if (view.name === 'editor') {
    return (
      <>
        <Editor
          key={view.collab ? `${view.collab.code}-${view.collab.role}` : view.doc.id}
          initialDoc={view.doc}
          collab={view.collab}
          onExit={goHome}
          onToast={toast}
        />
        <Toasts items={toasts} />
        {busy && <BusyOverlay label={busy} />}
      </>
    );
  }

  return (
    <div className="app">
      <Header />
      <div
        className="main"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          if (files.length) void createFromFiles(files);
        }}
      >
        <Dashboard
          projects={projects}
          loading={loading}
          onOpen={openProject}
          onNew={() => setModal('new')}
          onJoin={() => setModal('join')}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExport={onExport}
          onRename={onRename}
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) void createFromFiles(files);
        }}
      />

      {modal === 'new' && (
        <NewProjectModal
          onImport={() => {
            setModal(null);
            fileRef.current?.click();
          }}
          onFresh={() => setModal('fresh')}
          onClose={() => setModal(null)}
        />
      )}

      {modal === 'fresh' && (
        <StartFreshModal onCreate={(opts) => void createFresh(opts)} onClose={() => setModal(null)} />
      )}

      {modal === 'join' && <JoinModal onJoin={onJoin} onClose={() => setModal(null)} />}

      <Toasts items={toasts} />
      {busy && <BusyOverlay label={busy} />}
    </div>
  );
}

function BusyOverlay({ label }: { label: string }) {
  return (
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 320 }}>
        <div className="modal-head">
          <h2 className="modal-title">Working</h2>
        </div>
        <div className="modal-body">
          <div className="hint" style={{ fontSize: 11 }}>
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}
