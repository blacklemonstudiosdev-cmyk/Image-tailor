import React, { useState } from 'react';
import { Page } from '../types';
import { Btn, Check, Modal, Select, Slider, TextField } from './ui';

/* ------------------------------------------------------------------ */
/* New project                                                         */
/* ------------------------------------------------------------------ */

export function NewProjectModal({
  onImport,
  onFresh,
  onClose,
}: {
  onImport: () => void;
  onFresh: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="New Project" onClose={onClose} wide>
      <div className="choice">
        <button type="button" className="choice-card" onClick={onImport}>
          <span className="choice-kicker">Option 01</span>
          <span className="choice-title">Import an Image</span>
          <span className="choice-desc">
            Drop in a photograph or a whole set. Each file becomes a layer, fitted to a canvas that
            matches the first image.
          </span>
        </button>
        <button type="button" className="choice-card" onClick={onFresh}>
          <span className="choice-kicker">Option 02</span>
          <span className="choice-title">Start Fresh</span>
          <span className="choice-desc">
            Begin with an empty canvas at any size. Build up layers, type, shapes and colour from
            nothing.
          </span>
        </button>
      </div>
    </Modal>
  );
}

const SIZE_PRESETS = [
  { label: 'Landscape 16:9 — 1920 × 1080', w: 1920, h: 1080 },
  { label: 'Portrait 4:5 — 1200 × 1500', w: 1200, h: 1500 },
  { label: 'Square 1:1 — 1500 × 1500', w: 1500, h: 1500 },
  { label: 'Social Story — 1080 × 1920', w: 1080, h: 1920 },
  { label: 'A4 Print — 2480 × 3508', w: 2480, h: 3508 },
  { label: 'Desktop 4K — 3840 × 2160', w: 3840, h: 2160 },
];

export function StartFreshModal({
  onCreate,
  onClose,
}: {
  onCreate: (opts: {
    width: number;
    height: number;
    bg: string;
    name: string;
    transparent: boolean;
  }) => void;
  onClose: () => void;
}) {
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [bg, setBg] = useState('#ffffff');
  const [name, setName] = useState('Untitled');
  const [transparent, setTransparent] = useState(false);

  return (
    <Modal
      title="Start Fresh"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant="solid"
            onClick={() =>
              onCreate({
                width: Math.max(16, Math.round(w)),
                height: Math.max(16, Math.round(h)),
                bg,
                name: name.trim() || 'Untitled',
                transparent,
              })
            }
          >
            Create canvas
          </Btn>
        </>
      }
    >
      <TextField label="Project name" value={name} onChange={setName} />
      <Select
        label="Size preset"
        value={`${w}x${h}`}
        onChange={(v) => {
          const p = SIZE_PRESETS.find((s) => `${s.w}x${s.h}` === v);
          if (p) {
            setW(p.w);
            setH(p.h);
          }
        }}
        options={[
          ...(SIZE_PRESETS.some((p) => `${p.w}x${p.h}` === `${w}x${h}`)
            ? []
            : [{ value: `${w}x${h}`, label: 'Custom' }]),
          ...SIZE_PRESETS.map((p) => ({ value: `${p.w}x${p.h}`, label: p.label })),
        ]}
      />
      <div className="grid2">
        <label className="field">
          <span className="lbl">Width</span>
          <input
            className="input mono"
            type="number"
            value={w}
            onChange={(e) => setW(Number(e.target.value) || 0)}
          />
        </label>
        <label className="field">
          <span className="lbl">Height</span>
          <input
            className="input mono"
            type="number"
            value={h}
            onChange={(e) => setH(Number(e.target.value) || 0)}
          />
        </label>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label className="lbl">Background</label>
          <div className="row tight" style={{ marginTop: 5 }}>
            <input
              type="color"
              style={{ width: 48 }}
              value={bg}
              disabled={transparent}
              onChange={(e) => setBg(e.target.value)}
            />
            <input
              className="input mono"
              value={transparent ? 'transparent' : bg}
              disabled={transparent}
              onChange={(e) => setBg(e.target.value)}
            />
          </div>
        </div>
        <Check label="Transparent" checked={transparent} onChange={setTransparent} />
      </div>
      <p className="hint">
        You can change the canvas size, background and orientation at any time from the Canvas
        panel inside the editor.
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Join                                                                */
/* ------------------------------------------------------------------ */

export function JoinModal({
  onJoin,
  onClose,
}: {
  onJoin: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState('');
  const digits = code.replace(/\D/g, '').slice(0, 6);
  return (
    <Modal
      title="Join a session"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="solid" disabled={digits.length !== 6} onClick={() => onJoin(digits)}>
            Join
          </Btn>
        </>
      }
    >
      <p className="hint" style={{ fontSize: 11 }}>
        Enter the six digit code the host shared. When the session connects, their document arrives
        here and every change syncs between you live.
      </p>
      <div className="field">
        <label>Session code</label>
        <input
          className="input mono"
          style={{ fontSize: 22, letterSpacing: '0.3em', height: 48, textAlign: 'center' }}
          value={digits}
          inputMode="numeric"
          placeholder="000000"
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Share / collaborate                                                 */
/* ------------------------------------------------------------------ */

export function ShareModal({
  code,
  status,
  detail,
  peers,
  remoteName,
  onRegenerate,
  onCopy,
  onClose,
}: {
  code: string;
  status: 'idle' | 'connecting' | 'waiting' | 'live' | 'error' | 'closed';
  detail?: string;
  peers: number;
  remoteName: string | null;
  onRegenerate: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const statusText =
    status === 'live'
      ? remoteName
        ? `Live with ${remoteName}`
        : 'Live'
      : status === 'waiting'
        ? 'Waiting for someone to join'
        : status === 'connecting'
          ? 'Connecting to the relay…'
          : status === 'error'
            ? 'Connection problem'
            : status === 'closed'
              ? 'Session ended'
              : 'Not sharing';

  return (
    <Modal
      title="Collaborate"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onRegenerate}>New code</Btn>
          <Btn variant="solid" onClick={onCopy}>
            Copy code
          </Btn>
        </>
      }
    >
      <div className="code-display">{code}</div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="hstack">
          <span
            className={
              'dot ' + (status === 'live' ? 'live' : status === 'error' ? 'err' : 'wait')
            }
          />
          <span className="hint" style={{ fontSize: 10.5 }}>
            {statusText}
          </span>
        </div>
        <span className="hint" style={{ fontSize: 10 }}>
          {peers > 0 ? '1 collaborator connected' : 'No one connected yet'}
        </span>
      </div>
      {detail && status === 'error' && <div className="banner error">{detail}</div>}
      <p className="hint">
        Share this code with anyone you want to work with. They open Image Tailor, choose
        &ldquo;Join with code&rdquo;, and everything on the canvas — layers, colour, type, pages —
        stays in sync on both sides as you work. The session lives while this tab is open.
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export interface ExportOptions {
  format: 'png' | 'jpeg' | 'webp';
  scale: number;
  quality: number;
  allPages: boolean;
}

export function ExportModal({
  page,
  pageCount,
  projectName,
  onExport,
  onClose,
}: {
  page: Page;
  pageCount: number;
  projectName: string;
  onExport: (opts: ExportOptions & { clipboard?: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(92);
  const [allPages, setAllPages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const outW = Math.round(page.width * scale);
  const outH = Math.round(page.height * scale);

  return (
    <Modal
      title="Export image"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Close</Btn>
          <Btn
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onExport({ format: 'png', scale, quality: 1, allPages: false, clipboard: true });
              } finally {
                setBusy(false);
              }
            }}
          >
            Copy image
          </Btn>
          <Btn
            variant="solid"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onExport({ format, scale, quality: quality / 100, allPages });
                setDone(true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Rendering…' : done ? 'Export again' : 'Export'}
          </Btn>
        </>
      }
    >
      <div className="grid2">
        <Select
          label="Format"
          value={format}
          onChange={(v) => setFormat(v as 'png' | 'jpeg' | 'webp')}
          options={[
            { value: 'png', label: 'PNG — lossless, alpha' },
            { value: 'jpeg', label: 'JPG — smaller files' },
            { value: 'webp', label: 'WebP — modern, small' },
          ]}
        />
        <Select
          label="Resolution"
          value={String(scale)}
          onChange={(v) => setScale(Number(v))}
          options={[
            { value: '0.5', label: '0.5× — preview' },
            { value: '1', label: '1× — actual size' },
            { value: '2', label: '2× — retouched' },
            { value: '4', label: '4× — print' },
          ]}
        />
      </div>
      {format !== 'png' && (
        <Slider
          label="Quality"
          value={quality}
          min={30}
          max={100}
          onChange={setQuality}
          suffix="%"
        />
      )}
      {pageCount > 1 && (
        <Check label={`Export all ${pageCount} pages`} checked={allPages} onChange={setAllPages} />
      )}
      <div className="banner">
        {allPages ? `${pageCount} files` : '1 file'} · {outW} × {outH} px ·{' '}
        {format.toUpperCase()} · {projectName}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Generic confirm                                                     */
/* ------------------------------------------------------------------ */

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            variant={danger ? 'danger' : 'solid'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Btn>
        </>
      }
    >
      <p className="hint" style={{ fontSize: 11 }}>
        {message}
      </p>
    </Modal>
  );
}
