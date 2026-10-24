import { HttpErrorResponse } from '@angular/common/http';
import { AbstractControl, FormGroup } from '@angular/forms';

export interface ApiError {
  message: string;
  code?: string;
  fields: Record<string, string>;
}

/** Turns any HTTP failure into a message a person can act on, plus per-field errors when the API sends them. */
export function parseError(err: unknown): ApiError {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return { message: 'Cannot reach the server. Check your connection and try again.', fields: {} };
    }
    const body = err.error?.error;
    if (body?.message) {
      return { message: body.message, code: body.code, fields: body.details ?? {} };
    }
  }
  return { message: 'Something went wrong. Please try again.', fields: {} };
}

/** Puts server-side field errors onto the matching form controls. Returns true if any control was matched. */
export function applyFieldErrors(form: FormGroup, info: ApiError): boolean {
  let matched = false;
  for (const [name, message] of Object.entries(info.fields)) {
    const control: AbstractControl | null = form.get(name);
    if (control) {
      control.setErrors({ server: message });
      control.markAsTouched();
      matched = true;
    }
  }
  return matched;
}

/** First error message for a control, or null. Use after the control is touched or the form submitted. */
export function controlError(control: AbstractControl | null, labels: Record<string, string> = {}): string | null {
  if (!control || !control.errors || !(control.touched || control.dirty)) return null;
  const e = control.errors;
  if (e['server']) return e['server'];
  if (e['required']) return labels['required'] ?? 'This field is required';
  if (e['email']) return 'Enter a valid email address';
  if (e['minlength']) return `Use at least ${e['minlength'].requiredLength} characters`;
  if (e['maxlength']) return `Use ${e['maxlength'].requiredLength} characters or fewer`;
  if (e['min']) return `Must be at least ${e['min'].min}`;
  if (e['max']) return `Must be ${e['max'].max} or less`;
  if (e['pattern']) return labels['pattern'] ?? 'Check the format';
  if (e['mismatch']) return 'Passwords do not match';
  return 'Check this field';
}
