import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { viewers, modules, type ModuleName } from '@/lib/permissions';
import { createStaff } from '@/actions/auth';
import { updateAccount, resetPassword } from '@/actions/school';
import { staffRoles } from '@/lib/school';
import { Table, Section } from './ui';
const describe: Record<string, string> = {
  admin: 'Controls the entire system',
  headteacher: 'Manages teachers, classes and school operations',
  teacher: 'Records attendance, activities and learner assessments',
  caregiver: 'Manages daycare routines and child welfare',
  bursar: 'Manages fees, invoices and payment verification',
  parent: 'Views their own children, pays fees and receives updates',
};
export async function UsersPage({ role }: { role?: string }) {
  await requireUser(viewers('users'));
  const filter = role && ['parent', ...staffRoles].includes(role) ? role : undefined;
  const users = await db.user.findMany({
    where: filter ? { role: filter } : { role: { not: 'parent' } },
    select: { id: true, name: true, email: true, phone: true, role: true, active: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    take: 500,
  });
  return (
    <>
      <PageTitle title="User management">
        Create staff accounts, change roles, deactivate leavers and reset passwords.
      </PageTitle>
      <ActionForm action={createStaff} label="Create staff account">
        <div className="form-grid">
          <Field name="name" label="Full name" required />
          <Field name="email" label="Email" type="email" required maxLength={254} />
          <Field name="phone" label="Phone (for SMS alerts)" type="tel" maxLength={30} />
          <Field
            name="password"
            label="Initial password (8-72 bytes)"
            type="password"
            required
            maxLength={72}
          />
          <Field name="role" label="Role" required>
            {staffRoles.map((item) => (
              <option key={item} value={item}>
                {item[0]!.toUpperCase() + item.slice(1)}
              </option>
            ))}
          </Field>
        </div>
        <p className="small-text muted">
          Parents create their own accounts from the website.
        </p>
      </ActionForm>
      <form method="get" className="filter-bar no-print">
        <label className="field">
          <span>Show</span>
          <select name="role" defaultValue={filter ?? ''}>
            <option value="">All staff</option>
            {['parent', ...staffRoles].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button className="button secondary">Show</button>
      </form>
      <Table
        head={['Name', 'Email / phone', 'Role and access', 'Password']}
        empty={!users.length}
      >
        {users.map((user) => (
          <tr key={user.id}>
            <td>
              {user.name}
              {user.active === false && (
                <>
                  {' '}
                  <span className="badge badge-danger">Deactivated</span>
                </>
              )}
            </td>
            <td>
              {user.email}
              <br />
              {user.phone || ''}
            </td>
            <td>
              <ActionForm action={updateAccount} label="Save" className="stack">
                <Hidden name="id" value={user.id} />
                <Field name="role" label="Role" defaultValue={user.role}>
                  {(user.role === 'parent' ? ['parent'] : [...staffRoles]).map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Field>
                <Field
                  name="active"
                  label="Access"
                  defaultValue={user.active === false ? 'no' : 'yes'}
                >
                  <option value="yes">Active</option>
                  <option value="no">Deactivated</option>
                </Field>
              </ActionForm>
            </td>
            <td>
              <ActionForm action={resetPassword} label="Reset" className="stack">
                <Hidden name="id" value={user.id} />
                <Field
                  name="password"
                  label="New password"
                  type="password"
                  required
                  maxLength={72}
                />
              </ActionForm>
            </td>
          </tr>
        ))}
      </Table>
      <Section title="Roles and permissions">
        <Table head={['Module', ...staffRoles]}>
          {(Object.keys(modules) as ModuleName[]).map((name) => (
            <tr key={name}>
              <td>{modules[name].label}</td>
              {staffRoles.map((item) => (
                <td key={item}>
                  {(modules[name].edit as string[]).includes(item)
                    ? 'Edit'
                    : (modules[name].view as string[]).includes(item)
                      ? 'View'
                      : '—'}
                </td>
              ))}
            </tr>
          ))}
        </Table>
        <ul className="small-text">
          {Object.entries(describe).map(([item, text]) => (
            <li key={item}>
              <strong>{item}</strong>: {text}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
