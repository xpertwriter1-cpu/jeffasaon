import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Notification, Prisma } from '@prisma/client';
import { db } from './db';
import { school } from './school';
export const inbox = () => process.env.ENQUIRY_NOTIFY_EMAIL || school.email;
export function mailReady() {
  return (
    process.env.EMAIL_PROVIDER === 'resend' &&
    Boolean(process.env.RESEND_API_KEY) &&
    z.email().safeParse(process.env.EMAIL_FROM).success &&
    z.email().safeParse(inbox()).success
  );
}
export function initialNotifications(
  values: { parentName: string; email: string; phone: string; message: string },
  reference: string,
): Prisma.NotificationCreateInput[] {
  return [
    {
      kind: 'Acknowledgement',
      to: values.email,
      replyTo: inbox(),
      subject: 'We received your enquiry - ' + school.name,
      text:
        'Hello ' +
        values.parentName +
        ',\n\nThank you for contacting ' +
        school.name +
        '. We will reply to this email address.\n\nReference: ' +
        reference,
    },
    {
      kind: 'School notification',
      to: inbox(),
      replyTo: values.email,
      subject: 'New website enquiry - ' + school.name,
      text:
        'Name: ' +
        values.parentName +
        '\nEmail: ' +
        values.email +
        '\nPhone: ' +
        values.phone +
        '\n\n' +
        values.message +
        '\n\nReference: ' +
        reference,
    },
  ];
}
const notificationSchema = z
  .object({
    kind: z.string(),
    to: z.string(),
    from: z.string().nullable().optional(),
    replyTo: z.string().nullable().optional(),
    subject: z.string(),
    text: z.string(),
    leaseToken: z.string().nullable().optional(),
    attempts: z.number(),
    firstAttemptAt: z
      .union([z.object({ $date: z.string() }), z.string()])
      .optional()
      .nullable(),
    _id: z.object({ $oid: z.string() }).optional(),
  })
  .passthrough();
// Atomic leases let an external worker safely retry the embedded legacy mail queue.
export async function processOneEmail() {
  if (!mailReady()) return false;
  const now = new Date();
  const leaseToken = randomBytes(24).toString('hex');
  const iso = (date: Date) => ({ $date: date.toISOString() });
  const result = await db.$runCommandRaw({
    findAndModify: 'enquiries',
    query: {
      notifications: {
        $elemMatch: {
          $or: [
            { status: 'Queued', nextAttemptAt: { $lte: iso(now) } },
            { status: 'Sending', leaseUntil: { $lt: iso(now) } },
          ],
        },
      },
    },
    update: {
      $set: {
        'notifications.$.status': 'Sending',
        'notifications.$.leaseToken': leaseToken,
        'notifications.$.leaseUntil': iso(new Date(Date.now() + 60000)),
      },
      $inc: { 'notifications.$.attempts': 1 },
    },
    new: true,
  });
  if (!result.value) return false;
  const record = z
    .object({
      _id: z.object({ $oid: z.string() }),
      notifications: z.array(notificationSchema),
    })
    .parse(result.value);
  const job = record.notifications.find((item) => item.leaseToken === leaseToken);
  if (!job) return false;
  const first = job.firstAttemptAt
    ? typeof job.firstAttemptAt === 'string'
      ? new Date(job.firstAttemptAt)
      : new Date(job.firstAttemptAt.$date)
    : now;
  const from = job.from || process.env.EMAIL_FROM!;
  const match = {
    _id: { $oid: record._id.$oid },
    notifications: { $elemMatch: { leaseToken } },
  };
  await db.$runCommandRaw({
    update: 'enquiries',
    updates: [
      {
        q: match,
        u: {
          $set: {
            'notifications.$.firstAttemptAt': iso(first),
            'notifications.$.from': from,
          },
        },
      },
    ],
  });
  let providerId: string | undefined,
    error = '';
  try {
    if (Date.now() - first.getTime() > 23 * 3600000)
      throw new Error('Automatic retry window expired. Check the provider log.');
    if (
      !z.email().safeParse(job.to).success ||
      !z.email().safeParse(from).success ||
      !z.email().safeParse(job.replyTo).success
    )
      throw new Error('Invalid sender or recipient.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key':
          'enquiry-' + record._id.$oid + '-' + (job._id?.$oid || job.leaseToken),
      },
      body: JSON.stringify({
        from,
        to: [job.to],
        reply_to: job.replyTo,
        subject: job.subject,
        text: job.text,
      }),
    });
    if (!response.ok) throw new Error('Email provider rejected the request.');
    providerId = z.object({ id: z.string() }).parse(await response.json()).id;
  } catch (e) {
    error = e instanceof Error ? e.message : 'Email provider unavailable.';
  }
  const changes: Prisma.InputJsonObject = providerId
    ? {
        'notifications.$.status': 'Sent',
        'notifications.$.sentAt': iso(new Date()),
        'notifications.$.providerId': providerId,
        'notifications.$.error': '',
      }
    : {
        'notifications.$.status':
          job.attempts >= 5 || Date.now() - first.getTime() > 23 * 3600000
            ? 'Failed'
            : 'Queued',
        'notifications.$.error': error,
        'notifications.$.nextAttemptAt': iso(
          new Date(Date.now() + Math.min(900000, 30000 * 2 ** Math.min(job.attempts, 5))),
        ),
      };
  await db.$runCommandRaw({
    update: 'enquiries',
    updates: [{ q: match, u: { $set: changes } }],
  });
  if (providerId && job.kind === 'Reply')
    await db.enquiry.updateMany({
      where: { id: record._id.$oid, status: 'New' },
      data: { status: 'Contacted' },
    });
  return true;
}
export function notificationStatus(job: Notification) {
  return job.status + (job.error ? ': ' + job.error : '');
}
