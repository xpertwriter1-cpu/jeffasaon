> Migration note: the application now runs on Next.js, TypeScript, Prisma and pnpm. Follow README.md for current commands. Express/EJS file references below describe the previous implementation. The school workflow remains applicable.

# Child admission records

Restart the application with `npm.cmd run dev`. A parent signs in, chooses **Apply for admission**, completes the form and submits it for school review.

## Details captured

- Child names, date of birth, gender, nationality, birth certificate number, home language and address.
- Requested programme and admission date, previous school/class and learning information.
- Primary guardian name, relationship, phone, alternative phone and occupation; optional second guardian details.
- Emergency contact name, relationship and phone.
- An additional authorised collector, collection instructions and transport arrangements.
- Allergies, dietary needs, medical conditions, medication instructions, support needs, doctor/clinic details and immunisation notes.
- Parent/guardian declaration and submission date.

Names, date of birth, home address, programme, primary guardian details and emergency contact details are required. Other information and supporting documents are optional. The linked parent account always comes from the signed-in user, rather than a name or email entered in the form.

## Documents

Each application accepts one birth certificate, one clinic/immunisation card, one previous school report and one child photo. Documents accept PDF, JPG and PNG. The child photo accepts JPG and PNG. Each file is limited to 5 MB. The server checks file signatures and creates random filenames.

Uploads are stored in `private-uploads/admissions/`, outside the public website directory. The database stores metadata and the association with the student. Keep this directory with your deployment and include it in backups alongside MongoDB; the database alone does not contain the uploaded files. The upload directory is excluded from Git.

Parents can access only records linked to their account email. Admins and teachers can view full admission records and download documents; bursars cannot access these full records. Downloads use authenticated routes and are sent as attachments, not public URLs. Do not move uploads into `src/public`.

## Review

- Parents open the child's name in **Your children** on the parent dashboard.
- Admins and teachers open the child's name in **Student register**.
- Admins use **Admission approvals** on the dashboard to approve eligible pending applications. The register handles later activation, graduation and withdrawal.
- The child record can be printed or saved as PDF through the browser print dialog. Documents download separately.

Earlier student records remain viewable, with missing new fields shown as **Not provided**. This update adds admission submission and viewing; editing submitted records or adding documents to earlier applications is not included.

## Parent agreement and admin approval

1. A submitted child record starts **Pending** and receives an automatic admission number. A number does not mean school approval.
2. On the child's record, the parent reads the enrolment agreement, checks the agreement box, and clicks **Agree and request school approval**. The system records the parent identity, agreement version and acceptance time. The earlier registration declaration does not count as enrolment acceptance.
3. The admin opens **Admission approvals** (`/admin/admissions`), reviews the child details, confirms the school can admit the child, and clicks **Approve admission**. Parent acceptance is required; payment does not replace it. Only admins may approve. Documents remain optional.
4. Approval changes **Pending ? Admitted** and records the admin, time and acceptance basis. The admin/bursar then creates the fee invoice under **Term fee invoices**. Parents see **Next step: fee payment** on the child record with a link to fees.
5. The parent pays and submits the payment against the invoice. Payment submission and sandbox test requests are blocked until the child is Admitted or Active. The bursar checks receipt of the actual money and marks the payment Paid.
6. The admin may now change **Admitted ? Active** in the student register. Activation requires a positive payment linked to the child and an invoice, a verification timestamp, status Paid, and a payment creation time on or after admission approval. Pending, refunded, failed and sandbox payments do not qualify. Any positive partial payment qualifies; no minimum deposit is configured. The system records who activated the child, when, and the qualifying payment ID.
7. Later the admin may mark an active child Graduated or Withdrawn. Pending or admitted children can be Withdrawn. Graduated and withdrawn records cannot be reopened through this workflow.

The register cannot bypass school approval or the payment requirement. Approval and status changes use CSRF protection and conditional database updates. Repeat parent agreement submissions preserve original acceptance. No email/SMS notification is sent; progress appears in the portal.

Existing pending children can use this workflow immediately. Existing admitted and active children retain their status; historical approval or agreement evidence is not fabricated. For an earlier Admitted record with no approval timestamp, an existing verified invoice payment may qualify for activation. No existing child is automatically approved during installation.

## Validation and checks

The form checks required fields, date validity, phone numbers, field lengths, allowed programmes, declarations and session CSRF tokens. If validation fails, entered text remains available; file selections must be made again. Newly saved files are removed if database persistence fails.

Run `npm.cmd test`. Admission tests use sample records and temporary upload files, with database writes mocked; test files are removed afterwards. They cover submissions, upload types and limits, cleanup after failed persistence, legacy records and access restrictions.
