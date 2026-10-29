'use server';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { objectId, strings, UserError } from '@/lib/validation';
import {
  sandboxReady,
  normalizePhone,
  initiateSandboxRequest,
  reconcileSandbox,
} from '@/lib/mpesa-sandbox';
export async function startSandbox(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent']);
    const values = z
      .object({
        invoiceId: objectId,
        amount: z.coerce.number().int().min(1).max(150000),
        parentPhone: z.string(),
        requestKey: z.string().regex(/^[a-f\d]{64}$/),
      })
      .parse(strings(form));
    const phone = normalizePhone(values.parentPhone);
    if (!phone || !sandboxReady())
      throw new UserError(
        'Check the sandbox configuration and enter a valid Kenyan mobile number.',
      );
    const invoice = await db.invoice.findUnique({ where: { id: values.invoiceId } });
    const student =
      invoice &&
      (await db.student.findFirst({
        where: {
          id: invoice.student,
          parentEmail: user.email,
          status: { in: ['Admitted', 'Active'] },
        },
      }));
    if (!invoice || !student)
      throw new UserError('Choose an invoice for your admitted child.');
    const token = randomBytes(32).toString('hex');
    const attempt = await db.mpesaSandboxAttempt.create({
      data: {
        parent: user.id,
        invoice: invoice.id,
        phone,
        amount: values.amount,
        requestKey: values.requestKey,
        throttleBucket: Math.floor(Date.now() / 30000),
        callbackHash: createHash('sha256').update(token).digest('hex'),
      },
    });
    try {
      const result = await initiateSandboxRequest({
        amount: values.amount,
        phone,
        reference: 'TEST' + invoice.id.slice(-8),
        callbackPath: '/mpesa/sandbox/callback/' + attempt.id + '/' + token,
      });
      if (
        String(result.ResponseCode) !== '0' ||
        !result.CheckoutRequestID ||
        !result.MerchantRequestID
      )
        await db.mpesaSandboxAttempt.update({
          where: { id: attempt.id },
          data: { status: 'Failed' },
        });
      else
        await db.mpesaSandboxAttempt.update({
          where: { id: attempt.id },
          data: {
            checkoutId: result.CheckoutRequestID,
            merchantId: result.MerchantRequestID,
            status: 'Pending',
          },
        });
    } catch {
      await db.mpesaSandboxAttempt.update({
        where: { id: attempt.id },
        data: { status: 'Unknown' },
      });
    }
    return '/parent/payments';
  });
}
export async function checkSandbox(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent']);
    const id = objectId.parse(strings(form).id);
    const attempt = await db.mpesaSandboxAttempt.findFirst({
      where: { id, parent: user.id },
    });
    if (!attempt) throw new UserError('Test request not found.');
    const lock = await db.mpesaSandboxAttempt.updateMany({
      where: {
        id,
        parent: user.id,
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { isSet: false } },
          { lastCheckedAt: { lt: new Date(Date.now() - 15000) } },
        ],
      },
      data: { lastCheckedAt: new Date() },
    });
    if (!lock.count) throw new UserError('Please wait 15 seconds before checking again.');
    await reconcileSandbox(id);
    return '/parent/payments';
  });
}
