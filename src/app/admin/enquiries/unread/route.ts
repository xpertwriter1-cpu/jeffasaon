import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';
export async function GET() {
  const user = await currentUser();
  if (user?.role !== 'admin') return new Response(null, { status: 403 });
  const unread = await db.enquiry.count({
    where: {
      status: { not: 'Closed' },
      OR: [{ readAt: null }, { readAt: { isSet: false } }],
    },
  });
  return Response.json({ unread }, { headers: { 'Cache-Control': 'private, no-store' } });
}
