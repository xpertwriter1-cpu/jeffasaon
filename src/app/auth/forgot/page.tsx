import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { Field } from '@/components/fields';
import { requestReset } from '@/actions/password';
export default function ForgotPasswordPage() {
  return (
    <div className="container page narrow">
      <div className="page-title">
        <span className="eyebrow">Your school portal</span>
        <h1>Forgot your password?</h1>
        <p>
          Enter the email you sign in with. We will send you a link to choose a new
          password.
        </p>
      </div>
      <ActionForm action={requestReset} label="Send reset link">
        <Field name="email" label="Email address" type="email" required maxLength={254} />
      </ActionForm>
      <div className="auth-links">
        <Link href="/auth/login">Back to sign in</Link>
      </div>
      <p className="small-text muted">
        Works for parents and staff. The link expires after 30 minutes.
      </p>
    </div>
  );
}
