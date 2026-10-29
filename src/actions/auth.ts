'use server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getSession, requireUser } from '@/lib/session';
import {
  email,
  password,
  phone,
  strings,
  formPassword,
  UserError,
} from '@/lib/validation';
import { runForm, type FormState } from '@/lib/forms';
import { limitRequests } from '@/lib/rate-limit';
import { programmes, roles } from '@/lib/school';
function destination(role: string, programme?: string) {
  return role === 'parent'
    ? programmes.includes(programme as (typeof programmes)[number])
      ? '/parent/admission?classLevel=' + encodeURIComponent(programme!)
      : '/parent/dashboard'
    : '/admin/dashboard';
}
export async function signIn(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const values = z
      .object({ email, password, role: z.enum(roles), programme: z.string().optional() })
      .parse({ ...strings(form), password: formPassword(form) });
    await limitRequests('auth', 30, 15 * 60 * 1000);
    const user = await db.user.findUnique({ where: { email: values.email } });
    if (
      !user ||
      user.role !== values.role ||
      !(await bcrypt.compare(values.password, user.passwordHash))
    )
      throw new UserError('Email, password or account type is incorrect.');
    const session = await getSession();
    session.userId = user.id;
    session.programme = values.programme;
    await session.save();
    return destination(user.role, values.programme);
  });
}
export async function register(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const values = z
      .object({
        name: z.string().min(1).max(200),
        email,
        phone,
        password,
        programme: z.string().optional(),
      })
      .parse({ ...strings(form), password: formPassword(form) });
    await limitRequests('auth', 30, 15 * 60 * 1000);
    if (await db.user.findUnique({ where: { email: values.email } }))
      throw new UserError('An account with that email already exists.');
    const user = await db.user.create({
      data: {
        name: values.name,
        email: values.email,
        phone: values.phone,
        passwordHash: await bcrypt.hash(values.password, 12),
        role: 'parent',
      },
    });
    const session = await getSession();
    session.userId = user.id;
    session.programme = values.programme;
    await session.save();
    return destination(user.role, values.programme);
  });
}
export async function signOut() {
  const session = await getSession();
  session.destroy();
  redirect('/');
}
export async function createStaff(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    await requireUser(['admin']);
    const values = z
      .object({
        name: z.string().min(1).max(200),
        email,
        password,
        role: z.enum(['admin', 'teacher', 'bursar']),
      })
      .parse({ ...strings(form), password: formPassword(form) });
    await db.user.create({
      data: {
        name: values.name,
        email: values.email,
        role: values.role,
        passwordHash: await bcrypt.hash(values.password, 12),
      },
    });
    return '/admin/users';
  });
}
