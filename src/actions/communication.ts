'use server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { runForm, type FormState } from '@/lib/forms';
import { editors } from '@/lib/permissions';
import { strings } from '@/lib/validation';
import { programmes, staffRoles } from '@/lib/school';
import { announcementAudiences } from '@/lib/lists';
import { channels, queueMessages, type Channel } from '@/lib/notify';
import { getSettings, requiredText, assert, activeAccount } from '@/lib/settings';
export async function postAnnouncement(_state: FormState, form: FormData) {
  return runForm(form, async () => {
    const user = await requireUser(editors('communication'));
    const values = z
      .object({
        title: requiredText(150),
        body: requiredText(4000),
        audience: z.enum(announcementAudiences),
        classLevel: z.string().optional(),
      })
      .parse(strings(form));
    const picked = form
      .getAll('channels')
      .filter((value): value is Channel =>
        (channels as readonly unknown[]).includes(value),
      );
    let classLevel: string | undefined;
    if (values.audience === 'Class level') {
      classLevel = z.enum(programmes).parse(values.classLevel);
    }
    // Teachers may message parents of a class; whole-school notices need a leader.
    if (user.role === 'teacher')
      assert(
        values.audience === 'Class level',
        'Teachers can message one class level at a time.',
      );
    const parents =
      values.audience === 'All staff'
        ? []
        : values.audience === 'Class level'
          ? await (async () => {
              const students = await db.student.findMany({
                where: { classLevel, status: { in: ['Admitted', 'Active'] } },
                select: { parentEmail: true, parentPhone: true },
              });
              const accounts = await db.user.findMany({
                where: {
                  email: { in: students.map((student) => student.parentEmail) },
                  role: 'parent',
                },
                select: { email: true, phone: true },
              });
              return students.map((student) => ({
                email: student.parentEmail,
                phone:
                  accounts.find((account) => account.email === student.parentEmail)
                    ?.phone || student.parentPhone,
              }));
            })()
          : await db.user.findMany({
              where: { role: 'parent', ...activeAccount },
              select: { email: true, phone: true },
            });
    const staff =
      values.audience === 'All staff' || values.audience === 'Everyone'
        ? await db.user.findMany({
            where: { role: { in: [...staffRoles] }, ...activeAccount },
            select: { email: true, phone: true },
          })
        : [];
    const settings = await getSettings();
    const announcement = await db.announcement.create({
      data: {
        title: values.title,
        body: values.body,
        audience: values.audience,
        classLevel,
        channels: picked,
        createdBy: user.id,
      },
    });
    const queued = await queueMessages([...parents, ...staff], picked, {
      subject: settings.name + ': ' + values.title,
      text: settings.name + ': ' + values.title + '\n\n' + values.body,
      source: 'announcement:' + announcement.id,
    });
    await db.announcement.update({
      where: { id: announcement.id },
      data: { recipients: queued },
    });
    return {
      success:
        'Announcement posted to the portal' +
        (picked.length ? ' and ' + queued + ' message(s) queued.' : '.'),
    };
  });
}
