import { Component, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReferrersApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { Referrer } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';

/** Add or edit a referrer. After adding, the generated referral ID is shown so it can be passed on. */
@Component({
  selector: 'app-referrer-form',
  imports: [ReactiveFormsModule, ModalComponent, IconComponent],
  template: `
    <app-modal [title]="referrer() ? 'Edit referrer' : created() ? 'Referrer added' : 'New referrer'" (closed)="cancelled.emit()">
      @if (created(); as c) {
        <div class="stack">
          <p><strong>{{ c.name }}</strong> is registered. This is their referral ID:</p>
          <div class="idbox"><span class="id num">{{ c.code }}</span><button type="button" class="btn btn-secondary btn-sm" (click)="copy(c)"><app-icon name="copy" [size]="16" /> Copy</button></div>
          <p class="muted">Give this ID to {{ c.name }}. When a customer says this ID or their name at billing, {{ c.percent }}% comes off the bill.</p>
        </div>
      } @else {
        <form id="referrer-form" [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
          @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }
          <div class="field" [class.invalid]="err('name')">
            <label class="label" for="r-name">Name</label>
            <input id="r-name" class="input" formControlName="name" autocomplete="off" />
            @if (err('name'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('contact')">
            <label class="label" for="r-contact">Contact number</label>
            <input id="r-contact" class="input" type="tel" inputmode="tel" formControlName="contact" autocomplete="off" />
            @if (err('contact'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('percent')">
            <label class="label" for="r-percent">Referral percentage</label>
            <span class="input-prefix pct"><input id="r-percent" class="input" type="number" step="0.01" min="0.01" max="100" inputmode="decimal" formControlName="percent" /><span class="suffix">%</span></span>
            @if (err('percent'); as m) { <span class="field-error">{{ m }}</span> } @else {
              <span class="hint">Taken off the customer’s bill (on the services total). {{ referrer() ? 'A new percentage applies to future bills only.' : '' }}</span>
            }
          </div>
        </form>
      }
      <ng-container modal-foot>
        @if (created()) {
          <button type="button" class="btn btn-primary" (click)="saved.emit(created()!)">Done</button>
        } @else {
          <button type="button" class="btn btn-secondary" (click)="cancelled.emit()">Cancel</button>
          <button type="submit" form="referrer-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : referrer() ? 'Save changes' : 'Add referrer' }}</button>
        }
      </ng-container>
    </app-modal>`,
  styles: [`
    .idbox { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 18px; background: var(--lacquer-tint); border-radius: 12px; }
    .id { font-family: var(--font-display); font-size: 32px; font-weight: 700; letter-spacing: 0.02em; color: var(--lacquer-ink); }
    .pct .input { padding-right: 34px; text-align: left; }
    .pct .suffix { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
  `],
})
export class ReferrerFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(ReferrersApi);
  private readonly toast = inject(ToastService);

  readonly referrer = input<Referrer | null>(null);
  readonly saved = output<Referrer>();
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly created = signal<Referrer | null>(null);
  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    contact: ['', [Validators.required, Validators.pattern(/^[0-9+\-\s()]{7,20}$/)]],
    percent: [10, [Validators.required, Validators.min(0.01), Validators.max(100)]],
  });

  ngOnInit() {
    const r = this.referrer();
    if (r) this.form.patchValue({ name: r.name, contact: r.contact, percent: r.percent });
  }

  protected err(name: string) {
    return controlError(this.form.get(name), { required: 'Required', pattern: 'Enter a valid phone number' });
  }

  protected save() {
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.form.getRawValue();
    const body = { name: v.name.trim(), contact: v.contact.trim(), percent: Number(v.percent) };
    const existing = this.referrer();
    (existing ? this.api.update(existing.id, body) : this.api.create(body)).subscribe({
      next: (r) => {
        this.busy.set(false);
        if (existing) { this.toast.success('Referrer updated'); this.saved.emit(r); }
        else this.created.set(r); // show the new ID before closing
      },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (info.code === 'CONTACT_EXISTS') { this.form.controls.contact.setErrors({ server: info.message }); this.form.controls.contact.markAsTouched(); }
        else if (!applyFieldErrors(this.form, info)) this.error.set(info.message);
      },
    });
  }

  protected async copy(r: Referrer) {
    try { await navigator.clipboard.writeText(r.code); this.toast.success('Referral ID copied'); }
    catch { this.toast.error('Could not copy. Select the ID and copy it by hand.'); }
  }
}
