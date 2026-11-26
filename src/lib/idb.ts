/* Minimal promise wrapper around IndexedDB — no dependencies. */

const DB_NAME = 'image-tailor';
const DB_VERSION = 1;

export const STORE_PROJECTS = 'projects';
export const STORE_DOCS = 'docs';
export const STORE_ASSETS = 'assets';
export const STORE_FONTS = 'fonts';

export interface FontRecord {
  family: string;
  buffer: ArrayBuffer;
  weight: number;
  style: 'normal' | 'italic';
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [STORE_PROJECTS, STORE_DOCS, STORE_ASSETS, STORE_FONTS]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

export function idbPut<T>(store: string, key: string, value: T): Promise<IDBValidKey> {
  return tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value, key));
}

export function idbDelete(store: string, key: string): Promise<undefined> {
  return tx<undefined>(store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>);
}

export function idbKeys(store: string): Promise<string[]> {
  return tx<string[]>(store, 'readonly', (s) => s.getAllKeys() as IDBRequest<string[]>);
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}
