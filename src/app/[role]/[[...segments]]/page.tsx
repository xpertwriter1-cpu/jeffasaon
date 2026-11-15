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
import { EnquiriesPage } from '@/components/portal/enquiries';
import { ClassesPage } from '@/components/portal/classes';
import { AttendancePage, ParentAttendance } from '@/components/portal/attendance';
import { PickupPage, ParentPickups } from '@/components/portal/pickup';
import { TeachersPage } from '@/components/portal/teachers';
import { DaycarePage, ParentDaily } from '@/components/portal/daycare';
import {
  LearningPage,
  AssessmentPage,
  ParentLearning,
} from '@/components/portal/learning';
import { CommunicationPage, ParentMessages } from '@/components/portal/communication';
import { MealsPage } from '@/components/portal/meals';
import { HealthPage, ParentHealth } from '@/components/portal/health';
import { TimetablePage } from '@/components/portal/timetable';
import { AnalyticsPage } from '@/components/portal/analytics';
import { SettingsPage, CompliancePage } from '@/components/portal/settings';
import { UsersPage } from '@/components/portal/users';
import { canView, modules, type ModuleName } from '@/lib/permissions';
import { staffRoles } from '@/lib/school';
export const dynamic = 'force-dynamic';
type Query = Record<string, string | undefined>;
export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string; segments?: string[] }>;
  searchParams: Promise<Query>;
}) {
  const { role, segments = [] } = await params;
  const raw = await searchParams;
  // Accept only single string values from the query string.
  const query: Query = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => typeof value === 'string'),
  );
  if (!['parent', 'admin'].includes(role)) notFound();
  const parent = role === 'parent';
  if (parent && segments[0] === 'admission' && !(await currentUser()))
    redirect(
      '/auth/login' +
        (query.classLevel ? '?programme=' + encodeURIComponent(query.classLevel) : ''),
    );
  const user = await requireUser(parent ? ['parent'] : staffRoles);
  const [section = 'dashboard', id, action] = segments;
  if (!parent && section in modules && !canView(user.role, section as ModuleName))
    notFound();
  const one = segments.length <= 1;
  let page: React.ReactNode;
  if (section === 'dashboard' && one) page = <Dashboard />;
  else if (section === 'students' && id && segments.length === 2)
    page = <StudentRecord id={id} parent={parent} />;
  else if (section === 'fees' && one) page = <FeesPage parent={parent} />;
  else if (section === 'fees' && id && action === 'statement' && segments.length === 3)
    page = <FeesPage parent={parent} studentId={id} />;
  else if (section === 'payments' && one)
    page = <PaymentsPage parent={parent} selectedInvoice={query.invoice} />;
  else if (section === 'payments' && id && action === 'receipt' && segments.length === 3)
    page = <Receipt parent={parent} id={id} />;
  else if (section === 'reports' && one) page = <ReportsPage parent={parent} />;
  else if (
    section === 'reports' &&
    id &&
    segments.length === 2 &&
    !(id === 'new' && !parent)
  )
    page = <ReportView parent={parent} id={id} />;
  else if (section === 'timetable' && one)
    page = <TimetablePage parent={parent} level={query.level} />;
  else if (parent) {
    if (section === 'admission' && one)
      page = <AdmissionForm programme={query.classLevel} />;
    else if (section === 'attendance' && one) page = <ParentAttendance />;
    else if (section === 'daily' && one)
      page = <ParentDaily studentId={query.student} day={query.day} />;
    else if (section === 'learning' && one) page = <ParentLearning />;
    else if (section === 'messages' && one) page = <ParentMessages />;
    else if (section === 'pickups' && one) page = <ParentPickups />;
    else if (section === 'health' && one) page = <ParentHealth />;
    else notFound();
  } else if (section === 'students' && one) page = <StudentRegister />;
  else if (section === 'admissions' && one) page = <StudentRegister approvals />;
  else if (section === 'reports' && id === 'new' && segments.length === 2)
    page = <ReportForm studentId={query.student} />;
  else if (section === 'reports' && id && action === 'edit' && segments.length === 3)
    page = <ReportForm id={id} />;
  else if (section === 'enquiries' && segments.length <= 2)
    page = <EnquiriesPage id={id} />;
  else if (!one) notFound();
  else if (section === 'users') page = <UsersPage role={query.role} />;
  else if (section === 'classes') page = <ClassesPage level={query.level} />;
  else if (section === 'attendance')
    page = <AttendancePage day={query.day} level={query.level} />;
  else if (section === 'pickup') page = <PickupPage />;
  else if (section === 'teachers')
    page = <TeachersPage day={query.day} staffId={query.staff} />;
  else if (section === 'daycare')
    page = <DaycarePage day={query.day} level={query.level} />;
  else if (section === 'learning') page = <LearningPage level={query.level} />;
  else if (section === 'assessment')
    page = <AssessmentPage level={query.level} year={query.year} term={query.term} />;
  else if (section === 'communication') page = <CommunicationPage />;
  else if (section === 'meals') page = <MealsPage day={query.day} />;
  else if (section === 'health') page = <HealthPage studentId={query.student} />;
  else if (section === 'analytics') page = <AnalyticsPage query={query} />;
  else if (section === 'compliance') page = <CompliancePage />;
  else if (section === 'settings') page = <SettingsPage />;
  else notFound();
  return (
    <div className="container page">
      <PortalNav role={user.role} />
      {page}
    </div>
  );
}
