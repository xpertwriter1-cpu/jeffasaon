'use server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { objectId, strings, UserError } from '@/lib/validation';
import { normalizePhone } from '@/lib/mpesa-sandbox';
import { darajaConfig, stkPush, stkQuery } from '@/lib/mpesa-live';
import { tokenHash } from '@/lib/mpesa-confirm';
import { invoiceTotals } from '@/lib/invoice-totals';
import { limitRequests } from '@/lib/rate-limit';
export async function startMpesa(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent']);
    const config = darajaConfig();
    if (!config)
      throw new UserError(
        'M-PESA payments are not available yet. Use the payment record form.',
      );
    const values = z
      .object({
        invoiceId: objectId,
        amount: z.coerce
          .number()
          .int('Enter a whole shilling amount.')
          .min(1)
          .max(250000),
        phone: z.string(),
        requestKey: z.string().regex(/^[a-f\d]{64}$/),
      })
      .parse(strings(form));
    await limitRequests('mpesa', 6, 10 * 60 * 1000, user.id);
    const phone = normalizePhone(values.phone);
    if (!phone) throw new UserError('Enter a Safaricom number such as 0712 345 678.');
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
    const payments = await db.payment.findMany({ where: { invoice: invoice.id } });
    const { balance } = invoiceTotals(invoice, payments);
    if (values.amount > Math.ceil(balance))
      throw new UserError(
        'The amount is more than the outstanding balance of KES ' +
          balance.toFixed(2) +
          '.',
      );
    const token = randomBytes(32).toString('hex');
    const request = await db.mpesaRequest.create({
      data: {
        parent: user.id,
        invoice: invoice.id,
        student: student.id,
        phone,
        amount: values.amount,
        environment: config.env,
        requestKey: values.requestKey,
        throttleBucket: Math.floor(Date.now() / 30000),
        callbackHash: tokenHash(token),
      },
    });
    try {
      const result = await stkPush({
        amount: values.amount,
        phone,
        reference: student.admissionNumber || 'FEES' + invoice.id.slice(-6),
        callbackPath: '/mpesa/callback/' + request.id + '/' + token,
      });
      const accepted =
        String(result.ResponseCode) === '0' &&
        result.CheckoutRequestID &&
        result.MerchantRequestID;
      await db.mpesaRequest.update({
        where: { id: request.id },
        data: accepted
          ? {
              status: 'Pending',
              checkoutId: result.CheckoutRequestID,
              merchantId: result.MerchantRequestID,
            }
          : { status: 'Failed', resultDesc: 'Request not accepted' },
      });
      if (!accepted)
        throw new UserError(
          'Safaricom did not accept the request. Check the number and try again.',
        );
    } catch (error) {
      if (error instanceof UserError && error.message.startsWith('Safaricom did not'))
        throw error;
      await db.mpesaRequest.update({
        where: { id: request.id },
        data: { status: 'Unknown' },
      });
      throw new UserError(
        'We could not confirm the request was sent. Check your phone, then use “Check status” before trying again.',
      );
    }
    return {
      success:
        'Check your phone and enter your M-PESA PIN. This page updates when Safaricom confirms payment.',
    };
  });
}
export async function checkMpesa(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['parent', 'admin', 'bursar']);
    const id = objectId.parse(strings(form).id);
    const request = await db.mpesaRequest.findFirst({
      where: { id, ...(user.role === 'parent' ? { parent: user.id } : {}) },
    });
    if (!request?.checkoutId) throw new UserError('Payment request not found.');
    if (!['Pending', 'Unknown'].includes(request.status))
      return { success: 'Status: ' + request.status + '.' };
    const lock = await db.mpesaRequest.updateMany({
      where: {
        id,
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { isSet: false } },
          { lastCheckedAt: { lt: new Date(Date.now() - 15000) } },
        ],
      },
      data: { lastCheckedAt: new Date() },
    });
    if (!lock.count) throw new UserError('Please wait 15 seconds before checking again.');
    const result = await stkQuery(request.checkoutId);
    if (result.ResultCode === undefined)
      return { success: 'Safaricom is still processing this payment.' };
    if (String(result.ResultCode) === '0') {
      // Paid, but the receipt only arrives in the callback. The bursar matches it to the statement.
      await db.mpesaRequest.updateMany({
        where: { id, status: { in: ['Pending', 'Unknown'] } },
        data: {
          status: 'Needs review',
          resultCode: '0',
          resultDesc: 'Confirmed by status query; receipt awaited',
        },
      });
      return {
        success:
          'Safaricom confirms payment. The bursar will attach the receipt shortly.',
      };
    }
    await db.mpesaRequest.updateMany({
      where: { id, status: { in: ['Pending', 'Unknown'] } },
      data: {
        status: 'Failed',
        resultCode: String(result.ResultCode),
        resultDesc: result.ResultDesc?.slice(0, 200),
      },
    });
    return {
      success:
        'Payment was not completed: ' +
        (result.ResultDesc || 'cancelled or failed') +
        '.',
    };
  });
}
// Bursar resolves a payment Safaricom confirmed but whose callback never arrived.
export async function resolveMpesa(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin', 'bursar']);
    const values = z
      .object({
        id: objectId,
        receipt: z
          .string()
          .trim()
          .toUpperCase()
          .regex(
            /^[A-Z0-9]{8,12}$/,
            'Enter the M-PESA receipt number from the statement.',
          ),
        amount: z.coerce.number().int().min(1),
      })
      .parse(strings(form));
    const request = await db.mpesaRequest.findUnique({ where: { id: values.id } });
    if (!request || request.status !== 'Needs review' || request.payment)
      throw new UserError('This request does not need review.');
    const parent = await db.user.findUnique({
      where: { id: request.parent },
      select: { name: true },
    });
    const live = request.environment === 'production';
    const payment = await db.payment.create({
      data: {
        student: request.student,
        invoice: request.invoice,
        parent: request.parent,
        parentName: parent?.name || 'Parent',
        parentPhone: '+' + request.phone,
        amount: values.amount,
        method: live ? 'M-Pesa' : 'M-Pesa (sandbox)',
        reference: values.receipt,
        transactionKey: (live ? 'M-Pesa:' : 'M-Pesa-sandbox:') + values.receipt,
        status: live ? 'Paid' : 'Sandbox',
        verifiedBy: user.id,
        verifiedAt: new Date(),
      },
    });
    await db.mpesaRequest.update({
      where: { id: request.id },
      data: { status: 'Successful', receiptNumber: values.receipt, payment: payment.id },
    });
    return { success: 'Payment recorded against the invoice.' };
  });
}
