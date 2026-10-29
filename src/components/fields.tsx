import type { ReactNode } from 'react';
export function Field({
  name,
  label,
  type = 'text',
  required = false,
  defaultValue,
  maxLength,
  min,
  max,
  step,
  children,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  step?: string;
  children?: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      {children ? (
        <select name={name} required={required} defaultValue={defaultValue ?? ''}>
          {children}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          name={name}
          rows={4}
          required={required}
          maxLength={maxLength ?? 3000}
          defaultValue={defaultValue}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue}
          maxLength={maxLength ?? 200}
          min={min}
          max={max}
          step={step}
        />
      )}
    </label>
  );
}
export function Check({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" name={name} value="yes" required />
      <span>{children}</span>
    </label>
  );
}
export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
