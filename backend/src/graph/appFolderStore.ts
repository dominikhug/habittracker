import { config } from '../config.js';
import { emptyDataFile, type DataFile } from '../habits/types.js';

const ITEM_PATH = '/me/drive/special/approot:/data.json';
const DATA_PATH = `${ITEM_PATH}:/content`;

export class PreconditionFailedError extends Error {}

interface LoadedData {
  data: DataFile;
  etag: string;
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
// The URL is logged without its query string: after a redirect it is a pre-authenticated
// download URL whose query carries a temporary access token.
async function graphError(action: string, response: Response, accessToken: string): Promise<Error> {
  const url = new URL(response.url);
  const headers = {
    'request-id': response.headers.get('request-id'),
    'www-authenticate': response.headers.get('www-authenticate'),
  };
  return new Error(
    `Graph ${action} failed: ${response.status} ${await response.text()} ` +
      `| url=${url.origin}${url.pathname} | headers=${JSON.stringify(headers)} | token=${describeToken(accessToken)}`
  );
}

// Two requests instead of GET .../approot:/data.json:/content: real Graph answers that
// combined path-plus-/content form with 400 "invalidRequest" for personal accounts (seen
// in production on 2026-09-25, while the same file is fine via metadata and item id).
export async function loadData(accessToken: string): Promise<LoadedData> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const metaResponse = await fetch(`${config.graphBaseUrl}${ITEM_PATH}`, { headers });

  if (metaResponse.status === 404) {
    // First login: the app folder itself is auto-created by Graph on first access,
    // but our data file inside it isn't there yet — create it now.
    return saveData(accessToken, emptyDataFile());
  }
  if (!metaResponse.ok) {
    throw await graphError('load', metaResponse, accessToken);
  }
  const { id, eTag } = (await metaResponse.json()) as { id: string; eTag?: string };

  // Graph answers with a 302 to a pre-authenticated download URL, which fetch follows.
  const response = await fetch(`${config.graphBaseUrl}/me/drive/items/${id}/content`, { headers });
  if (!response.ok) {
    throw await graphError('load', response, accessToken);
  }

  // Prefer the download response's ETag header (what this code always used); the item's
  // own eTag from the metadata call is the fallback.
  const etag = response.headers.get('etag') ?? eTag;
  if (!etag) {
    throw new Error('Graph response did not include an ETag (neither header nor item eTag)');
  }
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
