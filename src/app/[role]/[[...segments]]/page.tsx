import { notFound, redirect } from 'next/navigation';
import { currentUser, requireUser } from '@/lib/session';
import { PortalNav } from '@/components/portal-shell';
import { Dashboard } from '@/components/portal/dashboard';
import {
  AdmissionForm,
  StudentRegister,
  StudentRecord,
} from '@/components/portal/students';
import { FeesPage, PaymentsPage, Receipt } from '@/components/portal/finance';
import { ReportsPage, ReportForm, ReportView } from '@/components/portal/reports';
import { EnquiriesPage, StaffPage } from '@/components/portal/enquiries';
export const dynamic = 'force-dynamic';
export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string; segments?: string[] }>;
  searchParams: Promise<{ classLevel?: string; invoice?: string }>;
}) {
  const { role, segments = [] } = await params;
  const query = await searchParams;
  if (!['parent', 'admin'].includes(role)) notFound();
  const parent = role === 'parent';
  if (parent && segments[0] === 'admission' && !(await currentUser()))
    redirect(
      '/auth/login' +
        (query.classLevel ? '?programme=' + encodeURIComponent(query.classLevel) : ''),
    );
  const user = await requireUser(parent ? ['parent'] : ['admin', 'teacher', 'bursar']);
  let page: React.ReactNode;
  const [section, id, action] = segments;
  if ((!section || section === 'dashboard') && segments.length <= 1) page = <Dashboard />;
  else if (parent && section === 'admission' && segments.length === 1)
    page = <AdmissionForm programme={query.classLevel} />;
  else if (section === 'students' && id && segments.length === 2)
    page = <StudentRecord id={id} parent={parent} />;
  else if (!parent && section === 'students' && segments.length === 1)
    page = <StudentRegister />;
  else if (!parent && section === 'admissions' && segments.length === 1)
    page = <StudentRegister approvals />;
  else if (section === 'fees' && segments.length === 1)
    page = <FeesPage parent={parent} />;
  else if (section === 'fees' && id && action === 'statement' && segments.length === 3)
    page = <FeesPage parent={parent} studentId={id} />;
  else if (section === 'payments' && segments.length === 1)
    page = <PaymentsPage parent={parent} selectedInvoice={query.invoice} />;
  else if (section === 'payments' && id && action === 'receipt' && segments.length === 3)
    page = <Receipt parent={parent} id={id} />;
  else if (section === 'reports' && segments.length === 1)
    page = <ReportsPage parent={parent} />;
  else if (!parent && section === 'reports' && id === 'new' && segments.length === 2)
    page = <ReportForm />;
  else if (
    !parent &&
    section === 'reports' &&
    id &&
    action === 'edit' &&
    segments.length === 3
  )
    page = <ReportForm id={id} />;
  else if (section === 'reports' && id && segments.length === 2)
    page = <ReportView parent={parent} id={id} />;
  else if (!parent && section === 'enquiries' && segments.length <= 2)
    page = <EnquiriesPage id={id} />;
  else if (!parent && section === 'users' && segments.length === 1) page = <StaffPage />;
  else notFound();
  return (
    <div className="container page">
      <PortalNav role={user.role} />
      {page}
    </div>
  );
}
