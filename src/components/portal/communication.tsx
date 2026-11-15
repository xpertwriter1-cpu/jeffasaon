import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PageTitle } from '@/components/portal-shell';
import { ActionForm } from '@/components/action-form';
import { Field } from '@/components/fields';
import { canEdit, viewers } from '@/lib/permissions';
import { postAnnouncement } from '@/actions/communication';
import { programmes, date } from '@/lib/school';
import { announcementAudiences } from '@/lib/lists';
import { channelReady, channels } from '@/lib/notify';
import { Table, Section } from './ui';
const channelLabel: Record<string, string> = {
  sms: 'SMS',
  email: 'Email',
  whatsapp: 'WhatsApp',
};
export async function CommunicationPage() {
  const user = await requireUser(viewers('communication'));
  const [announcements, outbox] = await Promise.all([
    db.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db.outboundMessage.groupBy({ by: ['status', 'channel'], _count: { _all: true } }),
  ]);
  const edit = canEdit(user.role, 'communication');
  return (
    <>
      <PageTitle title="Communication">
        Announcements appear in every recipient’s portal. Ticked channels also send SMS,
        email or WhatsApp through the message worker.
      </PageTitle>
      {edit && (
        <ActionForm action={postAnnouncement} label="Post announcement">
          <div className="form-grid">
            <Field name="title" label="Title" required maxLength={150} />
            <Field
              name="audience"
              label="Audience"
              required
              defaultValue={user.role === 'teacher' ? 'Class level' : 'All parents'}
            >
              {announcementAudiences.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Field>
            <Field name="classLevel" label="Class level (for class messages)">
              <option value="">—</option>
              {programmes.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Field>
          </div>
          <Field name="body" label="Message" type="textarea" required maxLength={4000} />
          <fieldset className="form-section">
            <legend>Also send by</legend>
            {channels.map((channel) => (
              <label className="check" key={channel}>
                <input
                  type="checkbox"
                  name="channels"
                  value={channel}
                  disabled={!channelReady(channel)}
                />
                <span>
                  {channelLabel[channel]}
                  {!channelReady(channel) && ' (not configured)'}
                </span>
              </label>
            ))}
          </fieldset>
          <p className="small-text muted">
            SMS is limited to 640 characters. WhatsApp business messages outside a 24-hour
            conversation may require an approved template.
          </p>
        </ActionForm>
      )}
      <Section title="Delivery queue">
        <Table head={['Channel', 'Status', 'Messages']} empty={!outbox.length}>
          {outbox.map((row) => (
            <tr key={row.channel + row.status}>
              <td>{channelLabel[row.channel] || row.channel}</td>
              <td>{row.status}</td>
              <td>{row._count._all}</td>
            </tr>
          ))}
        </Table>
      </Section>
      <Section title="Announcements">
        <Table
          head={['Date', 'Title', 'Audience', 'Channels', 'Queued']}
          empty={!announcements.length}
        >
          {announcements.map((item) => (
            <tr key={item.id}>
              <td>{date(item.createdAt)}</td>
              <td>
                <strong>{item.title}</strong>
                <p className="small-text preserve-lines">{item.body.slice(0, 300)}</p>
              </td>
              <td>
                {item.audience}
                {item.classLevel ? ' · ' + item.classLevel : ''}
              </td>
              <td>
                {item.channels
                  .map((channel) => channelLabel[channel] || channel)
                  .join(', ') || 'Portal only'}
              </td>
              <td>{item.recipients}</td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
export async function ParentMessages() {
  const user = await requireUser(['parent']);
  const children = await db.student.findMany({
    where: { parentEmail: user.email },
    select: { classLevel: true },
  });
  const levels = [...new Set(children.map((child) => child.classLevel))];
  const announcements = await db.announcement.findMany({
    where: {
      OR: [
        { audience: { in: ['All parents', 'Everyone'] } },
        { audience: 'Class level', classLevel: { in: levels } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return (
    <>
      <PageTitle title="Messages from the school">
        Notices for all parents and for your child’s class.
      </PageTitle>
      {!announcements.length && <p className="empty">No messages yet.</p>}
      {announcements.map((item) => (
        <article className="record-card" key={item.id}>
          <h2 className="h3">{item.title}</h2>
          <p className="small-text muted">
            {date(item.createdAt)}
            {item.classLevel ? ' · ' + item.classLevel : ''}
          </p>
          <p className="preserve-lines">{item.body}</p>
        </article>
      ))}
    </>
  );
}
