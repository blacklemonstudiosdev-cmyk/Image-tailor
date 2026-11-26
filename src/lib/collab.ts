/* Live collaboration over WebRTC (PeerJS public broker). No server of our own. */

import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { CursorInfo, Doc } from '../types';
import { docAssetIds } from './doc';
import { getAssetBlob, putAssetWithId } from './store';
import { COLLAB_COLORS, hashString } from './utils';

export type CollabStatus = 'idle' | 'connecting' | 'waiting' | 'live' | 'error' | 'closed';

export interface CollabHandlers {
  onStatus: (status: CollabStatus, detail?: string) => void;
  onDoc: (doc: Doc) => void;
  onCursor: (cursor: CursorInfo | null) => void;
  onPeers: (count: number) => void;
  onRemoteName: (name: string | null) => void;
  onAssets: () => void;
}

const PREFIX = 'imagetailor-v1-';
const CHUNK = 32000;

function hostIdFor(code: string): string {
  return `${PREFIX}${code.replace(/\D/g, '').slice(0, 6)}`;
}

type Message =
  | { t: 'hello'; name: string; color: string }
  | { t: 'doc'; doc: Doc }
  | { t: 'need'; ids: string[] }
  | { t: 'asset'; id: string; i: number; n: number; buf: ArrayBuffer }
  | { t: 'cursor'; x: number; y: number }
  | { t: 'bye' };

export class CollabSession {
  readonly code: string;
  readonly role: 'host' | 'guest';
  name: string;
  color: string;
  status: CollabStatus = 'idle';

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private handlers: CollabHandlers;
  private inbox = new Map<string, { parts: ArrayBuffer[]; received: number; total: number }>();
  private sendTimer: number | null = null;
  private pendingDoc: Doc | null = null;
  private destroyTimer: number | null = null;
  private aborted = false;

  constructor(
    code: string,
    role: 'host' | 'guest',
    name: string,
    handlers: CollabHandlers,
  ) {
    this.code = code;
    this.role = role;
    this.name = name;
    this.handlers = handlers;
    this.color = COLLAB_COLORS[hashString(name || 'guest') % COLLAB_COLORS.length];
  }

  start(): void {
    this.setStatus('connecting');
    if (this.role === 'host') {
      this.peer = new Peer(hostIdFor(this.code), { debug: 0 });
      this.peer.on('open', () => this.setStatus('waiting', 'Waiting for someone to join'));
      this.peer.on('connection', (conn) => {
        if (this.conn) {
          // allow only one partner; politely close extras
          try {
            conn.close();
          } catch {
            /* ignore */
          }
          return;
        }
        this.adopt(conn);
      });
    } else {
      this.peer = new Peer({ debug: 0 });
      this.peer.on('open', () => this.dial());
    }
    this.peer.on('error', (err: Error & { type?: string }) => this.onPeerError(err));
    this.peer.on('disconnected', () => {
      try {
        this.peer?.reconnect();
      } catch {
        /* ignore */
      }
    });
  }

  private dial() {
    if (!this.peer) return;
    const conn = this.peer.connect(hostIdFor(this.code), { reliable: true });
    this.adopt(conn);
    window.setTimeout(() => {
      if (!this.conn?.open && !this.aborted) {
        this.setStatus('error', 'No one answered with that code. Check it and try again.');
      }
    }, 14000);
  }

  private adopt(conn: DataConnection) {
    this.conn = conn;
    conn.on('open', () => {
      this.setStatus('live', 'Connected');
      this.handlers.onPeers(1);
      this.post({ t: 'hello', name: this.name, color: this.color });
      if (this.pendingDoc) {
        this.post({ t: 'doc', doc: this.pendingDoc });
        this.pendingDoc = null;
      }
      this.requestMissing();
    });
    conn.on('data', (raw) => this.onMessage(raw as Message));
    conn.on('close', () => {
      this.conn = null;
      this.handlers.onPeers(0);
      this.handlers.onRemoteName(null);
      this.handlers.onCursor(null);
      if (!this.aborted) this.setStatus(this.role === 'host' ? 'waiting' : 'closed', 'The other person left');
    });
    conn.on('error', () => {
      if (!this.aborted) this.setStatus('error', 'Connection problem');
    });
  }

  private onPeerError(err: Error & { type?: string }) {
    if (this.aborted) return;
    const type = err.type ?? '';
    if (type === 'unavailable-id') {
      this.setStatus('error', 'That code is in use right now. Generate a new one.');
    } else if (type === 'peer-unavailable') {
      this.setStatus('error', 'No one answered with that code. Check it and try again.');
    } else if (type === 'network' || type === 'server-error' || type === 'socket-error') {
      this.setStatus('error', 'Could not reach the collaboration relay. Check your connection.');
    } else {
      this.setStatus('error', err.message || 'Connection failed');
    }
  }

  private setStatus(status: CollabStatus, detail?: string) {
    this.status = status;
    this.handlers.onStatus(status, detail);
  }

  private post(msg: Message) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(msg);
      } catch {
        /* channel closed mid-send */
      }
    }
  }

  sendDoc(doc: Doc) {
    if (!this.conn || !this.conn.open) {
      this.pendingDoc = doc;
      return;
    }
    if (this.sendTimer) window.clearTimeout(this.sendTimer);
    this.sendTimer = window.setTimeout(() => {
      this.post({ t: 'doc', doc });
    }, 90);
  }

  sendCursor(x: number, y: number) {
    this.post({ t: 'cursor', x, y });
  }

  /** Ask the partner for assets our document references but we do not have locally. */
  async requestMissing() {
    if (!this.conn || !this.conn.open) return;
    const doc = this.pendingDoc;
    if (!doc) return;
    const ids = docAssetIds(doc);
    const missing: string[] = [];
    for (const id of ids) {
      const blob = await getAssetBlob(id);
      if (!blob) missing.push(id);
    }
    if (missing.length) this.post({ t: 'need', ids: missing });
  }

  async requestAssets(ids: string[]) {
    if (!ids.length) return;
    this.post({ t: 'need', ids });
  }

  private async onMessage(msg: Message) {
    switch (msg.t) {
      case 'hello':
        this.handlers.onRemoteName(msg.name);
        break;
      case 'doc':
        this.handlers.onDoc(msg.doc);
        {
          const missing: string[] = [];
          for (const id of docAssetIds(msg.doc)) {
            const b = await getAssetBlob(id);
            if (!b) missing.push(id);
          }
          if (missing.length) this.post({ t: 'need', ids: missing });
        }
        break;
      case 'need':
        void this.sendAssets(msg.ids);
        break;
      case 'asset': {
        let entry = this.inbox.get(msg.id);
        if (!entry) {
          entry = { parts: new Array(msg.n), received: 0, total: msg.n };
          this.inbox.set(msg.id, entry);
        }
        entry.parts[msg.i] = msg.buf;
        entry.received++;
        if (entry.received >= entry.total) {
          this.inbox.delete(msg.id);
          const blob = new Blob(entry.parts);
          await putAssetWithId(msg.id, blob);
          this.handlers.onAssets();
        }
        break;
      }
      case 'cursor':
        this.handlers.onCursor({
          x: msg.x,
          y: msg.y,
          name: this.remoteName,
          color: this.color,
        });
        break;
      default:
        break;
    }
  }

  private lastDocForAssets: Doc = { id: '', name: '', pages: [], rev: 0, updatedAt: 0 };
  private remoteName = 'Collaborator';

  /** Called by the editor so the session knows the current doc for asset fetches. */
  setCurrentDoc(doc: Doc) {
    this.lastDocForAssets = doc;
    this.pendingDoc = doc;
  }

  private async sendAssets(ids: string[]) {
    for (const id of ids) {
      const blob = await getAssetBlob(id);
      if (!blob) continue;
      const buf = await blob.arrayBuffer();
      const total = Math.max(1, Math.ceil(buf.byteLength / CHUNK));
      for (let i = 0; i < total; i++) {
        const slice = buf.slice(i * CHUNK, Math.min(buf.byteLength, (i + 1) * CHUNK));
        this.post({ t: 'asset', id, i, n: total, buf: slice });
        if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  setRemoteName(name: string) {
    this.remoteName = name || 'Collaborator';
  }

  destroy() {
    this.aborted = true;
    this.post({ t: 'bye' });
    if (this.sendTimer) window.clearTimeout(this.sendTimer);
    if (this.destroyTimer) window.clearTimeout(this.destroyTimer);
    const conn = this.conn;
    const peer = this.peer;
    this.conn = null;
    this.peer = null;
    window.setTimeout(() => {
      try {
        conn?.close();
      } catch {
        /* ignore */
      }
      try {
        peer?.destroy();
      } catch {
        /* ignore */
      }
    }, 120);
    this.setStatus('closed');
  }
}
