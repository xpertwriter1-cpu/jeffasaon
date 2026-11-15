import 'server-only';
import { z } from 'zod';
import { UserError } from './validation';
import { timestamp } from './mpesa-sandbox';
// Daraja STK Push (Lipa na M-PESA Online) used for real fee collection.
// DARAJA_ENV=sandbox lets the school rehearse the full flow; sandbox payments are
// recorded with status "Sandbox" and never reduce a balance.
const resultSchema = z
  .object({
    access_token: z.string().optional(),
    ResponseCode: z.union([z.string(), z.number()]).optional(),
    CheckoutRequestID: z.string().optional(),
    MerchantRequestID: z.string().optional(),
    ResultCode: z.union([z.string(), z.number()]).optional(),
    ResultDesc: z.string().optional(),
  })
  .passthrough();
export function darajaConfig() {
  const env = process.env.DARAJA_ENV;
  const values = {
    key: process.env.DARAJA_CONSUMER_KEY,
    secret: process.env.DARAJA_CONSUMER_SECRET,
    passkey: process.env.DARAJA_PASSKEY,
    shortcode: process.env.DARAJA_SHORTCODE,
    partyB: process.env.DARAJA_PARTY_B || process.env.DARAJA_SHORTCODE,
    type:
      process.env.DARAJA_TRANSACTION_TYPE === 'CustomerBuyGoodsOnline'
        ? 'CustomerBuyGoodsOnline'
        : 'CustomerPayBillOnline',
    callbackBase: process.env.DARAJA_CALLBACK_BASE_URL,
  };
  if (
    process.env.PAYMENT_MODE !== 'mpesa' ||
    (env !== 'sandbox' && env !== 'production') ||
    !values.key ||
    !values.secret ||
    !values.passkey ||
    !values.shortcode ||
    !values.callbackBase
  )
    return null;
  let url: URL;
  try {
    url = new URL(values.callbackBase);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:' ||
    url.pathname !== '/' ||
    url.search ||
    url.username ||
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    return null;
  return {
    ...values,
    key: values.key,
    secret: values.secret,
    passkey: values.passkey,
    shortcode: values.shortcode,
    partyB: values.partyB || values.shortcode,
    env,
    callbackBase: url.origin,
    base:
      env === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke',
  } as const;
}
export const mpesaReady = () => darajaConfig() !== null;
async function call(path: string, init: RequestInit) {
  const config = darajaConfig();
  if (!config) throw new UserError('M-PESA payments are not configured.');
  try {
    const response = await fetch(config.base + path, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error();
    return resultSchema.parse(await response.json());
  } catch {
    throw new UserError(
      'Safaricom could not be reached. Check the payment status before trying again.',
    );
  }
}
async function signed(path: string, payload: Record<string, string | number>) {
  const config = darajaConfig()!;
  const token = await call('/oauth/v1/generate?grant_type=client_credentials', {
    headers: {
      Authorization:
        'Basic ' + Buffer.from(config.key + ':' + config.secret).toString('base64'),
    },
  });
  if (!token.access_token) throw new UserError('M-PESA authentication failed.');
  const stamp = timestamp();
  return call(path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token.access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: Buffer.from(config.shortcode + config.passkey + stamp).toString('base64'),
      Timestamp: stamp,
      ...payload,
    }),
  });
}
export function stkPush(values: {
  amount: number;
  phone: string;
  reference: string;
  callbackPath: string;
}) {
  const config = darajaConfig();
  if (!config) throw new UserError('M-PESA payments are not configured.');
  return signed('/mpesa/stkpush/v1/processrequest', {
    TransactionType: config.type,
    Amount: values.amount,
    PartyA: values.phone,
    PartyB: config.partyB,
    PhoneNumber: values.phone,
    CallBackURL: config.callbackBase + values.callbackPath,
    AccountReference: values.reference.slice(0, 12),
    TransactionDesc: 'School fees',
  });
}
export function stkQuery(checkoutId: string) {
  return signed('/mpesa/stkpushquery/v1/query', { CheckoutRequestID: checkoutId });
}
const item = z.object({
  Name: z.string(),
  Value: z.union([z.string(), z.number()]).optional(),
});
export const callbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.union([z.string(), z.number()]),
      ResultDesc: z.string().optional(),
      CallbackMetadata: z.object({ Item: z.array(item) }).optional(),
    }),
  }),
});
export function callbackValue(items: z.infer<typeof item>[] | undefined, name: string) {
  return items?.find((entry) => entry.Name === name)?.Value;
}
