import { toByteArray, fromByteArray } from 'base64-js';
import { decode } from 'jpeg-js';
import { encode } from 'fast-png';

// Pure JS and typed arrays: compatible with Expo Go, no Buffer/native plugin.
// This work runs on the phone instead of consuming the Worker's 10 ms budget.
export function comparisonSheet(sources: string[]) {
  if (sources.length !== 3) throw new Error('比較画像を準備できませんでした。');
  const width = 1184, height = 512, data = new Uint8Array(width * height * 4).fill(255);
  sources.forEach((source, panel) => {
    const encoded = source.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!encoded) throw new Error('比較画像を読み込めませんでした。');
    const image = decode(toByteArray(encoded[1]), { useTArray: true, maxResolutionInMP: 2.5, maxMemoryUsageInMB: 64, tolerantDecoding: false });
    const scale = Math.min(384 / image.width, height / image.height), w = Math.max(1, Math.floor(image.width * scale)), h = Math.max(1, Math.floor(image.height * scale));
    const offsetX = panel * 400 + Math.floor((384 - w) / 2), offsetY = Math.floor((height - h) / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const from = (Math.min(image.height - 1, Math.floor(y / scale)) * image.width + Math.min(image.width - 1, Math.floor(x / scale))) * 4;
      const to = ((offsetY + y) * width + offsetX + x) * 4;
      for (let c = 0; c < 3; c++) data[to + c] = image.data[from + c];
    }
  });
  return `data:image/png;base64,${fromByteArray(encode({ width, height, data, channels: 4, depth: 8 }))}`;
}
