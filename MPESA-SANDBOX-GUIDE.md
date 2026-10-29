> Migration note: the application now runs on Next.js, TypeScript, Prisma and pnpm. Follow README.md for current commands. Express/EJS file references below describe the previous implementation. The school workflow remains applicable.

# M-Pesa sandbox testing

This integration calls only `https://sandbox.safaricom.co.ke`. It cannot collect real fees. Sandbox requests have their own collection and never create Payment records, reduce real balances, or produce receipts. Continue using the existing manual payment form and bursar verification for actual fees.

## Set up

1. Sign up or sign in at https://developer.safaricom.co.ke, create a sandbox app with M-Pesa Express enabled, and obtain its consumer key and consumer secret. Obtain the sandbox Lipa na M-Pesa Online passkey and test phone from the portal's test credentials. Do not use live credentials.
2. Make the local app reachable through a public HTTPS development tunnel forwarding to port 3000. Use a tunnel you control; its origin must forward to this app. A localhost URL cannot receive Safaricom callbacks. Keep the tunnel running throughout a test.
3. Add these variables to your existing `.env`. Preserve MONGODB_URI, SESSION_SECRET and the other settings. Never commit or share the completed file.

   ```dotenv
   MPESA_ENV=sandbox
   MPESA_SHORTCODE=174379
   MPESA_CONSUMER_KEY=your_sandbox_consumer_key
   MPESA_CONSUMER_SECRET=your_sandbox_consumer_secret
   MPESA_PASSKEY=your_sandbox_lipa_na_mpesa_passkey
   MPESA_CALLBACK_BASE_URL=https://your-development-tunnel-host
   ```

   The callback setting is an HTTPS origin only, with no path, query string or credentials. The app constructs a separate callback URL for each request; you do not need to manually append an endpoint or token. Update this origin and restart the app whenever the tunnel host changes.

4. Restart using `npm.cmd run dev`. The app creates the sandbox request collection and its uniqueness indexes through Mongoose's normal model initialization. The start route also waits for those indexes before sending a request.
5. Sign in as admin or bursar and create a term invoice under `/admin/fees` for a child linked to your test parent account.
6. Sign in as that parent and open `/parent/payments`. In **M-Pesa sandbox test**, choose the invoice, start with KSh 1, and enter the sandbox phone from Daraja. Click **Send M-Pesa test prompt** once. No transaction reference or PIN is required on the website.
7. If a phone prompt is delivered, authorize it only on the handset. Depending on the sandbox test setup, the provider may simulate a result without a real handset prompt. An accepted API request alone is not a successful payment.
8. Check **Recent sandbox requests**. The callback triggers a query to Safaricom, or you can click **Check test status** (at most once every 15 seconds). A verified query result of 0 becomes **Successful**; nonzero final results become **Failed**. Pending/unavailable results remain unresolved.

## Expected checks

- A repeated submission of the same form does not send a second prompt. New requests are limited to one per parent per 30-second time bucket.
- A parent can only initiate requests against their own child's invoices and view/check their own requests. Requests and status checks require a signed-in parent session and a CSRF token.
- Each callback has an unguessable token stored as a hash. The app also matches the provider request identifiers and queries Safaricom before updating test status. The callback never trusts a supplied success flag or receipt.
- Cancelling, failing, and succeeding in sandbox all leave real balances unchanged. Test requests never appear as paid fees or official receipts.
- **Unknown** means the network response was inconclusive. If no checkout ID was received, check Daraja and your phone before initiating another test. The app does not automatically retry prompt requests, which could otherwise cause duplicate prompts.
- If the callback arrives before the initiation response is stored, use the status button once the checkout ID appears. If callbacks are unavailable, the button still queries the provider.
- Sandbox timestamps and UI times use Africa/Nairobi. Kenyan local mobile numbers are normalized to `254...` format. STK test amounts must be whole shillings between 1 and 150,000.

## Troubleshooting

- Setup message instead of a payment button: complete the sandbox variables and restart the app.
- Request not accepted: check that all keys/passkey belong to the sandbox app, the shortcode is 174379, and the app has M-Pesa Express enabled.
- Status remains pending: allow time for the test flow, then check again. Keep the tunnel open. A provider outage is not treated as a failed or successful payment.
- Callback URL rejected: use a reachable public HTTPS origin with no extra path, query or credentials.
- No handset prompt: check Daraja's current sandbox test instructions and test number. A sandbox simulation is not proof that live handset collection works.

## Automated verification

Run `npm.cmd test`. M-Pesa tests mock provider and database calls; they never send phone prompts or create records in your configured database. A live sandbox round trip still requires your Daraja credentials and public callback origin.

## Going live later

Changing `MPESA_ENV` to `production` deliberately disables this sandbox integration. Live collection needs a separate implementation using the school's approved Paybill/Till and production credentials, payment reconciliation, amount/phone/receipt verification, duplicate protection and operational testing. Do not count simulated receipts as actual fee payments.

Official references: [M-Pesa Express](https://developer.safaricom.co.ke/apis/MpesaExpressSimulate), [Daraja FAQ and sandbox credentials](https://developer.safaricom.co.ke/faqs), and [Safaricom SDK's STK query implementation](https://github.com/safaricom/mpesa-php-sdk/blob/master/src/Mpesa.php).
