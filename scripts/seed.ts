import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
try {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12 || Buffer.byteLength(password) > 72)
    throw new Error('Set SEED_ADMIN_PASSWORD to a unique password of 12 to 72 bytes.');
  const email = (process.argv[2] || 'admin@jeffersonspreschool.local').toLowerCase();
  if (await db.user.findUnique({ where: { email } }))
    console.log('Account already exists; unchanged.');
  else {
    await db.user.create({
      data: {
        name: 'School Administrator',
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: 'admin',
      },
    });
    console.log('Administrator created.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seed failed.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
