export type ByteRange = { offset: number; length: number };

// R2 reads one contiguous range. Reject multipart and malformed ranges instead
// of silently returning a complete file that a download client could append.
export function parseByteRange(header: string, size: number): ByteRange | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const total = BigInt(size), zero = BigInt(0), one = BigInt(1);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === zero) return null;
    const length = suffix < total ? suffix : total;
    return { offset: Number(total - length), length: Number(length) };
  }
  const start = BigInt(match[1]);
  const requestedEnd = match[2] ? BigInt(match[2]) : total - one;
  if (start >= total || requestedEnd < start) return null;
  const end = requestedEnd < total ? requestedEnd : total - one;
  return { offset: Number(start), length: Number(end - start + one) };
}
