import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { emptyDataFile, type DataFile } from '../habits/types.js';

function dataPath(uid: string): string {
  return path.join(config.dataDir, `${uid}.json`);
}

// A user without a file yet (first login) simply has no habits — nothing is written
// until their first change.
export async function loadData(uid: string): Promise<DataFile> {
  try {
    return JSON.parse(await readFile(dataPath(uid), 'utf8')) as DataFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyDataFile();
    }
    throw err;
  }
}

// Write to a temp file, then rename over the real one: rename is atomic on the same
// filesystem, so a concurrent reader (or a crash mid-write) never sees a half-written file.
async function saveData(uid: string, data: DataFile): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  const target = dataPath(uid);
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(data), 'utf8');
  await rename(temp, target);
}

// Tail of each user's write queue. Only one process owns the volume (Railway allows a
// single replica with a volume attached), so an in-process lock is enough.
const writeQueues = new Map<string, Promise<unknown>>();

// Loads the current data, applies a pure transform, and saves it back. Writes for the
// same user run strictly one after another, so concurrent requests never overwrite
// each other's changes; different users never wait for each other.
export function withData<T>(uid: string, transform: (data: DataFile) => { data: DataFile; result: T }): Promise<T> {
  const previous = writeQueues.get(uid) ?? Promise.resolve();
  const next = previous
    .catch(() => {}) // a failed earlier write must not block the queue
    .then(async () => {
      const { data: nextData, result } = transform(await loadData(uid));
      await saveData(uid, nextData);
      return result;
    });
  writeQueues.set(uid, next);
  // Drop the queue entry once it is idle, so the map doesn't grow with every user ever seen.
  next
    .catch(() => {})
    .finally(() => {
      if (writeQueues.get(uid) === next) writeQueues.delete(uid);
    });
  return next;
}
