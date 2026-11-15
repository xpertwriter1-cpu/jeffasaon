import 'dotenv/config';
import { processOneEmail } from '../src/lib/mail';
import { processOneMessage } from '../src/lib/notify';
import { db } from '../src/lib/db';
// One supervised process delivers enquiry emails and the SMS / email / WhatsApp outbox.
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});
process.on('SIGTERM', () => {
  stopped = true;
});
try {
  while (!stopped) {
    let busy = false;
    try {
      busy = (await processOneEmail()) || busy;
    } catch {
      console.error('Email queue paused; messages remain available for retry.');
    }
    try {
      busy = (await processOneMessage()) || busy;
    } catch {
      console.error('Message outbox paused; messages remain available for retry.');
    }
    await new Promise((resolve) => setTimeout(resolve, busy ? 200 : 1500));
  }
} finally {
  await db.$disconnect();
}
