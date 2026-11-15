'use server';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { runForm, type FormState } from '@/lib/forms';
import { email, password, strings, UserError } from '@/lib/validation';
import { limitRequests } from '@/lib/rate-limit';
import { channelReady, sendNow } from '@/lib/notify';
import { normalizePhone } from '@/lib/mpesa-sandbox';
import { school } from '@/lib/school';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
// The reset link must point at the real site, never at a Host header an attacker sent.
function appUrl() {
  const raw =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : '');
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url.origin : null;
  } catch {
    return null;
  }
}
const generic =
  'If that email belongs to an account, we have sent a reset link to its email' +
  ' (and phone, if on record). It expires in 30 minutes. No message? Contact the school office.';
export async function requestReset(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const values = z.object({ email }).parse(strings(form));
    await limitRequests('password-reset', 20, 15 * 60 * 1000);
    await limitRequests('password-reset-email', 3, 15 * 60 * 1000, values.email);
    const user = await db.user.findUnique({ where: { email: values.email } });
    const base = appUrl();
    if (!user || user.active === false || !base) return { success: generic };
    // One live link per account.
    await db.passwordReset.updateMany({
      where: { user: user.id, OR: [{ usedAt: null }, { usedAt: { isSet: false } }] },
      data: { usedAt: new Date() },
    });
    const token = randomBytes(32).toString('hex');
    await db.passwordReset.create({
      data: {
        user: user.id,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    const link = base + '/auth/reset?token=' + token;
    const jobs = [];
    if (channelReady('email'))
      jobs.push({
        id: 'reset-' + hash(token).slice(0, 16),
        channel: 'email',
        to: user.email,
        subject: school.name + ': reset your password',
        text:
          'Hello ' +
          user.name +
          ',\n\nSomeone asked to reset the password for your ' +
          school.name +
          ' portal account. To choose a new password, open this link within 30 minutes:\n\n' +
          link +
          '\n\nIf you did not ask for this, ignore this email; your password will not change.',
      });
    const phone = user.phone ? normalizePhone(user.phone) : null;
    if (phone && channelReady('sms'))
      jobs.push({
        id: 'reset-sms',
        channel: 'sms',
        to: '+' + phone,
        subject: null,
        text:
          school.name +
          ' password reset link (30 min): ' +
          link +
          ' Ignore if you did not ask.',
      });
    // Send immediately: hosted deployments may have no background worker.
    await Promise.allSettled(jobs.map((job) => sendNow(job)));
    return { success: generic };
  });
}
export async function completeReset(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const values = z
      .object({
        token: z.string().regex(/^[a-f\d]{64}$/, 'This reset link is not valid.'),
        confirm: z.string(),
      })
      .parse(strings(form));
    const raw = form.get('password');
    const newPassword = password.parse(typeof raw === 'string' ? raw : '');
    if (newPassword !== form.get('confirm'))
      throw new UserError('The two passwords do not match.');
    await limitRequests('password-reset-complete', 20, 15 * 60 * 1000);
    const reset = await db.passwordReset.findUnique({
      where: { tokenHash: hash(values.token) },
    });
    const now = new Date();
    if (!reset || reset.usedAt || reset.expiresAt < now)
      throw new UserError(
        'This reset link has expired or was already used. Ask for a new one.',
      );
    const claimed = await db.passwordReset.updateMany({
      where: {
        id: reset.id,
        expiresAt: { gt: now },
        OR: [{ usedAt: null }, { usedAt: { isSet: false } }],
      },
      data: { usedAt: now },
    });
    if (!claimed.count)
      throw new UserError(
        'This reset link has expired or was already used. Ask for a new one.',
      );
    const user = await db.user.findUnique({ where: { id: reset.user } });
    if (!user || user.active === false)
      throw new UserError('This account cannot be reset. Contact the school office.');
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    return { success: 'Password changed. You can now sign in with your new password.' };
  });
}
