import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient({ log: [] });
try {
  for (const [name, read] of Object.entries({
    users: () => db.user.findMany({ take: 1 }),
    students: () => db.student.findMany({ take: 1 }),
    invoices: () => db.invoice.findMany({ take: 1 }),
    payments: () => db.payment.findMany({ take: 1 }),
    reports: () => db.report.findMany({ take: 1 }),
    enquiries: () => db.enquiry.findMany({ take: 1 }),
    sandbox: () => db.mpesaSandboxAttempt.findMany({ take: 1 }),
    counters: () => db.admissionCounter.findMany({ take: 1 }),
  })) {
    await read();
    console.log(name + ': schema read succeeded');
  }
} catch {
  console.error(
    'Schema verification failed. Review the collection mapping before enabling writes.',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
