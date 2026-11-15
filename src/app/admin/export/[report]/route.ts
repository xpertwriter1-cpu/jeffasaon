import { currentUser } from '@/lib/session';
import { getSettings } from '@/lib/settings';
import {
  buildReport,
  toCsv,
  reportNames,
  reportRoles,
  type ReportName,
} from '@/lib/reports';
export const dynamic = 'force-dynamic';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  const { report } = await params;
  const user = await currentUser();
  if (
    !(reportNames as readonly string[]).includes(report) ||
    !user ||
    !reportRoles[report as ReportName].includes(user.role)
  )
    return new Response('Not found', { status: 404 });
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const settings = await getSettings();
  const table = await buildReport(report as ReportName, query, {
    year: settings.currentYear,
    term: settings.currentTerm,
  });
  const filename = (table.title.replace(/[^\w-]+/g, '-') + '.csv').toLowerCase();
  return new Response(toCsv(table), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + filename + '"',
      'Cache-Control': 'private, no-store',
    },
  });
}
