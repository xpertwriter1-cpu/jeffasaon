import Link from 'next/link';
import { notFound } from 'next/navigation';
import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { replyToEnquiry, updateEnquiry } from '@/actions/enquiries';
import { createStaff } from '@/actions/auth';
import { date } from '@/lib/school';
import { objectId } from '@/lib/validation';
import { mailReady, notificationStatus } from '@/lib/mail';
export async function EnquiriesPage({ id }: { id?: string }) {
  const user = await requireUser(['admin']);
  if (!id) {
    const enquiries = await db.enquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return (
      <>
        <PageTitle title="Parent enquiries">
          Website messages and the school’s reply history.
        </PageTitle>
        {!mailReady() && (
          <p className="notice">
            Email delivery is not configured. Enquiries are saved and messages remain
            queued. Configure the email provider and run pnpm mail:worker.
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Parent</th>
                <th>Message</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {enquiries.map((enquiry) => (
                <tr key={enquiry.id}>
                  <td>
                    {date(enquiry.createdAt)}
                    {!enquiry.readAt && <strong> / Unread</strong>}
                  </td>
                  <td>
                    <Link href={'/admin/enquiries/' + enquiry.id}>
                      {enquiry.parentName}
                    </Link>
                    <br />
                    {enquiry.email}
                  </td>
                  <td>{enquiry.message.slice(0, 120)}</td>
                  <td>{enquiry.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!enquiries.length && <p className="empty">No enquiries yet.</p>}
      </>
    );
  }
  if (!objectId.safeParse(id).success) notFound();
  const enquiry = await db.enquiry.findUnique({ where: { id } });
  if (!enquiry) notFound();
  if (!enquiry.readAt)
    await db.enquiry.updateMany({
      where: { id, OR: [{ readAt: null }, { readAt: { isSet: false } }] },
      data: { readAt: new Date(), readBy: user.id },
    });
  return (
    <>
      <PageTitle title={'Enquiry from ' + enquiry.parentName} />
      <div className="record-card">
        <p>
          {enquiry.email} / {enquiry.phone}
          <br />
          Child’s age: {enquiry.childAge || 'Not provided'}
          <br />
          {date(enquiry.createdAt)}
        </p>
        <p className="preserve-lines">{enquiry.message}</p>
      </div>
      {enquiry.status !== 'Closed' && (
        <ActionForm action={replyToEnquiry} label="Queue email reply">
          <Hidden name="id" value={id} />
          <Hidden name="replyKey" value={randomBytes(32).toString('hex')} />
          <Field
            name="message"
            label="Your reply"
            type="textarea"
            maxLength={5000}
            required
          />
          <p className="muted small-text">
            The reply goes to the saved parent email address. Delivery is processed by the
            email worker.
          </p>
        </ActionForm>
      )}
      <div className="record-card">
        <h2 className="h3">Delivery and reply history</h2>
        {enquiry.notifications.map((notification, index) => (
          <article key={notification.id || index}>
            <h3>{notification.kind}</h3>
            <p className="small-text">{notificationStatus(notification)}</p>
            {notification.kind === 'Reply' && (
              <p className="preserve-lines">{notification.text}</p>
            )}
          </article>
        ))}
      </div>
      <ActionForm action={updateEnquiry} label="Update enquiry">
        <Hidden name="id" value={id} />
        <Field name="status" label="Status" defaultValue={enquiry.status}>
          {['New', 'Contacted', 'Closed'].map((status) => (
            <option key={status}>{status}</option>
          ))}
        </Field>
      </ActionForm>
    </>
  );
}
export async function StaffPage() {
  await requireUser(['admin']);
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return (
    <>
      <PageTitle title="Staff accounts">
        Only school administrators can create staff accounts.
      </PageTitle>
      <ActionForm action={createStaff} label="Create staff account">
        <div className="form-grid">
          <Field name="name" label="Full name" required />
          <Field name="email" label="Email" type="email" required maxLength={254} />
          <Field
            name="password"
            label="Initial password (8-72 bytes)"
            type="password"
            required
            maxLength={72}
          />
          <Field name="role" label="Role" required>
            {['teacher', 'bursar', 'admin'].map((role) => (
              <option key={role}>{role}</option>
            ))}
          </Field>
        </div>
      </ActionForm>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>{user.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
