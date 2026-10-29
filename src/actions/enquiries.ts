'use server';
import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { email, phone, objectId, strings, UserError } from '@/lib/validation';
import { limitRequests } from '@/lib/rate-limit';
import { initialNotifications, inbox } from '@/lib/mail';
import { school } from '@/lib/school';
export async function sendEnquiry(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const raw = strings(form);
    if (raw.website) return { success: 'Thank you for your enquiry.' };
    const values = z
      .object({
        parentName: z.string().min(1).max(200),
        email,
        phone,
        childAge: z.string().max(100).optional(),
        message: z.string().min(1).max(5000),
        requestKey: z.string().regex(/^[a-f\d]{64}$/),
      })
      .parse(raw);
    const submissionKey = createHash('sha256')
      .update(values.requestKey + ':' + values.email)
      .digest('hex');
    const existing = await db.enquiry.findFirst({ where: { submissionKey } });
    if (existing)
      return { success: 'Your enquiry has been received. Reference: ' + existing.id };
    await limitRequests('contact', 5, 60 * 60 * 1000);
    const id = randomBytes(12).toString('hex');
    await db.enquiry.create({
      data: {
        id,
        parentName: values.parentName,
        email: values.email,
        phone: values.phone,
        childAge: values.childAge,
        message: values.message,
        submissionKey,
        notifications: initialNotifications(values, id).map((job) => ({
          ...job,
          id: randomBytes(12).toString('hex'),
        })),
      },
    });
    return {
      success: 'Your enquiry has been received. We will reply by email. Reference: ' + id,
    };
  });
}
export async function replyToEnquiry(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(['admin']);
    const values = z
      .object({
        id: objectId,
        message: z.string().min(1).max(5000),
        replyKey: z.string().regex(/^[a-f\d]{64}$/),
      })
      .parse(strings(form));
    const record = await db.enquiry.findUnique({ where: { id: values.id } });
    if (!record || record.status === 'Closed')
      throw new UserError('This enquiry is closed or unavailable.');
    const result = await db.enquiry.updateMany({
      where: {
        id: record.id,
        status: { not: 'Closed' },
        NOT: { notifications: { some: { requestKey: values.replyKey } } },
      },
      data: {
        notifications: {
          push: {
            id: randomBytes(12).toString('hex'),
            kind: 'Reply',
            to: record.email,
            replyTo: inbox(),
            subject: 'Your enquiry - ' + school.name,
            text: values.message,
            requestKey: values.replyKey,
            createdBy: user.id,
          },
        },
      },
    });
    if (
      !result.count &&
      !record.notifications.some((job) => job.requestKey === values.replyKey)
    )
      throw new UserError('The enquiry changed. Reload the page.');
    return '/admin/enquiries/' + record.id;
  });
}
export async function updateEnquiry(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(['admin']);
    const values = z
      .object({ id: objectId, status: z.enum(['New', 'Contacted', 'Closed']) })
      .parse(strings(form));
    await db.enquiry.update({
      where: { id: values.id },
      data: { status: values.status },
    });
    return '/admin/enquiries/' + values.id;
  });
}
