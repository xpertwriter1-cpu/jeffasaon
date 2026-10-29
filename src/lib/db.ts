import { PrismaClient } from '@prisma/client';
const globalDatabase = globalThis as unknown as { database?: PrismaClient };
export const db = globalDatabase.database ?? new PrismaClient({ log: ['error'] });
if (process.env.NODE_ENV !== 'production') globalDatabase.database = db;
