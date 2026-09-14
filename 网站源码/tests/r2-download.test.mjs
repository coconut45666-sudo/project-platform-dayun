import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Log, LogLevel, Miniflare } from 'miniflare';

let runtime;
const root = fileURLToPath(new URL('../', import.meta.url));
before(async () => {
  const compiled = await build({
    stdin: { contents: `
      import { downloadR2File, fixedLengthBody } from './lib/r2-download.ts';
      export default { async fetch(request, env) {
        const key = new URL(request.url).pathname.slice(1);
        if (key === 'short' || key === 'long') {
          const body = new ReadableStream({ start(controller) {
            controller.enqueue(new Uint8Array(key === 'short' ? 2 : 4));
            controller.close();
          }});
          return new Response(fixedLengthBody(body, 3, request));
        }
        return await downloadR2File(env.BUCKET, key, request, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment',
          'X-Content-Type-Options': 'nosniff'
        }) || new Response('missing', { status: 404 });
      }};`, resolveDir: root, sourcefile: 'r2-download-test-worker.ts', loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  runtime = new Miniflare({ modules: true, script: compiled.outputFiles[0].text, compatibilityDate: '2026-05-15', r2Buckets: ['BUCKET'], unsafeDirectSockets: [{ host: '127.0.0.1', port: 0, proxy: false }], log: new Log(LogLevel.NONE) });
  const bucket = await runtime.getR2Bucket('BUCKET');
  await bucket.put('file', '0123456789');
  await bucket.put('empty', new Uint8Array());
});
after(async () => { if (runtime) await runtime.dispose(); });
const request = (key = 'file', headers = {}) => runtime.dispatchFetch('http://local.test/' + key, { headers });

test('full R2 download has a runtime-recognized exact Content-Length', async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Length'), '10');
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Range'), null);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, no-transform');
  assert.match(response.headers.get('ETag'), /^".+"$/);
  assert.equal(await response.text(), '0123456789');
});

for (const [range, text, contentRange] of [
  ['bytes=0-0', '0', 'bytes 0-0/10'],
  ['bytes=2-5', '2345', 'bytes 2-5/10'],
  ['bytes=9-', '9', 'bytes 9-9/10'],
  ['bytes=5-', '56789', 'bytes 5-9/10'],
  ['bytes=-3', '789', 'bytes 7-9/10'],
  ['bytes=-30', '0123456789', 'bytes 0-9/10'],
  ['bytes=7-999999999999999999999', '789', 'bytes 7-9/10'],
]) test(`R2 actually returns only ${range}`, async () => {
  const response = await request('file', { Range: range });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), contentRange);
  assert.equal(response.headers.get('Content-Length'), String(text.length));
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(await response.text(), text);
});

for (const range of ['bytes=10-', 'bytes=-0', 'bytes=5-4', 'bytes=0-1,4-5', 'items=0-1', 'bytes=invalid']) {
  test(`HTTP 416 for ${range}`, async () => {
    const response = await request('file', { Range: range });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('Content-Range'), 'bytes */10');
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
    assert.ok((await response.json()).error);
  });
}

test('empty files download fully but have no satisfiable byte range', async () => {
  const empty = await request('empty');
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get('Content-Length'), '0');
  assert.equal(await empty.text(), '');
  const range = await request('empty', { Range: 'bytes=0-' });
  assert.equal(range.status, 416);
  assert.equal(range.headers.get('Content-Range'), 'bytes */0');
  await range.arrayBuffer();
});

test('If-Range only resumes the same representation', async () => {
  const original = await request();
  const etag = original.headers.get('ETag'), modified = original.headers.get('Last-Modified');
  await original.arrayBuffer();
  for (const value of [etag, modified]) {
    const response = await request('file', { Range: 'bytes=5-', 'If-Range': value });
    assert.equal(response.status, 206);
    assert.equal(await response.text(), '56789');
  }
  for (const value of ['"another-object"', 'W/' + etag, 'Mon, 01 Jan 2001 00:00:00 GMT']) {
    const response = await request('file', { Range: 'bytes=5-', 'If-Range': value });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Range'), null);
    assert.equal(await response.text(), '0123456789');
  }
});

test('missing R2 object remains distinguishable from an invalid range', async () => {
  for (const headers of [{}, { Range: 'bytes=0-' }]) {
    const response = await request('missing', headers);
    assert.equal(response.status, 404);
    await response.arrayBuffer();
  }
});

test('the real HTTP endpoint preserves full and partial response lengths', async () => {
  for (const [headers, status, text] of [[{}, 200, '0123456789'], [{ Range: 'bytes=2-5' }, 206, '2345']]) {
    const response = await fetch(new URL('file', await runtime.unsafeGetDirectURL()), { headers, signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Content-Length'), String(text.length));
    assert.equal(await response.text(), text);
  }
});

for (const key of ['short', 'long']) test(`the real Workers FixedLengthStream rejects ${key} input`, async () => {
  // Miniflare's RPC and front proxy do not preserve premature EOF errors.
  // Exercise the direct workerd HTTP socket and wire length instead.
  let response, bytes, networkError;
  try {
    response = await fetch(new URL(key, await runtime.unsafeGetDirectURL()), { signal: AbortSignal.timeout(5000) });
    bytes = (await response.arrayBuffer()).byteLength;
  } catch (error) { networkError = error; }
  if (networkError) assert.match(networkError.message, /fetch failed|terminated/i);
  else assert.ok(response.status >= 500, `Faulty stream silently succeeded: HTTP ${response.status}, Content-Length ${response.headers.get('Content-Length')}, bytes ${bytes}`);
});
