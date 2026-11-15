import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
// Create an administrator, or promote and reactivate an existing account, and set its
// password. Usage: ADMIN_PASSWORD=... tsx scripts/make-admin.ts someone@example.com
const db = new PrismaClient();
try {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Give the admin email address.');
  if (password.length < 12 || Buffer.byteLength(password) > 72)
    throw new Error('The password must be 12 to 72 characters. Nothing was changed.');
  let host = 'unknown';
  try {
    host = new URL(process.env.DATABASE_URL || '').hostname;
  } catch {}
  console.log('Database: ' + host);
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.user.update({
      where: { email },
      data: { role: 'admin', passwordHash },
    });
    console.log(
      'Existing account (' +
        existing.role +
        ') is now an Administrator with the new password.',
    );
  } else {
    await db.user.create({
      data: { name: 'School Administrator', email, passwordHash, role: 'admin' },
    });
    console.log('Administrator created.');
  }
  console.log('Sign in with Account type: Admin.');
} catch (error) {
  console.error('FAILED: ' + (error instanceof Error ? error.message : 'unknown error'));
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
