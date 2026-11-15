import { handleCallback } from '@/lib/mpesa-confirm';
// Safaricom posts the STK Push result here. The unguessable per-request token in the
// URL authenticates the call; the response is always "accepted" so nothing leaks.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; token: string }> },
) {
  const { id, token } = await params;
  try {
    const text = await request.text();
    if (text.length <= 20000) await handleCallback(id, token, JSON.parse(text));
  } catch {}
  return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
