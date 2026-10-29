# Jeffersons Preschool

A Next.js App Router application for the school website and parent/staff portals.

## Stack

- Next.js 16.4.3 and React 19
- TypeScript in strict mode, with Zod validation for submitted data
- Prisma 6.19.3 connected to the existing MongoDB Atlas database
- pnpm for dependency installation and project commands
- Encrypted, HTTP-only session cookies, server-side role/ownership checks, request throttling and a nonce-based Content Security Policy

Prisma 6 is intentional: Prisma's stable MongoDB guidance still recommends this release line. Prisma 8 was a release candidate when this migration was made.

## Run locally

Use Node 20.9 or later and the pnpm version declared in package.json.

```powershell
pnpm install
pnpm db:check
pnpm dev
```

Open http://localhost:3000. The existing `.env` contains the MongoDB connection. For a fresh checkout, copy `.env.example` to `.env` and supply your own credentials and a random SESSION_SECRET of at least 32 characters.

```powershell
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
pnpm start
```

## Database

The Prisma schema maps to the existing `users`, `students`, `invoices`, `payments`, `reports`, `enquiries`, `mpesasandboxattempts` and `admissioncounters` collections. ObjectIds, document metadata, parent ownership, password hashes, payment verification and admission counters retain their existing formats.

- `pnpm db:check` tests connectivity with a read-only ping.
- `pnpm db:verify` reads one sample from each collection without printing record contents or changing records.
- `pnpm db:indexes` creates missing indexes without dropping collections, data or existing indexes. It also adds an expiring request-limit collection.
- Do not run `prisma migrate` for MongoDB. Do not use `prisma db push` on this existing database without reviewing its effect on legacy sparse unique indexes. The explicit index script preserves those indexes.

## School workflows

The public site is one scrolling page: `/#home`, `/#about`, `/#programs`, `/#admissions` and `/#contact`. Old public page URLs redirect to their matching sections.

Parents use `/auth/register`, `/auth/login`, `/parent/dashboard`, `/parent/admission`, `/parent/fees`, `/parent/payments` and `/parent/reports`. Programme selection is carried through sign-in and registration. Existing accounts continue to use their stored passwords; the session cookie changes, so users must sign in again.

Staff use `/admin/dashboard`, `/admin/students`, `/admin/admissions`, `/admin/fees`, `/admin/payments`, `/admin/reports`, `/admin/enquiries` and `/admin/users`. Each page and server action checks its permitted roles. Parents can only view their own child records, documents, invoices, payments and published reports.

Admission proceeds from application to parent acceptance, admin approval, invoicing, verified fees, and activation. Payment claims do not change balances until verified. Sandbox M-Pesa attempts never count as real payments. Teachers prepare reports; only admins publish them. Final student records cannot be reopened through a status update.

Lists currently cap at 500 records; the overview shows the eight most recent staff records or up to 100 parent records. Add pagination when the school reaches these limits.

## Documents

Admissions accept up to four 5 MB PDF, PNG or JPEG documents. Child photos must be PNG or JPEG. Files remain in `private-uploads/admissions`, outside the public directory, and are downloaded through an authorised route. Deploy on a Node server with persistent private storage or adapt this storage layer to a private object store before using ephemeral hosting.

## Email enquiries

Enquiries and queued messages keep their existing embedded structure. Configure EMAIL_PROVIDER=resend, RESEND_API_KEY, EMAIL_FROM and ENQUIRY_NOTIFY_EMAIL, then run this as a separate supervised process:

```powershell
pnpm mail:worker
```

The worker claims jobs atomically, retries provider failures, uses stable idempotency keys, and marks an enquiry contacted only after a reply is accepted. Starting Next.js alone does not start the worker. Existing queued messages are retained. No email was sent during validation.

## First administrator

Existing staff accounts are retained. To create an initial account on an empty installation:

```powershell
$env:SEED_ADMIN_PASSWORD = 'Use-a-unique-password-at-least-12-characters'
pnpm seed admin@your-school-domain.example
```

Passwords are not printed. Existing accounts are left unchanged.

## Deployment

Run `pnpm build` and `pnpm start` over HTTPS. Supply a strong SESSION_SECRET and DATABASE_URL. Set TRUST_PROXY=1 only when the hosting proxy overwrites the forwarded client address. Otherwise anonymous request limits share one origin bucket. Rate limits are stored in MongoDB so they work across Node processes. Configure provider credentials independently; the M-Pesa integration remains sandbox-only.

## Photography

The local photographs show early learning in South Africa and Cameroon. They are representative, not photographs of Jeffersons pupils. Their authors, source links and CC BY-SA 4.0 licences are credited at `/photo-credits` and in `public/images/ATTRIBUTION.md`. Responsive sizing and display crops are disclosed.

## Previous implementation

The old Express/EJS implementation has been copied to `legacy/` for reference. Its original files also remain in place because automatic approval review rejected their removal. They are not used by the Next.js scripts, imports or TypeScript build. The old npm lockfile is also inactive; use pnpm and pnpm-lock.yaml. The active application consists of TypeScript in `src/app`, `src/actions`, `src/components` and the new `.ts` files in `src/lib`. The old JavaScript test suite is retained for reference; `pnpm test` runs the current TypeScript tests.
