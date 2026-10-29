import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { db } from './db';
import { UserError } from './validation';
export async function limitRequests(
  scope: string,
  max: number,
  windowMs: number,
  identity?: string,
) {
  const h = await headers();
  // Trust forwarded client addresses only when the deployment proxy overwrites them.
  const ip =
    process.env.TRUST_PROXY === '1'
      ? h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      : 'shared-origin';
  const bucket = Math.floor(Date.now() / windowMs);
  const id = createHash('sha256')
    .update(scope + ':' + (identity || ip) + ':' + bucket)
    .digest('hex');
  const result = await db.$runCommandRaw({
    findAndModify: 'request_limits',
    query: { _id: id },
    update: {
      $inc: { count: 1 },
      $setOnInsert: {
        expiresAt: { $date: new Date((bucket + 2) * windowMs).toISOString() },
      },
    },
    upsert: true,
    new: true,
  });
  const value = result.value;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.count !== 'number'
  )
    throw new UserError('Please try again later.');
  if (value.count > max)
    throw new UserError('Too many requests. Please wait before trying again.');
}
