import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { controlError, parseError } from '../../core/errors';
import { IconComponent } from '../../shared/icon.component';
import { AuthFrameComponent } from './auth-frame.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, IconComponent, AuthFrameComponent],
  template: `
    <app-auth-frame>
      <h1>Sign in</h1>
      <p class="muted lede">Welcome back. Enter your details to open your counter.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
        @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }

        <div class="field" [class.invalid]="err('email')">
          <label class="label" for="email">Email</label>
          <input id="email" class="input" type="email" formControlName="email" autocomplete="username" inputmode="email" />
          @if (err('email'); as m) { <span class="field-error">{{ m }}</span> }
        </div>

        <div class="field" [class.invalid]="err('password')">
          <label class="label" for="password">Password</label>
          <div class="input-affix">
            <input id="password" class="input" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
            <button type="button" class="affix-btn" [attr.aria-label]="show() ? 'Hide password' : 'Show password'" (click)="show.set(!show())">
              <app-icon [name]="show() ? 'eye-off' : 'eye'" />
            </button>
          </div>
          @if (err('password'); as m) { <span class="field-error">{{ m }}</span> }
        </div>

        <button class="btn btn-primary btn-lg btn-block" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
      </form>

      <p class="alt muted">Need access? Contact the team that set up your parlour.</p>
    </app-auth-frame>`,
  styles: [`.lede { margin: 6px 0 24px; } .alt { margin-top: 24px; text-align: center; }`],
})
export class LoginComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly show = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected err(name: string) { return controlError(this.form.get(name), { required: name === 'email' ? 'Enter your email' : 'Enter your password' }); }

  protected submit() {
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim(), password).subscribe({
      next: () => void this.router.navigateByUrl(this.destination()),
      error: (e) => { this.busy.set(false); this.error.set(parseError(e).message); },
    });
  }

  /** Go back to where they were headed, but only inside their own area and never to another site. */
  private destination(): string {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');
    const base = this.auth.basePath();
    return target && target.startsWith(base + '/') && !target.startsWith('//') ? target : this.auth.homePath();
  }
}
