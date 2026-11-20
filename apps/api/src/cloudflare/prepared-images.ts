import { Buffer } from 'node:buffer';
import { fail } from './core.js';

export const maxPreparedImageBytes = 128 * 1024;

// Read JPEG frame dimensions without decoding pixels. Pixel processing belongs
// on the device; jpeg-js decoding/encoding exceeds Workers Free's CPU budget.
export function jpegDimensions(bytes: Uint8Array) {
    if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) fail(400, 'invalid_capture');
    let offset = 2;
    while (offset + 4 <= bytes.length) {
        if (bytes[offset++] !== 255) break;
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 218 || marker === 217) break;
        const length = bytes[offset] * 256 + bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length) break;
        if ([192, 193, 194].includes(marker)) {
            if (length < 8 || bytes[offset + 2] !== 8) break;
            const height = bytes[offset + 3] * 256 + bytes[offset + 4], width = bytes[offset + 5] * 256 + bytes[offset + 6];
            if (width < 1 || height < 1 || width * height > 2_500_000) break;
            return { width, height };
        }
        offset += length;
    }
    return fail(400, 'invalid_capture');
}

export function preparedJpeg(dataUrl: unknown) {
    if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(maxPreparedImageBytes / 3) * 4 + 23) return fail(413, 'capture_too_large');
    const match = dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) return fail(400, 'invalid_capture');
    const bytes = new Uint8Array(Buffer.from(match[1], 'base64'));
    if (bytes.byteLength > maxPreparedImageBytes) fail(413, 'capture_too_large');
    return { bytes, ...jpegDimensions(bytes) };
}
