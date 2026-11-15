import { createHash, timingSafeEqual } from 'node:crypto';
import { db } from './db';
import { objectId } from './validation';
import { callbackSchema, callbackValue, stkQuery } from './mpesa-live';
import { alertParents } from './notify';
import { currency } from './school';
import { invoiceTotals } from './invoice-totals';
export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
function sameHash(token: string, stored: string) {
  const a = Buffer.from(tokenHash(token), 'hex');
  const b = Buffer.from(stored, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
// Turn a successful STK result into a payment exactly once. Production payments are
// recorded as Paid (automatic confirmation); sandbox rehearsals never affect balances.
export async function recordSuccess(
  requestId: string,
  amount: number,
  receipt: string,
  { review = false }: { review?: boolean } = {},
) {
  const claimed = await db.mpesaRequest.updateMany({
    where: { id: requestId, status: { in: ['Pending', 'Unknown'] } },
    data: { status: 'Confirming', receiptNumber: receipt },
  });
  if (!claimed.count) return null;
  const request = (await db.mpesaRequest.findUnique({ where: { id: requestId } }))!;
  const parent = await db.user.findUnique({
    where: { id: request.parent },
    select: { name: true },
  });
  const live = request.environment === 'production';
  const invoice = await db.invoice.findUnique({ where: { id: request.invoice } });
  const owed = invoice
    ? invoiceTotals(
        invoice,
        await db.payment.findMany({ where: { invoice: invoice.id } }),
      ).balance
    : 0;
  // A different amount, or more than is still owed, is held for the bursar.
  const mismatch = amount !== request.amount || amount > owed;
  const status = review || mismatch ? 'Pending verification' : live ? 'Paid' : 'Sandbox';
  try {
    const payment = await db.payment.create({
      data: {
        student: request.student,
        invoice: request.invoice,
        parent: request.parent,
        parentName: parent?.name || 'Parent',
        parentPhone: '+' + request.phone,
        amount,
        method: live ? 'M-Pesa' : 'M-Pesa (sandbox)',
        reference: receipt,
        transactionKey: (live ? 'M-Pesa:' : 'M-Pesa-sandbox:') + receipt,
        status,
        ...(status === 'Paid' ? { verifiedAt: new Date() } : {}),
      },
    });
    await db.mpesaRequest.update({
      where: { id: requestId },
      data: {
        status: status === 'Pending verification' ? 'Needs review' : 'Successful',
        payment: payment.id,
      },
    });
    if (status === 'Paid')
      await alertParents(
        request.student,
        'Fee payment received',
        'We have received ' +
          currency(amount) +
          ' by M-PESA (receipt ' +
          receipt +
          '). Remaining balance: ' +
          currency(Math.max(0, owed - amount)) +
          '. Thank you.',
        'receipt:' + payment.id,
      );
    return payment;
  } catch {
    // A duplicate receipt number means this payment already exists.
    await db.mpesaRequest.update({
      where: { id: requestId },
      data: { status: 'Needs review', resultDesc: 'Duplicate receipt ' + receipt },
    });
    return null;
  }
}
export async function handleCallback(id: string, token: string, body: unknown) {
  if (!objectId.safeParse(id).success || !/^[a-f\d]{64}$/.test(token)) return;
  const request = await db.mpesaRequest.findUnique({ where: { id } });
  if (!request?.checkoutId || !sameHash(token, request.callbackHash)) return;
  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) return;
  const result = parsed.data.Body.stkCallback;
  if (
    result.CheckoutRequestID !== request.checkoutId ||
    result.MerchantRequestID !== request.merchantId
  )
    return;
  if (String(result.ResultCode) !== '0') {
    await db.mpesaRequest.updateMany({
      where: { id, status: { in: ['Pending', 'Unknown'] } },
      data: {
        status: 'Failed',
        resultCode: String(result.ResultCode),
        resultDesc: result.ResultDesc?.slice(0, 200),
      },
    });
    return;
  }
  const items = result.CallbackMetadata?.Item;
  const amount = Number(callbackValue(items, 'Amount'));
  const receipt = String(callbackValue(items, 'MpesaReceiptNumber') ?? '').toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z0-9]{8,12}$/.test(receipt)) {
    await db.mpesaRequest.updateMany({
      where: { id, status: 'Pending' },
      data: { status: 'Needs review', resultDesc: 'Incomplete callback' },
    });
    return;
  }
  await db.mpesaRequest.update({
    where: { id },
    data: { resultCode: '0', resultDesc: result.ResultDesc?.slice(0, 200) },
  });
  // Defence in depth: if Safaricom's own status query explicitly disagrees, hold for review.
  let review = false;
  try {
    const check = await stkQuery(request.checkoutId);
    if (check.ResultCode !== undefined && String(check.ResultCode) !== '0') review = true;
  } catch {}
  await recordSuccess(id, amount, receipt, { review });
}
