import { Buffer } from 'node:buffer';
import * as jpeg from 'jpeg-js';
import { decode as decodePng, convertIndexedToRgb } from 'fast-png';

type Pixels = { width: number; height: number; data: Uint8Array };
export function decodeImage(bytes: Uint8Array, maxPixels = 2_500_000): Pixels {
    if (bytes.length < 8) throw new Error('invalid_image');
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        return jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: maxPixels / 1_000_000, maxMemoryUsageInMB: 128, tolerantDecoding: false });
    }
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a) throw new Error('invalid_image');
    const width = header.getUint32(16), height = header.getUint32(20);
    if (!width || !height || width * height > maxPixels) throw new Error('image_too_large');
    const decoded = decodePng(bytes, { checkCrc: true });
    const png = decoded.palette ? { ...decoded, data: convertIndexedToRgb(decoded), depth: 8, channels: decoded.palette[0].length } : decoded;
    if (png.depth !== 8) throw new Error('unsupported_png_depth');
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const from = i * png.channels, to = i * 4;
        for (let c = 0; c < 3; c++) data[to + c] = png.data[from + (png.channels >= 3 ? c : 0)];
        data[to + 3] = png.channels === 2 ? png.data[from + 1] : png.channels === 4 ? png.data[from + 3] : 255;
    }
    return { width, height, data };
}
function place(canvas: Pixels, image: Pixels, left: number, top: number, width: number, height: number) {
    const scale = Math.min(width / image.width, height / image.height), w = Math.max(1, Math.floor(image.width * scale)), h = Math.max(1, Math.floor(image.height * scale));
    const offsetX = left + Math.floor((width - w) / 2), offsetY = top + Math.floor((height - h) / 2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const source = (Math.min(image.height - 1, Math.floor(y / scale)) * image.width + Math.min(image.width - 1, Math.floor(x / scale))) * 4;
        const target = ((offsetY + y) * canvas.width + offsetX + x) * 4, alpha = image.data[source + 3] / 255;
        for (let c = 0; c < 3; c++) canvas.data[target + c] = Math.round(image.data[source + c] * alpha + 255 * (1 - alpha));
    }
}
export function normalizeReference(bytes: Uint8Array): Uint8Array {
    const image = decodeImage(bytes, 16_000_000), scale = Math.min(1, 720 / Math.max(image.width, image.height));
    const canvas: Pixels = { width: Math.max(1, Math.floor(image.width * scale)), height: Math.max(1, Math.floor(image.height * scale)), data: new Uint8Array() };
    canvas.data = new Uint8Array(canvas.width * canvas.height * 4).fill(255);
    place(canvas, image, 0, 0, canvas.width, canvas.height);
    return new Uint8Array(jpeg.encode({ ...canvas, data: Buffer.from(canvas.data) }, 85).data);
}
// The model accepts a single image: preserve aspect ratios and separate reference A/B and target C.
export function comparisonImage(present: Uint8Array, absent: Uint8Array, target: Uint8Array): Uint8Array {
    const width = 3 * 384 + 2 * 16, height = 512;
    const canvas: Pixels = { width, height, data: new Uint8Array(width * height * 4).fill(255) };
    [present, absent, target].forEach((bytes, i) => place(canvas, decodeImage(bytes), i * 400, 0, 384, height));
    return new Uint8Array(jpeg.encode({ ...canvas, data: Buffer.from(canvas.data) }, 85).data);
}
