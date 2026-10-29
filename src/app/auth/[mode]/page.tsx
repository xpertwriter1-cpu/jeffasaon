import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { signIn, register } from '@/actions/auth';
import { roles } from '@/lib/school';
export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ mode: string }>;
  searchParams: Promise<{ programme?: string }>;
}) {
  const { mode } = await params;
  const { programme = '' } = await searchParams;
  if (!['login', 'register'].includes(mode)) notFound();
  const registering = mode === 'register';
  return (
    <div className="container page narrow">
      <div className="page-title">
        <span className="eyebrow">Your school portal</span>
        <h1>{registering ? 'Create a parent account' : 'Welcome back'}</h1>
        <p>
          {registering
            ? 'Keep your child’s application, fee records and reports in one place.'
            : 'Sign in using the role assigned to your account.'}
        </p>
      </div>
      <ActionForm
        action={registering ? register : signIn}
        label={registering ? 'Create account' : 'Sign in'}
      >
        <Hidden name="programme" value={programme} />
        {registering ? (
          <>
            <Field name="name" label="Full name" required />
            <Field name="phone" label="Phone number" type="tel" required maxLength={30} />
          </>
        ) : (
          <Field name="role" label="Account type" defaultValue="parent" required>
            {roles.map((role) => (
              <option value={role} key={role}>
                {role[0].toUpperCase() + role.slice(1)}
              </option>
            ))}
          </Field>
        )}
        <Field name="email" label="Email address" type="email" required maxLength={254} />
        <Field
          name="password"
          label="Password (8-72 bytes)"
          type="password"
          required
          maxLength={72}
        />
      </ActionForm>
      <div className="auth-links">
        <Link
          href={
            (registering ? '/auth/login' : '/auth/register') +
            (programme ? '?programme=' + encodeURIComponent(programme) : '')
          }
        >
          {registering
            ? 'Already have an account? Sign in'
            : 'New parent? Create an account'}
        </Link>
        <Link href="/">Back to home</Link>
      </div>
      <p className="small-text muted">
        Staff accounts are created by the school administrator.
      </p>
    </div>
  );
}
