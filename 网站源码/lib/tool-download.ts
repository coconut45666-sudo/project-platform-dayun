export const TOOL_CHUNK_BYTES = 2 * 1024 * 1024;
export const MAX_TOOL_BYTES = 90 * 1024 * 1024;
const MAX_RETRIES = 3;
const ATTEMPT_TIMEOUT_MS = 30_000;

type Progress = { downloaded: number; total: number };
type DownloadOptions = {
  signal: AbortSignal;
  onProgress?: (progress: Progress) => void;
};

class DownloadStopped extends Error {}

function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('下载已取消。', 'AbortError');
}

function waitBeforeRetry(attempt: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    checkAbort(signal);
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new DOMException('下载已取消。', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, 300 * attempt);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

async function readExact(response: Response, expected: number, signal: AbortSignal) {
  if (!response.body) throw new Error('文件数据为空。');
  const reader = response.body.getReader();
  // Allocate only the advertised, already validated segment size. Do not read
  // an unbounded response into arrayBuffer() when a proxy ignores the range.
  const bytes = new Uint8Array(expected);
  let received = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      checkAbort(signal);
      const { done, value } = await reader.read();
      checkAbort(signal);
      if (done) break;
      if (received + value.byteLength > expected) throw new Error('文件分段长度超出预期。');
      bytes.set(value, received);
      received += value.byteLength;
    }
    if (received !== expected) throw new Error('文件分段传输不完整。');
    return bytes;
  } finally {
    signal.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function fetchToolArchive(url: string, options: DownloadOptions): Promise<Blob> {
  const { signal, onProgress } = options;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let total: number | undefined;
  let etag: string | undefined;
  let downloaded = 0;

  while (total === undefined || downloaded < total) {
    checkAbort(signal);
    const start = downloaded;
    const requestedEnd = Math.min(start + TOOL_CHUNK_BYTES, total ?? MAX_TOOL_BYTES) - 1;
    let verified: Uint8Array<ArrayBuffer> | undefined;

    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      if (retry) await waitBeforeRetry(retry, signal);
      checkAbort(signal);
      const attempt = new AbortController();
      const cancel = () => attempt.abort();
      signal.addEventListener('abort', cancel, { once: true });
      const timeout = setTimeout(() => attempt.abort(), ATTEMPT_TIMEOUT_MS);
      let response: Response | undefined;
      try {
        response = await fetch(url, {
          credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: attempt.signal,
          headers: { Range: `bytes=${start}-${requestedEnd}`, ...(etag ? { 'If-Range': etag } : {}) },
        });
        checkAbort(signal);
        if (response.status === 401 || response.status === 403) {
          throw new DownloadStopped('登录已失效或没有下载权限，请重新登录后重试。');
        }
        if (response.status === 200 || response.status === 412 || response.status === 416) {
          throw new DownloadStopped('文件版本或下载范围已变化，请重新点击下载。');
        }
        if (response.status !== 206) {
          if (response.status === 408 || response.status === 429 || response.status >= 500) {
            throw new Error('文件服务暂时不可用。');
          }
          throw new DownloadStopped('无法下载此工具包，请联系管理人员检查文件。');
        }

        const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') || '');
        const currentTag = response.headers.get('ETag');
        if (!match || !currentTag || !/^"[^"\r\n]+"$/.test(currentTag)) {
          throw new DownloadStopped('下载响应缺少有效的文件范围或版本标识，请稍后重试。');
        }
        const [actualStart, actualEnd, actualTotal] = match.slice(1).map(Number);
        if (![actualStart, actualEnd, actualTotal].every(Number.isSafeInteger) ||
            actualTotal < 1 || actualTotal > MAX_TOOL_BYTES || actualStart !== start ||
            actualEnd !== Math.min(requestedEnd, actualTotal - 1)) {
          throw new DownloadStopped('文件范围或大小不符合要求，已停止下载。');
        }
        if ((total !== undefined && actualTotal !== total) || (etag !== undefined && currentTag !== etag)) {
          throw new DownloadStopped('工具包在下载期间已更新，请重新点击下载。');
        }
        // Pin the first valid response even if its body is later truncated.
        total = actualTotal;
        etag = currentTag;
        onProgress?.({ downloaded, total });
        const expected = actualEnd - actualStart + 1;
        const wireLength = response.headers.get('Content-Length');
        if (wireLength !== null && Number(wireLength) !== expected) {
          throw new Error('文件分段长度与响应不一致。');
        }
        verified = await readExact(response, expected, attempt.signal);
        checkAbort(signal);
        break;
      } catch (error) {
        checkAbort(signal);
        if (error instanceof DownloadStopped) throw error;
        if (retry === MAX_RETRIES) throw new Error('网络传输不完整，重试后仍未成功；未保存残缺文件，请稍后重新下载。');
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
        if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
        attempt.abort();
      }
    }
    if (!verified || total === undefined) throw new Error('文件下载未完成。');
    chunks.push(verified);
    downloaded += verified.byteLength;
    onProgress?.({ downloaded, total });
  }
  checkAbort(signal);
  return new Blob(chunks, { type: 'application/zip' });
}

function saveInBrowser(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
}

export async function downloadToolArchive(url: string, filename: string,
  options: DownloadOptions & { save?: (blob: Blob, filename: string) => void | Promise<void> }) {
  const blob = await fetchToolArchive(url, options);
  checkAbort(options.signal);
  // Saving is deliberately after every segment and the final abort check.
  await (options.save ?? saveInBrowser)(blob, filename);
}
