import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { errorMessage, strings } from './validation';
export interface FormState {
  error?: string;
  success?: string;
  values?: Record<string, string>;
}
export async function runForm(
  form: FormData,
  work: () => Promise<string | { success: string }>,
): Promise<FormState> {
  let result: string | { success: string };
  try {
    result = await work();
  } catch (error) {
    let values: Record<string, string> = {};
    try {
      values = strings(form);
      delete values.password;
    } catch {}
    return { error: errorMessage(error), values };
  }
  revalidatePath('/', 'layout');
  if (typeof result === 'string') redirect(result);
  return result;
}
