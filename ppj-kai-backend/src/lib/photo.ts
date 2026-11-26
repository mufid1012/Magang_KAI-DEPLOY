/** Photos travel as data URLs from the camera (JPEG) or the gallery (any common image type). */
export const MAX_PHOTO_LENGTH = 7_000_000;
const PHOTO_DATA_URL = /^data:image\/(?:jpeg|jpg|png|webp|heic|heif|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;

export type PhotoCheck = { ok: true; value: string | null } | { ok: false; status: 400 | 413 };

/** Absent or empty means "no photo"; anything else must be a bounded image data URL. */
export function checkPhoto(value: unknown): PhotoCheck {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  if (typeof value !== 'string' || value.length > MAX_PHOTO_LENGTH) return { ok: false, status: 413 };
  return PHOTO_DATA_URL.test(value) ? { ok: true, value } : { ok: false, status: 400 };
}

export const PHOTO_FORMAT_MESSAGE = 'Format foto tidak valid. Gunakan foto dari kamera atau galeri.';
