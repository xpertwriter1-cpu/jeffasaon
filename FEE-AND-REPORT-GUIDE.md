> Migration note: the application now runs on Next.js, TypeScript, Prisma and pnpm. Follow README.md for current commands. Express/EJS file references below describe the previous implementation. The school workflow remains applicable.

# Fees and student reports

Restart the app from this project folder with `npm.cmd run dev`. Open the address printed in the terminal, then sign in.

## Fee workflow

Admission comes before fee payment: the parent accepts enrolment and an admin approves the child as Admitted. After payment is verified, the admin can mark the child Active. See [the admission guide](ADMISSION-GUIDE.md).

1. An admin or bursar opens **Term fee invoices** on the staff dashboard.
2. Select a student, year and term. Enter the school's actual tuition, meals, transport and other charges. Create the invoice. There is one invoice per student, year and term.
3. The parent opens **Fee balances**, pays using the school's official payment instructions, and opens **Payments and receipts** to record the amount and transaction reference against the correct invoice.
4. The admin or bursar opens **Payment verification**, checks the school's actual M-Pesa/bank/cash records, selects **Paid**, ticks the receipt-confirmation box and saves.
5. The verified payment reduces the invoice balance. Parents and finance staff can print the receipt or a student's fee statement, or choose **Save as PDF** in the browser print dialog.

Partial payments are supported. Pending, failed and refunded payments do not reduce the balance. An overpayment appears as a credit on its invoice; it is not automatically transferred to another term. M-Pesa and bank references are required and normalized to uppercase. A transaction reference cannot be reused within the same payment method.

Older student-linked payments remain visible in payment history. Older payments without an invoice do not reduce term balances. Older payments without a student are visible only in the staff register; there is no automatic assignment based on parent names. If historical fees need reconciliation, review and assign them in a separate migration rather than submitting the same payment twice.

The manual form records payments already made. A separate M-Pesa sandbox panel can initiate test prompts and verify test statuses; see [the sandbox setup guide](MPESA-SANDBOX-GUIDE.md). Sandbox tests do not reduce real balances or issue receipts. Supply the school's official payment instructions for actual fees.

## Report workflow

1. An admin creates teacher accounts through **Staff accounts**.
2. A teacher opens **Student report forms** and **Create report**.
3. Select the student, year and term. Complete the five learning-area ratings, attendance totals and comments, then save the draft.
4. Teachers can edit their own drafts. Admins can edit any draft and review its print preview.
5. An admin selects **Approve and publish**. Parents can then open **Student reports** to view or print reports for their own children.
6. For a correction, the admin chooses **Return to draft**. The report is hidden from parents while it is edited and must be published again.

Reports cover language, numeracy, creativity, physical development and social skills. Attendance is a term total entered by the teacher; this is not a daily attendance register. One report is allowed per student, year and term. The class is captured when the report is saved.

## Roles and validation

- Admin: invoices, payment verification, report drafting and publication, staff accounts.
- Bursar: invoices, balances, payment verification, receipts and statements; no student reports.
- Teacher: report drafts and previews; no payment register or fee invoices.
- Parent: invoices, payments and published reports for children associated with their account email.

The new records forms use session CSRF tokens. Amounts, references, attendance and rating values are validated on the server. Database uniqueness indexes prevent duplicate term invoices, term reports and payment references. The rest of the starter still requires the production hardening described in README.md.

## Checks

Run `npm.cmd test`. The tests use sample data and mocked database operations; they do not write test children, payments or reports to your Atlas database. They cover balance calculations, validation, form rendering, CSRF, ownership and role restrictions, and draft publication. Live payment processing is not included.
