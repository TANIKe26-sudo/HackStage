import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { captureRegions } from '../captureRegions';
import { apiRequest } from './client';

const maxBytes = 128 * 1024;
export async function uploadProfilePhoto(source: string, token: string) {
  const initial = await ImageManipulator.manipulate(source).renderAsync();
  const resize = ImageManipulator.manipulate(initial);
  if (Math.max(initial.width, initial.height) > 720) resize.resize(initial.width >= initial.height ? { width: 720 } : { height: 720 });
  const portrait = await resize.renderAsync();
  const { uploadId } = await apiRequest<{ uploadId: string }>('/api/capture-uploads', token, {
    method: 'POST', body: JSON.stringify({ width: portrait.width, height: portrait.height, regions: captureRegions }),
  });
  try {
    for (let stage = 0; stage < captureRegions.length; stage++) {
      const region = captureRegions[stage], context = ImageManipulator.manipulate(portrait);
      context.crop({ originX: Math.floor(portrait.width * region.x), originY: Math.floor(portrait.height * region.y),
        width: Math.max(1, Math.floor(portrait.width * region.width)), height: Math.max(1, Math.floor(portrait.height * region.height)) });
      const image = await context.renderAsync();
      let base64: string | undefined;
      for (const compress of [0.72, 0.5, 0.3, 0.15]) {
        const result = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
        if (result.base64 && result.base64.length <= Math.floor(maxBytes / 3) * 4) { base64 = result.base64; break; }
      }
      if (!base64) throw new Error('画像サイズを調整できませんでした。撮り直してください。');
      await apiRequest(`/api/capture-uploads/${encodeURIComponent(uploadId)}/stages/${stage}`, token, {
        method: 'PUT', body: JSON.stringify({ dataUrl: `data:image/jpeg;base64,${base64}` }),
      });
    }
    await apiRequest(`/api/capture-uploads/${encodeURIComponent(uploadId)}/complete`, token, { method: 'POST', body: '{}' });
  } catch (error) {
    await apiRequest(`/api/capture-uploads/${encodeURIComponent(uploadId)}`, token, { method: 'DELETE' }).catch(() => undefined);
    throw error;
  }
}
