import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ log: [] });
try {
  await db.$connect();
  await db.$runCommandRaw({ ping: 1 });
  console.log('Prisma connected successfully to MongoDB.');
} catch {
  console.error(
    'Could not connect. Check DATABASE_URL, Atlas IP access and database credentials.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
