import { fromByteArray } from 'base64-js';

// Fetch private bytes through the app's authenticated HTTP path instead of
// relying on platform-specific native Image networking and its disk cache.
export async function loadProtectedPhoto(baseUrl: string, captureId: string, token: string, signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/captures/${encodeURIComponent(captureId)}/image`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'image/jpeg, image/png', 'User-Agent': 'Nodobito-Mobile/1.0' },
      cache: 'no-store', signal: controller.signal,
    });
    if (!response.ok) throw new Error('写真を読み込めませんでした。');
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (type !== 'image/jpeg' && type !== 'image/png') throw new Error('写真の形式を確認できませんでした。');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (controller.signal.aborted) throw new Error('写真の取得を中断しました。');
    if (!bytes.length || bytes.length > 1_800_000) throw new Error('写真のサイズを確認できませんでした。');
    const jpeg = bytes[0] === 255 && bytes[1] === 216;
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    if ((type === 'image/jpeg' && !jpeg) || (type === 'image/png' && !png)) throw new Error('写真を読み込めませんでした。');
    return `data:${type};base64,${fromByteArray(bytes)}`;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
