import { createHash, timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { objectId } from '@/lib/validation';
import { reconcileSandbox } from '@/lib/mpesa-sandbox';
import { z } from 'zod';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;
  if (!objectId.safeParse(id).success || !/^[a-f\d]{64}$/.test(token))
    return new Response(null, { status: 404 });
  const attempt = await db.mpesaSandboxAttempt.findUnique({ where: { id } });
  const hash = createHash('sha256').update(token).digest('hex');
  if (
    !attempt ||
    attempt.callbackHash.length !== hash.length ||
    !timingSafeEqual(Buffer.from(attempt.callbackHash), Buffer.from(hash))
  )
    return new Response(null, { status: 404 });
  const body = z
    .object({
      Body: z.object({
        stkCallback: z.object({
          CheckoutRequestID: z.string(),
          MerchantRequestID: z.string(),
        }),
      }),
    })
    .safeParse(await request.json().catch(() => null));
  if (
    body.success &&
    body.data.Body.stkCallback.CheckoutRequestID === attempt.checkoutId &&
    body.data.Body.stkCallback.MerchantRequestID === attempt.merchantId
  ) {
    try {
      await reconcileSandbox(id);
    } catch {}
  }
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
