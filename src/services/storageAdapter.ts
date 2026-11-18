export interface StoredGameArchive {
  gameId: string;
  files: Record<string, string>;
  totalSizeBytes: number;
  updatedAt: string;
}

/**
 * Interface preparada para provedores de armazenamento remoto (ex.: Firebase Storage, S3, R2)
 * sem exigir serviços pagos nesta primeira versão.
 */
export interface RemoteStorageAdapter {
  readonly providerId: string;
  saveArchive(archive: StoredGameArchive): Promise<void>;
  loadArchive(gameId: string): Promise<StoredGameArchive | null>;
  deleteArchive(gameId: string): Promise<void>;
}

const DB_NAME = 'minha_live_games_storage';
const STORE_NAME = 'game_archives';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível neste navegador.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'gameId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Erro ao abrir armazenamento local.'));
  });
}

class LocalIndexedDbStorageAdapter implements RemoteStorageAdapter {
  readonly providerId = 'local-indexeddb';

  async saveArchive(archive: StoredGameArchive): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(archive);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadArchive(gameId: string): Promise<StoredGameArchive | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(gameId);
      req.onsuccess = () => resolve((req.result as StoredGameArchive) || null);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteArchive(gameId: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(gameId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const gameArchiveStorage: RemoteStorageAdapter = new LocalIndexedDbStorageAdapter();
