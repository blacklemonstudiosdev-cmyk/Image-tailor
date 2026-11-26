import React, { useState } from 'react';
import { ProjectMeta } from '../types';
import { formatDate } from '../lib/utils';
import { Btn, ContextMenu, MenuItem, Modal, TextField } from './ui';

export function Dashboard({
  projects,
  loading,
  onOpen,
  onNew,
  onJoin,
  onDuplicate,
  onDelete,
  onExport,
  onRename,
}: {
  projects: ProjectMeta[];
  loading: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onJoin: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ProjectMeta | null>(null);

  const menuItems = (p: ProjectMeta): MenuItem[] => [
    { label: 'Open', onClick: () => onOpen(p.id), key: '↵' },
    { label: 'Duplicate', onClick: () => onDuplicate(p.id) },
    {
      label: 'Rename',
      onClick: () => {
        setRenaming(p);
        setRenameValue(p.name);
      },
    },
    { separator: true, label: 'sep1' },
    { label: 'Export as PNG', onClick: () => onExport(p.id) },
    { separator: true, label: 'sep2' },
    { label: 'Delete', danger: true, onClick: () => setConfirmDelete(p) },
  ];

  return (
    <div className="dash">
      <div className="dash-bar">
        <h2 className="dash-title">Your Projects</h2>
        <span className="dash-count">
          {projects.length} {projects.length === 1 ? 'document' : 'documents'}
        </span>
        <Btn onClick={onJoin}>Join with code</Btn>
        <Btn variant="solid" onClick={onNew}>
          New Project
        </Btn>
      </div>

      {loading && projects.length === 0 && (
        <div className="empty-state">
          <h2>Loading your work</h2>
          <p>Reading your local library.</p>
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="empty-state">
          <h2>No edits yet</h2>
          <p>
            Image Tailor keeps every document in your browser. Start a new project to build a
            composition with layers, colour grading and type — or join someone else&rsquo;s session
            with a six digit code.
          </p>
          <div className="row">
            <Btn variant="solid" onClick={onNew}>
              New Project
            </Btn>
            <Btn onClick={onJoin}>Join with code</Btn>
          </div>
        </div>
      )}

      {projects.length > 0 && (
        <div className="gallery">
          {projects.map((p) => (
            <div
              key={p.id}
              className="card"
              onClick={() => onOpen(p.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, id: p.id });
              }}
            >
              <div className={'card-thumb' + (p.thumb ? '' : ' empty')}>
                {p.thumb && <img src={p.thumb} alt={p.name} draggable={false} />}
                <div className="card-actions">
                  <button
                    type="button"
                    className="card-more"
                    aria-label="Project actions"
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setMenu({ x: r.left, y: r.bottom + 4, id: p.id });
                    }}
                  >
                    ⋯
                  </button>
                </div>
              </div>
              <div className="card-meta">
                <div className="card-name">{p.name}</div>
                <div className="card-sub">
                  <span>{formatDate(p.updatedAt)}</span>
                  <span>·</span>
                  <span>
                    {p.width}×{p.height}
                  </span>
                  {p.pages > 1 && (
                    <>
                      <span>·</span>
                      <span>{p.pages}p</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {menu && projects.some((p) => p.id === menu.id) && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(projects.find((p) => p.id === menu.id)!)}
          onClose={() => setMenu(null)}
        />
      )}

      {renaming && (
        <Modal
          title="Rename project"
          onClose={() => setRenaming(null)}
          footer={
            <>
              <Btn onClick={() => setRenaming(null)}>Cancel</Btn>
              <Btn
                variant="solid"
                onClick={() => {
                  onRename(renaming.id, renameValue.trim() || renaming.name);
                  setRenaming(null);
                }}
              >
                Save
              </Btn>
            </>
          }
        >
          <TextField
            label="Project name"
            value={renameValue}
            onChange={setRenameValue}
          />
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title="Delete project"
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Btn onClick={() => setConfirmDelete(null)}>Keep it</Btn>
              <Btn
                variant="danger"
                onClick={() => {
                  onDelete(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Delete permanently
              </Btn>
            </>
          }
        >
          <p className="hint" style={{ fontSize: 11 }}>
            &ldquo;{confirmDelete.name}&rdquo; and its layers will be removed from this browser.
            This cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  );
}
