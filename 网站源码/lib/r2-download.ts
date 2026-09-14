import { parseByteRange, type ByteRange } from './http-range';

type DownloadBucket = Pick<R2Bucket, 'head' | 'get'>;

function metadataHeaders(object: R2Object, initial: HeadersInit) {
  const headers = new Headers(initial);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  // Preserve the exact representation for resumed downloads.
  headers.set('Cache-Control', 'private, no-store, no-transform');
  return headers;
}

function matchesIfRange(value: string | null, object: R2Object) {
  if (!value) return true;
  if (value === object.httpEtag) return true;
  const date = Date.parse(value);
  return Number.isFinite(date) && Math.floor(date / 1000) === Math.floor(object.uploaded.getTime() / 1000);
}

export function fixedLengthBody(body: ReadableStream, length: number, request: Request) {
  const fixed = new FixedLengthStream(length);
  void body.pipeTo(fixed.writable).catch(error => {
    if (!request.signal.aborted) console.error('R2 download stream failed', error);
  });
  return fixed.readable;
}

function fileResponse(object: R2ObjectBody, request: Request, initial: HeadersInit, range?: ByteRange) {
  const headers = metadataHeaders(object, initial);
  const length = range?.length ?? object.size;
  headers.set('Content-Type', headers.get('Content-Type') || object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Length', String(length));
  if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);

  // Workers ignores a manually supplied Content-Length for arbitrary streams.
  // FixedLengthStream both supplies the wire length and errors on short/long
  // input. Start pumping without awaiting it: waiting would deadlock on the
  // client's unread response. pipeTo also propagates cancellation/backpressure.
  return new Response(fixedLengthBody(object.body, length, request), { status: range ? 206 : 200, headers });
}

// Authentication and file visibility must be checked by the caller first.
// Returns null only when the object is missing, preserving caller-specific 404s.
export async function downloadR2File(storage: DownloadBucket, key: string, request: Request, initial: HeadersInit): Promise<Response | null> {
  const requestedRange = request.headers.get('Range');
  if (requestedRange !== null) {
    const metadata = await storage.head(key);
    if (!metadata) return null;
    if (matchesIfRange(request.headers.get('If-Range'), metadata)) {
      const range = parseByteRange(requestedRange, metadata.size);
      if (!range) {
        const headers = metadataHeaders(metadata, initial);
        headers.set('Content-Range', `bytes */${metadata.size}`);
        headers.set('Content-Type', 'application/json; charset=utf-8');
        return new Response(JSON.stringify({ error: '请求的文件范围无效或超出文件大小。' }), { status: 416, headers });
      }
      // Pin the ranged read to the metadata version so a replacement cannot
      // mix two different representations in one resumed download.
      const object = await storage.get(key, { range, onlyIf: { etagMatches: metadata.etag } });
      if (!object) return null;
      if (!('body' in object)) return new Response(null, { status: 412, headers: metadataHeaders(object, initial) });
      return fileResponse(object, request, initial, range);
    }
  }
  const object = await storage.get(key);
  if (!object) return null;
  return fileResponse(object, request, initial);
}
