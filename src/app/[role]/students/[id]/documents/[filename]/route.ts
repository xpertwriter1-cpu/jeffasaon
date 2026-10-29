import path from 'node:path';
import fs from 'node:fs/promises';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { objectId } from '@/lib/validation';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ role: string; id: string; filename: string }> },
) {
  const { role, id, filename } = await params;
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  if (
    (role === 'parent' && user.role !== 'parent') ||
    (role === 'admin' && !['admin', 'teacher'].includes(user.role)) ||
    !['parent', 'admin'].includes(role)
  )
    return new Response(null, { status: 403 });
  if (!objectId.safeParse(id).success) return new Response(null, { status: 404 });
  const student = await db.student.findFirst({
    where: { id, ...(role === 'parent' ? { parentEmail: user.email } : {}) },
  });
  const document = student?.documents.find(
    (item) => item.storedName === filename || item.id === filename,
  );
  if (!document) return new Response(null, { status: 404 });
  const root = path.resolve('private-uploads/admissions'),
    target = path.resolve(root, document.storedName);
  if (path.dirname(target) !== root) return new Response(null, { status: 404 });
  let data: Buffer;
  try {
    data = await fs.readFile(target);
  } catch {
    return new Response(null, { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Disposition':
        "attachment; filename*=UTF-8''" + encodeURIComponent(document.originalName),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
