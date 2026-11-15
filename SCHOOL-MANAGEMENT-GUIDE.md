# School management system guide

This release extends the existing Jeffersons Preschool portal (Next.js, Prisma, MongoDB Atlas) into a full preschool management system for Day Care, Playgroup, PP1 and PP2. Existing admissions, invoices, payments, report cards and enquiries keep working and keep their data.

## First-time setup

1. `pnpm install`
2. Copy the new settings from `.env.example` into `.env` (M-PESA, SMS, WhatsApp, `PICKUP_ID_SECRET`). Set `PICKUP_ID_SECRET` to a long random value **before** anyone adds a collector, and never change it.
3. `pnpm db:indexes` – adds the indexes for the new collections. Existing data and indexes are untouched.
4. `pnpm dev`, sign in as an administrator and work through:
   - **School settings** (`/admin/settings`): school details, county (Kajiado), current year and term, term dates, parent alert preferences.
   - **User accounts** (`/admin/users`): create headteacher, teacher, caregiver and bursar accounts. Deactivate leavers here; deactivated users are signed out on their next request.
   - **Teachers & staff** (`/admin/teachers`): TSC numbers, qualifications, good-conduct and medical certificate expiry dates.
   - **Classes** (`/admin/classes`): create classes for the year, assign teachers and caregivers, allocate learners.
   - **Fees** (`/admin/fees`): save a fee structure per level and term, then “Generate invoices” to bill every admitted or active learner in that level.
   - **Timetable** and **Meals**: enter the daily schedule and the weekly menu.
   - **Licensing & compliance** (`/admin/compliance`): record the county childcare licence, business permit, public health and fire certificates.
5. Run `pnpm worker` as a separate supervised process (it replaces `pnpm mail:worker`, which still works for email only). It sends enquiry emails and the SMS / email / WhatsApp outbox.

## The 20 modules

| # | Module | Where | Who |
|---|---|---|---|
| 1 | Dashboard | `/admin/dashboard` | All staff (each sees their own areas) |
| 2 | Student registration | Admissions (existing) + `/admin/students` | Admin, headteacher |
| 3 | Class management | `/admin/classes` | Headteacher, admin |
| 4 | Parent management | Parent accounts, guardian and emergency contacts on the learner record, `/admin/users?role=parent` | Admin |
| 5 | Attendance | `/admin/attendance` | Teachers, caregivers |
| 6 | Child pickup | `/admin/pickup`, parents at `/parent/pickups` | Classroom staff; leaders approve |
| 7 | Fee management | `/admin/fees`, `/admin/payments` | Bursar, admin |
| 8 | M-PESA | Parent payments page; bursar review on payments page | Parents, bursar |
| 9 | Teacher management | `/admin/teachers` | Headteacher, admin |
| 10 | Daycare management | `/admin/daycare`; parents at `/parent/daily` | Caregivers |
| 11 | Learning management | `/admin/learning` | Teachers |
| 12 | Assessment | `/admin/assessment` | Teachers |
| 13 | Report cards | `/admin/reports` | Teachers draft; headteacher/admin publish |
| 14 | Communication | `/admin/communication`; parents at `/parent/messages` | Leaders; teachers for their class level |
| 15 | Meals | `/admin/meals` | Caregivers, teachers |
| 16 | Health | `/admin/health`; parents at `/parent/health` | Classroom staff |
| 17 | Timetable | `/admin/timetable`, `/parent/timetable` | Leaders edit |
| 18 | Reports | `/admin/analytics` (print to PDF, CSV downloads for Excel) | Admin, headteacher, bursar |
| 19 | User management | `/admin/users` (role/permission table included) | Admin |
| 20 | School settings | `/admin/settings` | Admin |

The full role → module permission table lives in `src/lib/permissions.ts` and is shown on the User accounts page.

## Child safety rules built in

- A learner can only be checked out through **Child pickup**, never from the attendance screen.
- Collectors must be on the child’s approved list. Parents can request additions; the headteacher or administrator approves them after phoning the parent.
- Staff type the ID number shown by the collector. Only a keyed hash and the last four digits are stored. A mismatch refuses the release, records the attempt and alerts the parent.
- Only the headteacher or administrator can authorise an exception, and must record how the parent confirmed.
- Parents are alerted on absence, collection, medication and incidents (configurable). Safeguarding concerns are never sent to parents automatically; they go to the headteacher.
- Medication can only be recorded with written parent consent.

## M-PESA (Daraja STK Push)

1. Apply for Lipa na M-PESA Online on your paybill or till at the Safaricom Daraja portal and create an app to get the consumer key, secret and passkey.
2. Set `PAYMENT_MODE=mpesa`, the `DARAJA_*` values, and `DARAJA_CALLBACK_BASE_URL` to the public HTTPS address of the portal.
3. Rehearse with `DARAJA_ENV=sandbox`: sandbox payments are stored with status “Sandbox” and never change balances.
4. Switch to `DARAJA_ENV=production` after Safaricom approves go-live.

When Safaricom confirms a payment, the portal records it as **Paid** against the invoice using the M-PESA receipt number (each receipt can only be used once) and texts the parent. If Safaricom confirms payment but the amount differs or the receipt never arrives, the request appears as **Needs review** on the bursar’s payments page to match against the M-PESA statement. Parents can still record bank and cash payments for manual verification as before. The existing sandbox test panel is unchanged.

## SMS, email and WhatsApp

- SMS: Africa’s Talking (`AT_USERNAME`, `AT_API_KEY`, optional approved `AT_SENDER_ID`). Use `AT_USERNAME=sandbox` for testing.
- Email: the existing Resend settings.
- WhatsApp: Meta WhatsApp Cloud API (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`). Messages to parents who have not written to you in the last 24 hours need an approved template; plain text works inside the window.
- `PARENT_ALERT_CHANNELS` chooses channels for automatic alerts. Messages are queued and retried by `pnpm worker`.

## CBC and assessment

- PP1 and PP2 report cards use the five CBC pre-primary learning areas and the EE / ME / AE / BE rubric. Day Care and Playgroup keep the school’s developmental areas.
- Teachers record strand-level assessments for a whole class at once. Report card forms show the term’s assessments and suggest attendance from the register when term dates are set.
- Suggested strands are in `src/lib/cbc.ts`. Check them against the current KICD curriculum designs each year; teachers can also type their own strand.

## Data protection and records

- Parents give or withdraw consent per child (`/parent/health`): data processing under the Data Protection Act 2019, emergency treatment, photos, outings and medication. Every change is kept with its date.
- The compliance page lists gaps in children’s records (emergency contact, immunisation, birth certificate number, approved collector, consent) and staff certificates, and prints as an inspection pack.
- `pnpm db:backup [folder]` exports every collection to dated JSON files. They contain personal data: encrypt them and keep a copy off-site. Keep MongoDB Atlas continuous backups switched on as the main recovery method.

## Limits and follow-ups

- Lists cap at a few hundred rows; add pagination as the school grows.
- CSV downloads open directly in Excel. PDF output is by “Print or save PDF” in the browser.
- The private document download route (`src/app/[role]/students/[id]/documents/[filename]/route.ts`) was not changed. If headteachers or caregivers need to open admission documents, add their roles there.
- After deploying, test each workflow once with real staff accounts and a small M-PESA payment before relying on it.
