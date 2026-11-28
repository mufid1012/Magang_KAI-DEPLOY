/** A hand-drawn signature PNG (≤ 600 px wide) is well under this; anything larger is not a signature. */
export const MAX_SIGNATURE_LENGTH = 200_000;
export const SIGNATURE_MESSAGE = 'Tanda tangan tidak valid';

const PNG = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

export function parseSignature(value: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof value !== 'string' || value.length > MAX_SIGNATURE_LENGTH || !PNG.test(value)) return { ok: false, message: SIGNATURE_MESSAGE };
  return { ok: true, value };
}
