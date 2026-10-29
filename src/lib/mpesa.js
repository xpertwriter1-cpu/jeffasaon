const BASE = 'https://sandbox.safaricom.co.ke';

function configuration() {
  const config = {
    key: process.env.MPESA_CONSUMER_KEY,
    secret: process.env.MPESA_CONSUMER_SECRET,
    passkey: process.env.MPESA_PASSKEY,
    shortcode: process.env.MPESA_SHORTCODE || '174379',
    callbackBase: process.env.MPESA_CALLBACK_BASE_URL
  };
  if (process.env.MPESA_ENV !== 'sandbox' || !config.key || !config.secret || !config.passkey || !config.callbackBase) {
    throw new Error('M-Pesa sandbox is not configured. Follow MPESA-SANDBOX-GUIDE.md.');
  }
  let url;
  try { url = new URL(config.callbackBase); } catch { throw new Error('Configure a public HTTPS M-Pesa callback base URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || ['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname)) {
    throw new Error('Configure a public HTTPS M-Pesa callback base URL without a path.');
  }
  // This implementation deliberately cannot call the production API.
  if (config.shortcode !== '174379') throw new Error('Use the sandbox shortcode 174379.');
  config.callbackBase = url.origin;
  return config;
}
function ready() { try { configuration(); return true; } catch { return false; } }
function phone(value) {
  if (typeof value !== 'string') return null;
  let number = value.trim().replace(/[ ()-]/g, '').replace(/^\+/, '');
  if (/^0[17]\d{8}$/.test(number)) number = '254' + number.slice(1);
  return /^254[17]\d{8}$/.test(number) ? number : null;
}
function timestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Nairobi', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return ['year','month','day','hour','minute','second'].map(key => values[key]).join('');
}
async function json(url, options) {
  try {
    const response = await fetch(BASE + url, { ...options, signal:AbortSignal.timeout(15000), redirect:'error' });
    const data = await response.json();
    if (!response.ok) throw new Error('Provider unavailable');
    return data;
  } catch {
    // Provider errors may contain credentials or identifying data; never forward them.
    throw new Error('Safaricom sandbox could not be reached. Check the test credentials and try checking status again.');
  }
}
async function request(path, payload, config) {
  const token = await json('/oauth/v1/generate?grant_type=client_credentials', {
    headers:{ Authorization:'Basic ' + Buffer.from(config.key + ':' + config.secret).toString('base64') }
  });
  if (!token.access_token) throw new Error('Safaricom sandbox authentication failed. Check the test credentials.');
  const stamp = timestamp();
  return json(path, { method:'POST', headers:{ Authorization:'Bearer ' + token.access_token, 'Content-Type':'application/json' },
    body:JSON.stringify({ BusinessShortCode:config.shortcode, Password:Buffer.from(config.shortcode + config.passkey + stamp).toString('base64'), Timestamp:stamp, ...payload }) });
}
async function initiate({ amount, phone: number, reference, callbackPath }) {
  const config = configuration();
  return request('/mpesa/stkpush/v1/processrequest', {
    TransactionType:'CustomerPayBillOnline', Amount:amount, PartyA:number, PartyB:config.shortcode,
    PhoneNumber:number, CallBackURL:config.callbackBase + callbackPath,
    AccountReference:reference, TransactionDesc:'Fee test'
  }, config);
}
async function query(checkoutId) {
  return request('/mpesa/stkpushquery/v1/query', { CheckoutRequestID:checkoutId }, configuration());
}
module.exports = { configuration, ready, phone, timestamp, initiate, query };
