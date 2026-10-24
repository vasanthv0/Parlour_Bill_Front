import { Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { ToastService } from '../../core/toast.service';

const matches = (c: AbstractControl): ValidationErrors | null => (c.get('newPassword')?.value === c.get('confirm')?.value ? null : { mismatch: true });

@Component({
  selector: 'app-account',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page narrow">
      <div class="page-head"><div><h1>Account</h1><p class="sub">Your sign-in details.</p></div></div>

      <section class="panel" style="margin-bottom: 24px">
        <div class="panel-body form-grid">
          <div><div class="muted small">Name</div><div>{{ auth.user()?.name }}</div></div>
          <div><div class="muted small">Email</div><div>{{ auth.user()?.email }}</div></div>
          <div><div class="muted small">Role</div><div>{{ auth.role() === 'super_admin' ? 'Platform admin' : auth.role() === 'admin' ? 'Admin' : 'Staff' }}</div></div>
          @if (auth.user()?.parlourName) { <div><div class="muted small">Parlour</div><div>{{ auth.user()?.parlourName }}</div></div> }
        </div>
      </section>

      <form class="panel" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="panel-head"><h2>Change password</h2></div>
        <div class="panel-body stack">
          <p class="muted">Changing your password signs you out on all other devices.</p>
          @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }
          <div class="field" [class.invalid]="err('currentPassword')"><label class="label" for="cur">Current password</label><input id="cur" class="input" type="password" formControlName="currentPassword" autocomplete="current-password" />@if (err('currentPassword'); as m) { <span class="field-error">{{ m }}</span> }</div>
          <div class="field" [class.invalid]="err('newPassword')"><label class="label" for="new">New password</label><input id="new" class="input" type="password" formControlName="newPassword" autocomplete="new-password" />@if (err('newPassword'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">At least 8 characters, with a letter and a number.</span> }</div>
          <div class="field" [class.invalid]="form.touched && form.errors?.['mismatch']"><label class="label" for="conf">Confirm new password</label><input id="conf" class="input" type="password" formControlName="confirm" autocomplete="new-password" />@if (form.get('confirm')?.touched && form.errors?.['mismatch']) { <span class="field-error">Passwords do not match</span> }</div>
        </div>
        <div class="panel-head" style="border-top: 1px solid var(--line); border-bottom: 0; justify-content: flex-end">
          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Updating…' : 'Update password' }}</button>
        </div>
      </form>
    </div>`,
  styles: [`.narrow { max-width: 640px; }`],
})
export class AccountComponent {
  protected readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
      confirm: ['', Validators.required],
    },
    { validators: matches },
  );

  protected err(name: string) {
    return controlError(this.form.get(name), { required: name === 'currentPassword' ? 'Enter your current password' : 'Required', pattern: 'Include at least one letter and one number' });
  }

  protected save() {
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: () => { this.busy.set(false); this.form.reset(); this.toast.success('Password updated. Other devices were signed out.'); },
      error: (e) => { this.busy.set(false); const info = parseError(e); if (!applyFieldErrors(this.form, info)) this.error.set(info.message); },
    });
  }
}
