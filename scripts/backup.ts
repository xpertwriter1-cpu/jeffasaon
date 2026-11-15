import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
// Read-only export of every school collection to timestamped Extended JSON files.
// Keep the folder outside the web root, encrypt it, and store a copy off-site.
// MongoDB Atlas continuous backups remain the primary recovery method.
const db = new PrismaClient();
const collections = [
  'users',
  'students',
  'invoices',
  'payments',
  'reports',
  'enquiries',
  'admissioncounters',
  'mpesasandboxattempts',
  'school_settings',
  'academic_terms',
  'licence_records',
  'classes',
  'staff_profiles',
  'staff_attendance',
  'attendance',
  'authorized_pickups',
  'pickup_records',
  'fee_structures',
  'mpesa_requests',
  'care_logs',
  'meal_plans',
  'lessons',
  'observations',
  'competency_assessments',
  'announcements',
  'outbound_messages',
  'immunizations',
  'medication_logs',
  'incidents',
  'timetable_slots',
  'consents',
];
const folder = join(
  process.argv[2] || 'backups',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
mkdirSync(folder, { recursive: true });
try {
  for (const name of collections) {
    const documents: unknown[] = [];
    let result = (await db.$runCommandRaw({ find: name, batchSize: 1000 })) as {
      cursor: { id: unknown; firstBatch?: unknown[]; nextBatch?: unknown[] };
    };
    documents.push(...(result.cursor.firstBatch ?? []));
    while (
      result.cursor.id &&
      JSON.stringify(result.cursor.id) !== '0' &&
      JSON.stringify(result.cursor.id) !== '{"$numberLong":"0"}'
    ) {
      result = (await db.$runCommandRaw({
        getMore: result.cursor.id as never,
        collection: name,
        batchSize: 1000,
      })) as typeof result;
      documents.push(...(result.cursor.nextBatch ?? []));
    }
    writeFileSync(join(folder, name + '.json'), JSON.stringify(documents));
    console.log(name + ': ' + documents.length);
  }
  console.log(
    'Backup written to ' + folder + '. It contains personal data: store it securely.',
  );
} catch {
  console.error('Backup failed. Check the database connection and permissions.');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
