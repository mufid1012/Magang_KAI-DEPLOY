import { DBSchema,IDBPDatabase,openDB } from 'idb';

interface PPJDB extends DBSchema {
  offlineQueue: {
    key: number;
    value: {
      id?: number;
      url: string;
      method: 'POST' | 'PUT' | 'DELETE';
      body: unknown;
      headers?: Record<string, string>;
      timestamp: number;
    };
    indexes: { 'by-timestamp': number };
  };
}

let dbPromise: Promise<IDBPDatabase<PPJDB>> | null = null;

if (typeof window !== 'undefined') {
  dbPromise = openDB<PPJDB>('ppj-kai-offline', 1, {
    upgrade(db) {
      const store = db.createObjectStore('offlineQueue', {
        keyPath: 'id',
        autoIncrement: true,
      });
      store.createIndex('by-timestamp', 'timestamp');
    },
  });
}

export async function getOfflineQueue() {
  if (!dbPromise) return [];
  const db = await dbPromise;
  return db.getAllFromIndex('offlineQueue', 'by-timestamp');
}

export async function removeFromOfflineQueue(id: number) {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.delete('offlineQueue', id);
}
