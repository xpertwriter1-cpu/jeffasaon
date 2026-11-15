import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { completeReset } from '@/actions/password';
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const value = typeof token === 'string' && /^[a-f\d]{64}$/.test(token) ? token : '';
  return (
    <div className="container page narrow">
      <div className="page-title">
        <span className="eyebrow">Your school portal</span>
        <h1>Choose a new password</h1>
        <p>Use 8 to 72 characters that you do not use anywhere else.</p>
      </div>
      {value ? (
        <ActionForm action={completeReset} label="Save new password">
          <Hidden name="token" value={value} />
          <Field
            name="password"
            label="New password"
            type="password"
            required
            maxLength={72}
          />
          <Field
            name="confirm"
            label="Type it again"
            type="password"
            required
            maxLength={72}
          />
        </ActionForm>
      ) : (
        <p className="notice">This reset link is not valid. Ask for a new one.</p>
      )}
      <div className="auth-links">
        <Link href="/auth/login">Sign in</Link>
        <Link href="/auth/forgot">Send a new link</Link>
      </div>
    </div>
  );
}
