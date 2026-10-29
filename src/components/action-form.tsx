'use client';
import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { FormState } from '@/lib/forms';
export function ActionForm({
  action,
  children,
  label = 'Save',
  className = 'form-card',
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.error || !state.values) return;
    for (const [name, value] of Object.entries(state.values)) {
      const input = form.current?.elements.namedItem(name);
      if (
        input instanceof HTMLInputElement &&
        input.type !== 'file' &&
        input.type !== 'checkbox'
      )
        input.value = value;
      if (input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)
        input.value = value;
    }
  }, [state]);
  return (
    <form ref={form} action={submit} className={className}>
      <div aria-live="polite">
        {state.error && (
          <p className="notice error" role="alert">
            {state.error}
          </p>
        )}
        {state.success && <p className="notice success">{state.success}</p>}
      </div>
      <fieldset disabled={pending}>
        {children}
        <button className="button" type="submit">
          {pending ? 'Please wait...' : label}
        </button>
      </fieldset>
    </form>
  );
}
