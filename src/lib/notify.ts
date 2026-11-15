import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from './db';
import { normalizePhone } from './mpesa-sandbox';
export const channels = ['sms', 'email', 'whatsapp'] as const;
export type Channel = (typeof channels)[number];
export const channelReady = (channel: Channel) =>
  channel === 'sms'
    ? Boolean(process.env.AT_USERNAME && process.env.AT_API_KEY)
    : channel === 'email'
      ? Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
      : Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
// Default channels for automatic parent alerts (absence, pickup, incidents, receipts).
export function alertChannels(): Channel[] {
  const configured = (process.env.PARENT_ALERT_CHANNELS || 'sms,email')
    .split(',')
    .map((item) => item.trim())
    .filter((item): item is Channel => (channels as readonly string[]).includes(item));
  return configured.length ? configured : ['email'];
}
interface Recipient {
  email?: string | null;
  phone?: string | null;
}
function address(channel: Channel, recipient: Recipient) {
  if (channel === 'email')
    return recipient.email && z.email().safeParse(recipient.email).success
      ? recipient.email
      : null;
  const phone = recipient.phone ? normalizePhone(recipient.phone) : null;
  return phone ? '+' + phone : null;
}
export async function queueMessages(
  recipients: Recipient[],
  wanted: readonly Channel[],
  message: { subject: string; text: string; source: string },
) {
  const seen = new Set<string>();
  const data = [];
  for (const recipient of recipients)
    for (const channel of wanted) {
      const to = address(channel, recipient);
      if (!to || seen.has(channel + to)) continue;
      seen.add(channel + to);
      data.push({
        channel,
        to,
        subject: message.subject.slice(0, 200),
        text: message.text.slice(0, channel === 'sms' ? 640 : 5000),
        source: message.source,
      });
    }
  if (data.length) await db.outboundMessage.createMany({ data });
  return data.length;
}
// Alert every guardian on a child's record: the parent account plus admission contacts.
export async function alertParents(
  studentId: string,
  subject: string,
  text: string,
  source: string,
) {
  const student = await db.student.findUnique({ where: { id: studentId } });
  if (!student) return 0;
  const account = await db.user.findUnique({
    where: { email: student.parentEmail },
    select: { email: true, phone: true },
  });
  return queueMessages(
    [
      { email: student.parentEmail, phone: account?.phone || student.parentPhone },
      { phone: student.alternatePhone },
    ],
    alertChannels(),
    { subject, text, source },
  );
}
export async function sendNow(job: {
  id: string;
  channel: string;
  to: string;
  subject: string | null;
  text: string;
}) {
  const timeout = AbortSignal.timeout(20000);
  if (job.channel === 'sms') {
    const sandbox = process.env.AT_USERNAME === 'sandbox';
    const body = new URLSearchParams({
      username: process.env.AT_USERNAME!,
      to: job.to,
      message: job.text,
      ...(process.env.AT_SENDER_ID ? { from: process.env.AT_SENDER_ID } : {}),
    });
    const response = await fetch(
      'https://api.' +
        (sandbox ? 'sandbox.' : '') +
        'africastalking.com/version1/messaging',
      {
        method: 'POST',
        redirect: 'error',
        signal: timeout,
        headers: {
          apiKey: process.env.AT_API_KEY!,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    if (!response.ok) throw new Error('SMS provider rejected the request.');
    const result = z
      .object({
        SMSMessageData: z.object({
          Recipients: z.array(z.object({ status: z.string(), messageId: z.string() })),
        }),
      })
      .parse(await response.json());
    const first = result.SMSMessageData.Recipients[0];
    if (!first || first.status !== 'Success')
      throw new Error('SMS not accepted: ' + (first?.status || 'no recipient'));
    return first.messageId;
  }
  if (job.channel === 'email') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      signal: timeout,
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'outbound-' + job.id,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [job.to],
        subject: job.subject || 'Message from the school',
        text: job.text,
      }),
    });
    if (!response.ok) throw new Error('Email provider rejected the request.');
    return z.object({ id: z.string() }).parse(await response.json()).id;
  }
  if (job.channel === 'whatsapp') {
    const response = await fetch(
      'https://graph.facebook.com/v21.0/' +
        process.env.WHATSAPP_PHONE_NUMBER_ID +
        '/messages',
      {
        method: 'POST',
        redirect: 'error',
        signal: timeout,
        headers: {
          Authorization: 'Bearer ' + process.env.WHATSAPP_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: job.to.replace('+', ''),
          type: 'text',
          text: { body: job.text },
        }),
      },
    );
    if (!response.ok) throw new Error('WhatsApp provider rejected the request.');
    const result = z
      .object({ messages: z.array(z.object({ id: z.string() })) })
      .parse(await response.json());
    return result.messages[0]?.id || 'accepted';
  }
  throw new Error('Unknown channel.');
}
// Claim one due message with a lease so several workers never send the same message twice.
export async function processOneMessage() {
  const now = new Date();
  const ready = channels.filter(channelReady);
  if (!ready.length) return false;
  const candidate = await db.outboundMessage.findFirst({
    where: {
      channel: { in: [...ready] },
      OR: [
        { status: 'Queued', nextAttemptAt: { lte: now } },
        { status: 'Sending', leaseUntil: { lt: now } },
      ],
    },
    orderBy: { nextAttemptAt: 'asc' },
  });
  if (!candidate) return false;
  const leaseToken = randomBytes(24).toString('hex');
  const claimed = await db.outboundMessage.updateMany({
    where: {
      id: candidate.id,
      status: candidate.status,
      attempts: candidate.attempts,
    },
    data: {
      status: 'Sending',
      leaseToken,
      leaseUntil: new Date(Date.now() + 60000),
      attempts: { increment: 1 },
    },
  });
  if (!claimed.count) return true;
  try {
    const providerId = await sendNow(candidate);
    await db.outboundMessage.updateMany({
      where: { id: candidate.id, leaseToken },
      data: { status: 'Sent', sentAt: new Date(), providerId, error: null },
    });
  } catch (error) {
    const attempts = candidate.attempts + 1;
    await db.outboundMessage.updateMany({
      where: { id: candidate.id, leaseToken },
      data: {
        status: attempts >= 5 ? 'Failed' : 'Queued',
        error:
          error instanceof Error ? error.message.slice(0, 300) : 'Provider unavailable.',
        nextAttemptAt: new Date(Date.now() + Math.min(900000, 30000 * 2 ** attempts)),
      },
    });
  }
  return true;
}
