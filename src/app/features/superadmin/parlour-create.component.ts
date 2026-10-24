import { Component, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { PlatformApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { FeatureDef, PlatformParlour } from '../../core/models';
import { generatePassword } from '../../core/password';
import { ToastService } from '../../core/toast.service';
import { FeatureTogglesComponent } from '../../shared/feature-toggles.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';

/** Creates a parlour together with its first admin. Afterwards it shows the sign-in details once, ready to copy. */
@Component({
  selector: 'app-parlour-create',
  imports: [ReactiveFormsModule, ModalComponent, FeatureTogglesComponent, IconComponent],
  template: `
    <app-modal [title]="done() ? 'Parlour created' : 'New parlour'" [wide]="true" (closed)="cancelled.emit()">
      @if (done(); as p) {
        <div class="stack">
          <p><strong>{{ p.name }}</strong> is ready. Send these sign-in details to the owner. The password is not shown again.</p>
          <dl class="creds">
            <div><dt>Sign in with</dt><dd>{{ p.owner?.email }}</dd></div>
            <div><dt>Password</dt><dd class="num">{{ shownPassword() }}</dd></div>
          </dl>
          <div><button type="button" class="btn btn-secondary" (click)="copy()"><app-icon name="copy" [size]="16" /> Copy details</button></div>
        </div>
      } @else {
        <form id="parlour-form" [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
          @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }
          <div class="field" [class.invalid]="err('parlourName')">
            <label class="label" for="pc-parlour">Parlour name</label>
            <input id="pc-parlour" class="input" formControlName="parlourName" autocomplete="off" />
            @if (err('parlourName'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="form-grid">
            <div class="field" [class.invalid]="err('adminName')">
              <label class="label" for="pc-name">Admin name</label>
              <input id="pc-name" class="input" formControlName="adminName" autocomplete="off" />
              @if (err('adminName'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
            <div class="field" [class.invalid]="err('email')">
              <label class="label" for="pc-email">Admin email (their sign-in)</label>
              <input id="pc-email" class="input" type="email" formControlName="email" autocomplete="off" />
              @if (err('email'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
          </div>
          <div class="field" [class.invalid]="err('password')">
            <label class="label" for="pc-pass">Temporary password</label>
            <div class="row">
              <input id="pc-pass" class="input grow" type="text" formControlName="password" autocomplete="off" spellcheck="false" />
              <button type="button" class="btn btn-secondary" (click)="generate()"><app-icon name="key" [size]="16" /> Generate</button>
            </div>
            @if (err('password'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">At least 8 characters with a letter and a number. They can change it from their Account page.</span> }
          </div>
          <details class="access">
            <summary>Pages and buttons <span class="muted">({{ offCount() ? offCount() + ' switched off' : 'all on' }})</span></summary>
            <div class="access-body"><app-feature-toggles [defs]="defs()" [(values)]="features" /></div>
          </details>
        </form>
      }
      <ng-container modal-foot>
        @if (done(); as p) {
          <button type="button" class="btn btn-secondary" (click)="cancelled.emit()">Close</button>
          <button type="button" class="btn btn-primary" (click)="created.emit(p)">Open this parlour</button>
        } @else {
          <button type="button" class="btn btn-secondary" (click)="cancelled.emit()">Cancel</button>
          <button type="submit" form="parlour-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Creating…' : 'Create parlour' }}</button>
        }
      </ng-container>
    </app-modal>`,
  styles: [`
    .creds { margin: 0; padding: 14px 16px; background: var(--sunken); border: 1px solid var(--line); border-radius: 10px; display: grid; gap: 8px; div { display: flex; justify-content: space-between; gap: 16px; } dt { color: var(--muted); } dd { margin: 0; font-weight: 600; word-break: break-all; text-align: right; } }
    .access { border: 1px solid var(--line); border-radius: 10px; }
    .access summary { cursor: pointer; padding: 12px 14px; font-weight: 600; }
    .access-body { padding: 4px 16px 14px; border-top: 1px solid var(--line); }
  `],
})
export class ParlourCreateComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(PlatformApi);
  private readonly toast = inject(ToastService);

  readonly defs = input.required<FeatureDef[]>();
  readonly created = output<PlatformParlour>();
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal<PlatformParlour | null>(null);
  protected readonly shownPassword = signal('');
  protected readonly features = signal<Record<string, boolean>>({});

  protected readonly form = this.fb.group({
    parlourName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    adminName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    password: [generatePassword(), [Validators.required, Validators.minLength(8), Validators.maxLength(72), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
  });

  protected offCount() { return Object.values(this.features()).filter((v) => v === false).length; }
  protected err(name: string) {
    return controlError(this.form.get(name), { required: 'Required', pattern: 'Include at least one letter and one number' });
  }
  protected generate() { this.form.controls.password.setValue(generatePassword()); }

  protected save() {
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.form.getRawValue();
    this.api.create({ parlourName: v.parlourName.trim(), adminName: v.adminName.trim(), email: v.email.trim(), password: v.password, features: this.features() }).subscribe({
      next: (p) => { this.busy.set(false); this.shownPassword.set(v.password); this.done.set(p); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (info.code === 'EMAIL_TAKEN') { this.form.controls.email.setErrors({ server: info.message }); this.form.controls.email.markAsTouched(); }
        else if (!applyFieldErrors(this.form, info)) this.error.set(info.message);
      },
    });
  }

  protected async copy() {
    const p = this.done();
    try {
      await navigator.clipboard.writeText(`${p?.name}\nSign in: ${p?.owner?.email}\nPassword: ${this.shownPassword()}`);
      this.toast.success('Sign-in details copied');
    } catch {
      this.toast.error('Could not copy. Select the text and copy it by hand.');
    }
  }
}
