import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
// ID numbers are short, so they are stored only as a keyed hash plus the last four
// digits for display. Set PICKUP_ID_SECRET once and never change it.
export function normalizeId(value: string) {
  return value.replace(/[\s-]/g, '').toUpperCase();
}
export function hashId(value: string) {
  const secret = process.env.PICKUP_ID_SECRET;
  const normalized = normalizeId(value);
  return secret
    ? createHmac('sha256', secret).update(normalized).digest('hex')
    : createHash('sha256')
        .update('pickup:' + normalized)
        .digest('hex');
}
export function idMatches(value: string, stored: string) {
  const a = Buffer.from(hashId(value), 'hex');
  const b = Buffer.from(stored, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
