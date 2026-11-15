import type { Role } from './school';
type StaffRole = Exclude<Role, 'parent'>;
const all: StaffRole[] = ['admin', 'headteacher', 'teacher', 'caregiver', 'bursar'];
const leaders: StaffRole[] = ['admin', 'headteacher'];
const classroom: StaffRole[] = ['admin', 'headteacher', 'teacher', 'caregiver'];
// One place that says which staff roles may open (view) or change (edit) each module.
export const modules = {
  dashboard: { label: 'Overview', view: all, edit: leaders },
  students: { label: 'Students', view: all, edit: leaders },
  admissions: { label: 'Admission approvals', view: ['admin'], edit: ['admin'] },
  classes: { label: 'Classes', view: classroom, edit: leaders },
  attendance: { label: 'Attendance', view: classroom, edit: classroom },
  pickup: { label: 'Child pickup', view: classroom, edit: classroom },
  fees: {
    label: 'Fees',
    view: ['admin', 'headteacher', 'bursar'],
    edit: ['admin', 'bursar'],
  },
  payments: { label: 'Payments', view: ['admin', 'bursar'], edit: ['admin', 'bursar'] },
  teachers: { label: 'Teachers & staff', view: leaders, edit: leaders },
  daycare: { label: 'Daycare care', view: classroom, edit: classroom },
  learning: {
    label: 'Learning',
    view: ['admin', 'headteacher', 'teacher'],
    edit: ['admin', 'headteacher', 'teacher'],
  },
  assessment: {
    label: 'CBC assessment',
    view: ['admin', 'headteacher', 'teacher'],
    edit: ['admin', 'headteacher', 'teacher'],
  },
  reports: {
    label: 'Report cards',
    view: ['admin', 'headteacher', 'teacher'],
    edit: ['admin', 'headteacher', 'teacher'],
  },
  communication: {
    label: 'Communication',
    view: all,
    edit: ['admin', 'headteacher', 'teacher'],
  },
  meals: { label: 'Meals', view: classroom, edit: classroom },
  health: { label: 'Health', view: classroom, edit: classroom },
  timetable: { label: 'Timetable', view: classroom, edit: leaders },
  analytics: {
    label: 'School reports',
    view: ['admin', 'headteacher', 'bursar'],
    edit: [] as StaffRole[],
  },
  compliance: { label: 'Licensing & compliance', view: leaders, edit: ['admin'] },
  enquiries: { label: 'Enquiries', view: ['admin'], edit: ['admin'] },
  users: { label: 'User accounts', view: ['admin'], edit: ['admin'] },
  settings: { label: 'School settings', view: ['admin'], edit: ['admin'] },
} satisfies Record<string, { label: string; view: StaffRole[]; edit: StaffRole[] }>;
export type ModuleName = keyof typeof modules;
export const canView = (role: string, name: ModuleName) =>
  (modules[name].view as string[]).includes(role);
export const canEdit = (role: string, name: ModuleName) =>
  (modules[name].edit as string[]).includes(role);
export const viewers = (name: ModuleName) => modules[name].view as readonly Role[];
export const editors = (name: ModuleName) => modules[name].edit as readonly Role[];
