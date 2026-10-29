import 'server-only';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'node:crypto';
import { db } from './db';
import { roles, type Role } from './school';
interface Session {
  userId?: string;
  programme?: string;
}
const developmentSecret = randomBytes(48).toString('hex');
export async function getSession() {
  const password = process.env.SESSION_SECRET;
  if (
    process.env.NODE_ENV === 'production' &&
    (!password || password.length < 32 || /change|replace|development/i.test(password))
  )
    throw new Error('Configure a random SESSION_SECRET of at least 32 characters.');
  return getIronSession<Session>(await cookies(), {
    cookieName: 'jeffersons_session',
    password: password && password.length >= 32 ? password : developmentSecret,
    ttl: 8 * 3600,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  });
}
export async function currentUser() {
  const session = await getSession();
  if (!session.userId || !/^[a-f\d]{24}$/i.test(session.userId)) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });
  return user && roles.includes(user.role as Role) ? user : null;
}
export async function requireUser(allowed: readonly Role[] = roles) {
  const user = await currentUser();
  if (!user) redirect('/auth/login');
  if (!allowed.includes(user.role as Role))
    redirect(user.role === 'parent' ? '/parent/dashboard' : '/admin/dashboard');
  return user;
}
