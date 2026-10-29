import 'dotenv/config';
import { processOneEmail } from '../src/lib/mail';
import { db } from '../src/lib/db';
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});
process.on('SIGTERM', () => {
  stopped = true;
});
try {
  while (!stopped) {
    try {
      await processOneEmail();
    } catch {
      console.error('Email queue paused; messages remain available for retry.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
} finally {
  await db.$disconnect();
}
