import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, access, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fetchToolArchive, downloadToolArchive, TOOL_CHUNK_BYTES, MAX_TOOL_BYTES } from '../lib/tool-download.ts';

const payload = Buffer.alloc(TOOL_CHUNK_BYTES * 2 + 317);
for (let i = 0; i < payload.length; i++) payload[i] = (i * 37 + Math.floor(i / 251)) % 256;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Use actual HTTP responses and browser-compatible fetch/readable streams.
// In particular, chunked short responses can finish cleanly without fetch
// rejecting; only a comparison with Content-Range detects their truncation.
async function fixture(t, respond) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
    if (!match) { res.writeHead(400); res.end(); return; }
    const start = Number(match[1]), end = Math.min(Number(match[2]), payload.length - 1);
    const request = { start, end, ifRange: req.headers['if-range'] };
    requests.push(request);
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${payload.length}`,
      ETag: '"fixture-v1"', 'Content-Type': 'application/zip',
      'Transfer-Encoding': 'chunked',
    });
    respond({ req, res, start, end, requests });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return { url: `http://127.0.0.1:${server.address().port}/tool.zip`, requests };
}

async function destination(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'dayun-download-test-'));
  const filename = path.join(directory, 'tool.zip');
  t.after(async () => { await unlink(filename).catch(() => {}); await rmdir(directory); });
  return {
    filename,
    save: async (blob, name) => {
      assert.equal(name, 'tool.zip');
      await writeFile(filename, Buffer.from(await blob.arrayBuffer()));
    },
  };
}

test('retries only a silently shortened segment and saves the original bytes once complete', async t => {
  let shortened = false;
  const { url, requests } = await fixture(t, ({ res, start, end }) => {
    if (start === TOOL_CHUNK_BYTES && !shortened) {
      shortened = true;
      res.end(payload.subarray(start, start + 257));
    } else res.end(payload.subarray(start, end + 1));
  });
  const dest = await destination(t);
  const progress = [];
  await downloadToolArchive(url, 'tool.zip', {
    signal: new AbortController().signal, save: dest.save,
    onProgress: p => progress.push(p.downloaded),
  });
  const saved = await readFile(dest.filename);
  assert.equal(saved.length, payload.length);
  assert.equal(digest(saved), digest(payload));
  assert.deepEqual(requests.map(r => r.start), [0, TOOL_CHUNK_BYTES, TOOL_CHUNK_BYTES, TOOL_CHUNK_BYTES * 2]);
  assert.equal(requests[0].ifRange, undefined);
  assert.ok(requests.slice(1).every(r => r.ifRange === '"fixture-v1"'));
  assert.ok(progress.every((value, i) => i === 0 || value >= progress[i - 1]));
  assert.equal(progress.at(-1), payload.length);
});

test('four short transfers exhaust exactly three retries and never save a partial ZIP', async t => {
  const { url, requests } = await fixture(t, ({ res, start }) => res.end(payload.subarray(start, start + 101)));
  const dest = await destination(t);
  await assert.rejects(downloadToolArchive(url, 'tool.zip', {
    signal: new AbortController().signal, save: dest.save,
  }), /未保存残缺文件/);
  assert.equal(requests.length, 4);
  assert.ok(requests.every(r => r.start === 0));
  await assert.rejects(access(dest.filename), { code: 'ENOENT' });
});

test('a broken network stream retries that segment and preserves complete output', async t => {
  let broken = false;
  const { url, requests } = await fixture(t, ({ res, start, end }) => {
    if (!broken) {
      broken = true;
      res.write(payload.subarray(start, start + 32768));
      setTimeout(() => res.destroy(), 5);
    } else res.end(payload.subarray(start, end + 1));
  });
  const blob = await fetchToolArchive(url, { signal: new AbortController().signal });
  assert.equal(digest(Buffer.from(await blob.arrayBuffer())), digest(payload));
  assert.deepEqual(requests.map(r => r.start), [0, 0, TOOL_CHUNK_BYTES, TOOL_CHUNK_BYTES * 2]);
});

test('cancelling a live stream stops requests and never creates a ZIP', async t => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const { url, requests } = await fixture(t, ({ res, start }) => {
    res.write(payload.subarray(start, start + 256));
    started();
    // Keep the server stream open until the client's abort closes it.
  });
  const controller = new AbortController();
  const dest = await destination(t);
  const pending = downloadToolArchive(url, 'tool.zip', { signal: controller.signal, save: dest.save });
  await ready;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(requests.length, 1);
  await assert.rejects(access(dest.filename), { code: 'ENOENT' });
});

test('cancelling after the final verified segment still prevents saving', async t => {
  const { url } = await fixture(t, ({ res, start, end }) => res.end(payload.subarray(start, end + 1)));
  const controller = new AbortController();
  const dest = await destination(t);
  await assert.rejects(downloadToolArchive(url, 'tool.zip', {
    signal: controller.signal, save: dest.save,
    onProgress: p => { if (p.downloaded === p.total) controller.abort(); },
  }), { name: 'AbortError' });
  await assert.rejects(access(dest.filename), { code: 'ENOENT' });
});

for (const scenario of ['changed-etag', 'changed-total', 'ignored-if-range', 'wrong-start', 'wrong-end', 'weak-etag', 'oversized-file', 'lost-session']) {
  test(`rejects ${scenario} without saving or retrying a different representation`, async t => {
    let requests = 0;
    const server = http.createServer((req, res) => {
      requests++;
      const [, a, b] = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range);
      const start = Number(a), end = Math.min(Number(b), payload.length - 1);
      if (scenario === 'ignored-if-range' && start > 0) { res.writeHead(200); res.end(); return; }
      if (scenario === 'lost-session' && start > 0) { res.writeHead(401); res.end(); return; }
      const first = scenario === 'wrong-start' ? start + 1 : start;
      const last = scenario === 'wrong-end' ? end - 1 : end;
      const total = scenario === 'oversized-file' ? MAX_TOOL_BYTES + 1 :
        scenario === 'changed-total' && start > 0 ? payload.length + 1 : payload.length;
      const etag = scenario === 'weak-etag' ? 'W/"fixture-v1"' :
        scenario === 'changed-etag' && start > 0 ? '"fixture-v2"' : '"fixture-v1"';
      res.writeHead(206, { 'Content-Range': `bytes ${first}-${last}/${total}`, ETag: etag });
      res.end(payload.subarray(start, end + 1));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
    const dest = await destination(t);
    await assert.rejects(downloadToolArchive(`http://127.0.0.1:${server.address().port}/tool.zip`, 'tool.zip', {
      signal: new AbortController().signal, save: dest.save,
    }));
    assert.equal(requests, ['changed-etag', 'changed-total', 'ignored-if-range', 'lost-session'].includes(scenario) ? 2 : 1);
    await assert.rejects(access(dest.filename), { code: 'ENOENT' });
  });
}

test('an oversized response body stays bounded and is never saved', async t => {
  const { url, requests } = await fixture(t, ({ res, start, end }) => {
    res.write(payload.subarray(start, end + 1));
    res.end(Buffer.from([1]));
  });
  const dest = await destination(t);
  await assert.rejects(downloadToolArchive(url, 'tool.zip', {
    signal: new AbortController().signal, save: dest.save,
  }), /未保存残缺文件/);
  assert.equal(requests.length, 4);
  await assert.rejects(access(dest.filename), { code: 'ENOENT' });
});
