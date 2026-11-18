import jpeg from 'jpeg-js';
import { decode as decodePng } from 'fast-png';

// Fixed capture framing, not face/neck detection. The camera previews stage 0 for explicit confirmation.
export const regions = [
  [0.25, 0.70, 0.50, 0.20], [0.20, 0.60, 0.60, 0.30],
  [0.15, 0.40, 0.70, 0.50], [0.10, 0.15, 0.80, 0.75], [0, 0, 1, 1],
];
export function imageVariants(bytes: Uint8Array, type: string) {
  let width: number, height: number, rgba: Uint8Array;
  if (type === 'image/jpeg') {
    const image = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 2.5, maxMemoryUsageInMB: 40 });
    width = image.width; height = image.height; rgba = image.data;
  } else {
    if (bytes.length < 24) throw new Error('Invalid PNG');
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (header.getUint32(16) * header.getUint32(20) > 2_500_000) throw new Error('Image too large');
    const image = decodePng(bytes);
    width = image.width; height = image.height;
    if (image.depth !== 8 || image.palette || width * height > 2_500_000) throw new Error('Unsupported PNG');
    rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const offset = i * image.channels;
      for (let c = 0; c < 3; c++) rgba[i * 4 + c] = image.data[offset + (image.channels <= 2 ? 0 : c)];
      rgba[i * 4 + 3] = image.channels === 2 ? image.data[offset + 1] : image.channels === 4 ? image.data[offset + 3] : 255;
    }
  }
  if (!width || !height || width * height > 2_500_000) throw new Error('Image too large');
  return regions.map(([x, y, w, h]) => {
    const left = Math.floor(width * x), top = Math.floor(height * y);
    const cropWidth = Math.max(1, Math.floor(width * w)), cropHeight = Math.max(1, Math.floor(height * h));
    const data = new Uint8Array(cropWidth * cropHeight * 4);
    for (let row = 0; row < cropHeight; row++) {
      const start = ((top + row) * width + left) * 4;
      data.set(rgba.subarray(start, start + cropWidth * 4), row * cropWidth * 4);
    }
    return new Uint8Array(jpeg.encode({ data, width: cropWidth, height: cropHeight }, 85).data);
  });
}
