import { config } from '../config.js';
import { emptyDataFile, type DataFile } from '../habits/types.js';

const DATA_PATH = '/me/drive/special/approot:/data.json:/content';

export class PreconditionFailedError extends Error {}

interface LoadedData {
  data: DataFile;
  etag: string;
}

async function getEtag(response: Response): Promise<string> {
  const etag = response.headers.get('etag');
  if (!etag) {
    throw new Error('Graph response did not include an ETag header');
  }
  return etag;
}

// Non-secret claims of the access token, for diagnosing Graph rejections (wrong scope,
// wrong audience, work/school vs. personal account). Personal Microsoft accounts often
// get opaque, non-JWT access tokens — then there is nothing to decode. Never returns
// the token itself or user-identifying claims.
function describeToken(accessToken: string): string {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
    return JSON.stringify({ scp: payload.scp, aud: payload.aud, tid: payload.tid, ver: payload.ver });
  } catch {
    return 'opaque (not a JWT)';
  }
}

// Builds the error for a failed Graph call with everything needed to diagnose it from
// the server log: status, body, Graph's request-id/www-authenticate headers, token claims.
async function graphError(action: string, response: Response, accessToken: string): Promise<Error> {
  const headers = {
    'request-id': response.headers.get('request-id'),
    'www-authenticate': response.headers.get('www-authenticate'),
  };
  return new Error(
    `Graph ${action} failed: ${response.status} ${await response.text()} ` +
      `| headers=${JSON.stringify(headers)} | token=${describeToken(accessToken)}`
  );
}

export async function loadData(accessToken: string): Promise<LoadedData> {
  const response = await fetch(`${config.graphBaseUrl}${DATA_PATH}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 404) {
    // First login: the app folder itself is auto-created by Graph on first access,
    // but our data file inside it isn't there yet — create it now.
    return saveData(accessToken, emptyDataFile());
  }

  if (!response.ok) {
    throw await graphError('load', response, accessToken);
  }

  const etag = await getEtag(response);
  const data = (await response.json()) as DataFile;
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

  const response = await fetch(`${config.graphBaseUrl}${DATA_PATH}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  });

  if (response.status === 412) {
    throw new PreconditionFailedError('ETag mismatch — data was changed elsewhere');
  }
  if (!response.ok) {
    throw await graphError('save', response, accessToken);
  }

  // PUT .../content responds with the updated DriveItem as JSON (unlike GET
  // .../content, whose body is the raw file bytes) — confirmed against real OneDrive,
  // the ETag response header is NOT reliably present on this endpoint, but the
  // DriveItem body's own eTag/cTag field is. Header first (cheap, and what our test
  // mocks set), body as the real-world fallback.
  const headerEtag = response.headers.get('etag');
  if (headerEtag) {
    return { data, etag: headerEtag };
  }
  const body = (await response.json()) as { eTag?: string; cTag?: string };
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
