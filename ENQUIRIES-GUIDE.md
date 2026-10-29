> Migration note: the application now runs on Next.js, TypeScript, Prisma and pnpm. Follow README.md for current commands. Express/EJS file references below describe the previous implementation. The school workflow remains applicable.

# Contact enquiries, notifications and replies

## Visitor flow

1. A visitor opens `/contact`, enters their name, email, phone and message, and submits.
2. The enquiry and two email jobs are saved together in MongoDB: an acknowledgement to the visitor and a notification to the school inbox. The confirmation on the website includes an enquiry reference.
3. Admins see an unread badge next to **Enquiries** in the navigation. It refreshes every 30 seconds while the page is visible. The dashboard's enquiry count also counts unread, non-closed enquiries. No browser notification permission is needed.
4. The admin opens **Parent enquiries → Read and reply**. Opening the enquiry marks it read. Reading does not close it or claim that a reply has been sent.
5. The admin writes a reply and clicks **Queue email reply**. The reply, destination, staff ID and creation time are saved. The destination comes from the enquiry, not a client-supplied recipient.
6. The background email worker sends the reply. Only after the provider accepts it does the enquiry automatically change from New to Contacted. A closed enquiry is not reopened by a delayed send.

Only admins can read enquiry messages or send replies. Parents, teachers and bursars cannot access the admin inbox. The visitor does not need an account.

## Enable email delivery

This implementation uses the Resend HTTPS email API and does not add an npm dependency. Notifications and reply forms work without an API key, but email jobs stay **Queued** until delivery is configured.

1. Create a Resend account, verify a sender domain you control, and create a sending API key. Use the provider's restricted test recipient instructions before enabling real visitor delivery. A personal Gmail address can receive notifications and visitor responses, but cannot serve as a verified sender domain you own.
2. Complete the placeholders already added to `.env`:

   ```dotenv
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=your_private_resend_api_key
   EMAIL_FROM=admissions@your-verified-school-domain.example
   ENQUIRY_NOTIFY_EMAIL=your-school-inbox@example.com
   ```

   Use plain email addresses, without display names or angle brackets. If ENQUIRY_NOTIFY_EMAIL is blank, the school inbox defaults to SCHOOL_EMAIL. The visitor's replies are directed to this school inbox using Reply-To. The school notification uses the visitor's address as Reply-To.
3. Preserve existing `.env` settings, keep the file private, and restart with `npm.cmd run dev`.
4. Submit an enquiry using an email account you control. Confirm the on-screen reference, the admin badge, acknowledgement email and school notification. Open the enquiry as admin, queue a reply, refresh its history, and check the recipient's inbox and spam folder.

Once configured, the worker also processes previously queued messages. Review the saved queue before enabling sending on a database containing test enquiries.

## Delivery status and recovery

- **Queued:** stored and waiting for configured delivery or an automatic retry.
- **Sending:** temporarily claimed by the worker. Claims expire after a minute so a restarted app can recover them.
- **Sent:** the email provider accepted the request and returned an ID. This does not prove delivery to the recipient's inbox or that they read it. Check the provider dashboard for bounces or delivery details.
- **Failed:** five attempts failed or the safe retry window expired. The error appears in the enquiry history. Check provider logs before writing a replacement reply to avoid a duplicate message.

The worker processes one job at a time per app instance, with a 1.5-second polling interval and a 20-second HTTP timeout. It runs while the Node app is running. Pending jobs survive app restarts. Multiple instances use an atomic lease to coordinate claims. The same provider idempotency key and saved email payload are reused on retries. Automatic retries stop after 23 hours from the first send attempt, inside the provider's documented 24-hour idempotency retention window.

The contact form has server-side length/email/phone validation, session CSRF protection, an anti-bot hidden field, a one-minute session submission cooldown and duplicate-submit protection. The admin reply and status actions also require CSRF tokens. Enquiry content is escaped in HTML and emails are plain text. Existing enquiries remain readable and can be replied to; they are not retroactively sent acknowledgement emails.

Visitor responses sent from their email client go to the school's inbox. This implementation does not import inbound emails, send SMS/WhatsApp messages, or track email opens.

## Tests

Run `npm.cmd test`. The enquiry tests mock MongoDB and the email service; they do not send real emails or write test messages to your database. They cover the visitor form, duplicate prevention, validation, unread counts, access controls, admin reply history, retries and recovery.

References: [send-email API](https://resend.com/docs/api-reference/emails/send-email), [verified sender domains](https://resend.com/docs/dashboard/domains/introduction), [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
