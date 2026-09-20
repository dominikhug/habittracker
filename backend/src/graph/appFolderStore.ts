import { config } from '../config.js';
import { emptyDataFile, type DataFile } from '../habits/types.js';

const DATA_PATH = '/me/drive/special/approot:/data.json:/content';

export class PreconditionFailedError extends Error {}

interface LoadedData {
  data: DataFile;
  etag: string;
}

async function getEtag(res: Response): Promise<string> {
  const etag = res.headers.get('etag');
  if (!etag) {
    throw new Error('Graph response did not include an ETag header');
  }
  return etag;
}

export async function loadData(accessToken: string): Promise<LoadedData> {
  const res = await fetch(`${config.graphBaseUrl}${DATA_PATH}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) {
    // First login: the app folder itself is auto-created by Graph on first access,
    // but our data file inside it isn't there yet — create it now.
    return saveData(accessToken, emptyDataFile());
  }

  if (!res.ok) {
    throw new Error(`Graph load failed: ${res.status} ${await res.text()}`);
  }

  const etag = await getEtag(res);
  const data = (await res.json()) as DataFile;
  return { data, etag };
}

export async function saveData(accessToken: string, data: DataFile, ifMatchEtag?: string): Promise<LoadedData> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  if (ifMatchEtag) {
    headers['If-Match'] = ifMatchEtag;
  }

  const res = await fetch(`${config.graphBaseUrl}${DATA_PATH}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });

  if (res.status === 412) {
    throw new PreconditionFailedError('ETag mismatch — data was changed elsewhere');
  }
  if (!res.ok) {
    throw new Error(`Graph save failed: ${res.status} ${await res.text()}`);
  }

  // PUT .../content responds with the updated DriveItem as JSON (unlike GET
  // .../content, whose body is the raw file bytes) — confirmed against real OneDrive,
  // the ETag response header is NOT reliably present on this endpoint, but the
  // DriveItem body's own eTag/cTag field is. Header first (cheap, and what our test
  // mocks set), body as the real-world fallback.
  const headerEtag = res.headers.get('etag');
  if (headerEtag) {
    return { data, etag: headerEtag };
  }
  const body = (await res.json()) as { eTag?: string; cTag?: string };
  const bodyEtag = body.eTag ?? body.cTag;
  if (!bodyEtag) {
    throw new Error('Graph save response included no ETag (neither header nor eTag/cTag field)');
  }
  return { data, etag: bodyEtag };
}

const MAX_ATTEMPTS = 3;

// Loads the current data, applies a pure transform, and saves it back with
// optimistic concurrency (If-Match). Retries the whole load-transform-save cycle
// on a 412 (someone else wrote in between) up to MAX_ATTEMPTS times.
export async function withData<T>(
  accessToken: string,
  transform: (data: DataFile) => { data: DataFile; result: T }
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data, etag } = await loadData(accessToken);
    const { data: nextData, result } = transform(data);
    try {
      await saveData(accessToken, nextData, etag);
      return result;
    } catch (err) {
      if (err instanceof PreconditionFailedError) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
