# Security and migration review

The active application now uses Next.js 16.4.3, React 19, strict TypeScript, Prisma 6.19.3 for MongoDB and pnpm. The previous Express dependency audit is historical; its runtime is inactive.

## Current controls

- Server actions use Next.js same-origin protection. Every protected action verifies the current account and its role on the server.
- Encrypted, HTTP-only, SameSite=Lax cookies expire after eight hours. Production requires a strong SESSION_SECRET and secure cookies. User roles are read from MongoDB, rather than trusted from a browser-submitted role.
- Zod validates authentication, account, money, report and enquiry fields. Admission validation also checks dates, phone numbers, allowed programmes, declarations, input lengths and guardian details. TypeScript alone does not validate outside input.
- Prisma maps to existing collections and ObjectIds. Parent-owned records and document downloads are scoped by the signed-in parent's email. Existing password hashes remain usable.
- Authentication, public enquiries and admission submissions have MongoDB-backed request limits. Forwarded IP headers are trusted only when TRUST_PROXY=1 is explicitly configured behind a trusted proxy. Without that setting, anonymous callers share an origin bucket.
- A nonce-based Content Security Policy permits Next.js scripts while blocking arbitrary inline scripts, objects and frames. Responses include nosniff, referrer and permissions policies. Authenticated routes use private/no-store caching.
- Documents are checked by file signatures, limited to 5 MB each, stored privately and served as attachments after authorisation.
- Student activation requires a verified, invoiced payment made after admission. Approval records parent agreement and reviewer evidence. Concurrent approval and activation changes are guarded in transactions. Unique payment references and per-term indexes remain in place.
- Report drafts are restricted to their teacher or an admin. Parents only see published reports. Only admins can publish or unpublish.
- Email jobs use atomic leases, provider idempotency keys and bounded retry periods. Run the separate supervised worker with pnpm mail:worker.
- M-Pesa remains sandbox-only. Callbacks use a secret token and provider reconciliation; they cannot mark real fees paid.
- Administrator seeding requires a supplied password and does not print it. Existing accounts and passwords are unchanged.

## Database work performed

Prisma connected successfully to the configured Atlas database. Read-only sample queries succeeded for users, students, invoices, payments, reports, enquiries, sandbox attempts and admission counters. Missing required indexes were created, including TTL cleanup for the new request-limit collection. No collections or indexes were dropped. No student, payment, staff-account or enquiry records were created or modified during validation. No email or M-Pesa request was sent.

Prisma db push was not used because the existing database has sparse unique indexes that need to be retained. Use the explicit db:indexes command for reviewed, additive index creation.

## Verification

- Production build and strict type checking pass.
- The current TypeScript test suite covers admission validation, impossible dates, duplicate form values, password byte limits, ObjectId injection, money parsing, verified balances, status transitions, file signatures and sandbox formatting.
- Headless Chrome checks cover 360, 768, 1024 and 1440-pixel widths, locally served images, horizontal overflow, section scrolling, mobile menu behaviour, anonymous portal guards, preserved programme selection, legacy redirects and CSP/hydration errors.
- The pnpm production dependency audit reports no known vulnerabilities.

This is a source and dependency review, not an exhaustive penetration test. Signed-in write workflows were not exercised against the school's live records. Email and payment-provider integration tests were not run against real services. Deploy with HTTPS, a persistent private upload volume, a supervised email worker and reviewed Atlas access settings. Email verification and password recovery remain future features.

## Legacy implementation

A local copy exists in legacy/. Automatic approval review rejected deleting the old Express implementation, so the original files remain inactive in place as well. TypeScript compilation excludes JavaScript, current commands run Next.js, and active imports point to the new TypeScript modules. The old npm lockfile is not used by pnpm.
