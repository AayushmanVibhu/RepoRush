import {
  canonicalSnapshot,
  isRevision,
  sameRevision,
  type ChallengeRevision,
} from "./challenge-model";
import type { WorkspaceFiles } from "./sandbox-policy";

type SnapshotEntry = ChallengeRevision & {
  key: string;
  challengeId: string;
  files: WorkspaceFiles;
  bytes: number;
  cachedAt: number;
  lastAccessedAt: number;
};
const DATABASE = "reporush-challenges";
const STORE = "snapshots";
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 80;
const configuredLimit = Number(
  process.env.NEXT_PUBLIC_CHALLENGE_CACHE_MAX_BYTES,
);
const MAX_BYTES =
  Number.isSafeInteger(configuredLimit) && configuredLimit > 0
    ? Math.min(configuredLimit, 64 * 1024 * 1024)
    : 16 * 1024 * 1024;

function snapshotKey(id: string, revision: ChallengeRevision) {
  return JSON.stringify([id, revision.version, revision.snapshotHash]);
}

export async function verifySnapshot(files: unknown, hash: string) {
  const canonical = canonicalSnapshot(files);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (hex !== hash)
    throw new Error("Challenge snapshot failed its integrity check.");
  return {
    files: JSON.parse(canonical) as WorkspaceFiles,
    bytes: bytes.length,
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function access<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
) {
  const opening = indexedDB.open(DATABASE, 1);
  opening.onupgradeneeded = () =>
    opening.result.createObjectStore(STORE, { keyPath: "key" });
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    opening.onblocked = () => {
      blocked = true;
      reject(new Error("Challenge cache is blocked."));
    };
    opening.onsuccess = () => {
      if (blocked) opening.result.close();
      else resolve(opening.result);
    };
    opening.onerror = () => reject(opening.error);
  });
  try {
    const transaction = db.transaction(STORE, mode);
    const completed = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
    const [result] = await Promise.all([
      run(transaction.objectStore(STORE)),
      completed,
    ]);
    return result;
  } finally {
    db.close();
  }
}

export function pruneSnapshots(
  entries: SnapshotEntry[],
  now = Date.now(),
  maxBytes = MAX_BYTES,
) {
  const evict: string[] = [];
  let bytes = 0;
  let count = 0;
  for (const row of entries.sort(
    (a, b) => b.lastAccessedAt - a.lastAccessedAt,
  )) {
    if (
      now - row.lastAccessedAt > MAX_AGE ||
      !Number.isSafeInteger(row.bytes) ||
      row.bytes < 0 ||
      bytes + row.bytes > maxBytes ||
      count >= MAX_ENTRIES
    ) {
      evict.push(row.key);
    } else {
      bytes += row.bytes;
      count++;
    }
  }
  return evict;
}

export async function readCachedSnapshot(
  id: string,
  revision: ChallengeRevision,
) {
  const key = snapshotKey(id, revision);
  try {
    const entry: SnapshotEntry | undefined = await access("readonly", (store) =>
      requestResult(store.get(key)),
    );
    if (!entry) return null;
    if (
      entry.challengeId !== id ||
      !isRevision(entry) ||
      !sameRevision(entry, revision) ||
      !Number.isFinite(entry.cachedAt) ||
      !Number.isFinite(entry.lastAccessedAt) ||
      Date.now() - entry.lastAccessedAt > MAX_AGE
    )
      throw new Error("Invalid cache entry.");
    const verified = await verifySnapshot(entry.files, revision.snapshotHash);
    // Recency is best-effort; an unavailable cache must never block loading.
    void access("readwrite", async (store) => {
      const current = await requestResult(store.get(key));
      if (current)
        await requestResult(
          store.put({
            ...entry,
            bytes: verified.bytes,
            lastAccessedAt: Date.now(),
          }),
        );
    }).catch(() => {});
    return verified.files;
  } catch {
    void access("readwrite", (store) => requestResult(store.delete(key))).catch(
      () => {},
    );
    return null;
  }
}

export async function cacheSnapshot(
  id: string,
  revision: ChallengeRevision,
  files: unknown,
) {
  const verified = await verifySnapshot(files, revision.snapshotHash);
  try {
    if (verified.bytes <= MAX_BYTES) {
      await access("readwrite", async (store) => {
        const now = Date.now();
        await requestResult(
          store.put({
            ...revision,
            challengeId: id,
            key: snapshotKey(id, revision),
            files: verified.files,
            bytes: verified.bytes,
            cachedAt: now,
            lastAccessedAt: now,
          } satisfies SnapshotEntry),
        );
        const entries: SnapshotEntry[] = await requestResult(store.getAll());
        await Promise.all(
          pruneSnapshots(entries, now).map((key) =>
            requestResult(store.delete(key)),
          ),
        );
      });
    }
  } catch {
    // Verified snapshots are still usable when quota, permissions or IndexedDB fail.
  }
  return verified.files;
}
