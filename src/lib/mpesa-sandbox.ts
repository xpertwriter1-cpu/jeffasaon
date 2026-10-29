import { z } from 'zod';
import { db } from './db';
import { UserError } from './validation';
const base = 'https://sandbox.safaricom.co.ke';
const resultSchema = z
  .object({
    access_token: z.string().optional(),
    ResponseCode: z.union([z.string(), z.number()]).optional(),
    CheckoutRequestID: z.string().optional(),
    MerchantRequestID: z.string().optional(),
    ResultCode: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();
function configuration() {
  const key = process.env.MPESA_CONSUMER_KEY,
    secret = process.env.MPESA_CONSUMER_SECRET,
    passkey = process.env.MPESA_PASSKEY,
    callbackBase = process.env.MPESA_CALLBACK_BASE_URL,
    shortcode = process.env.MPESA_SHORTCODE || '174379';
  if (
    process.env.MPESA_ENV !== 'sandbox' ||
    !key ||
    !secret ||
    !passkey ||
    !callbackBase ||
    shortcode !== '174379'
  )
    throw new UserError(
      'M-Pesa sandbox is not configured. Follow the sandbox setup guide.',
    );
  let url: URL;
  try {
    url = new URL(callbackBase);
  } catch {
    throw new UserError('Configure a public HTTPS callback URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
  )
    throw new UserError('Use a public HTTPS callback origin without a path.');
  return { key, secret, passkey, shortcode, callbackBase: url.origin };
}
export function sandboxReady() {
  try {
    configuration();
    return true;
  } catch {
    return false;
  }
}
export function normalizePhone(value: string) {
  let number = value
    .trim()
    .replace(/[ ()-]/g, '')
    .replace(/^\+/, '');
  if (/^0[17]\d{8}$/.test(number)) number = '254' + number.slice(1);
  return /^254[17]\d{8}$/.test(number) ? number : null;
}
export function timestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return ['year', 'month', 'day', 'hour', 'minute', 'second']
    .map((key) => values[key])
    .join('');
}
async function provider(path: string, options: RequestInit) {
  try {
    const response = await fetch(base + path, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error();
    return resultSchema.parse(await response.json());
  } catch {
    throw new UserError(
      'Safaricom sandbox could not be reached. Check status before sending another request.',
    );
  }
}
async function request(path: string, payload: Record<string, string | number>) {
  const config = configuration();
  const token = await provider('/oauth/v1/generate?grant_type=client_credentials', {
    headers: {
      Authorization:
        'Basic ' + Buffer.from(config.key + ':' + config.secret).toString('base64'),
    },
  });
  if (!token.access_token) throw new UserError('Sandbox authentication failed.');
  const stamp = timestamp();
  return provider(path, {
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
export async function initiateSandboxRequest(values: {
  amount: number;
  phone: string;
  reference: string;
  callbackPath: string;
}) {
  const config = configuration();
  return request('/mpesa/stkpush/v1/processrequest', {
    TransactionType: 'CustomerPayBillOnline',
    Amount: values.amount,
    PartyA: values.phone,
    PartyB: config.shortcode,
    PhoneNumber: values.phone,
    CallBackURL: config.callbackBase + values.callbackPath,
    AccountReference: values.reference,
    TransactionDesc: 'Fee test',
  });
}
export async function reconcileSandbox(id: string) {
  const attempt = await db.mpesaSandboxAttempt.findUnique({ where: { id } });
  if (!attempt?.checkoutId || ['Successful', 'Failed'].includes(attempt.status)) return;
  const result = await request('/mpesa/stkpushquery/v1/query', {
    CheckoutRequestID: attempt.checkoutId,
  });
  if (
    result.CheckoutRequestID !== attempt.checkoutId ||
    result.MerchantRequestID !== attempt.merchantId ||
    result.ResultCode === undefined ||
    !/^\d+$/.test(String(result.ResultCode))
  )
    return;
  await db.mpesaSandboxAttempt.updateMany({
    where: { id, status: { in: ['Pending', 'Unknown', 'Requesting'] } },
    data: {
      status: String(result.ResultCode) === '0' ? 'Successful' : 'Failed',
      resultCode: String(result.ResultCode),
    },
  });
}
