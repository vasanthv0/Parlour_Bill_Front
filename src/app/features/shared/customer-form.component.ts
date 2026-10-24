import { Component, inject, input, output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CustomersApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { Customer } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';

/** Add or edit a customer. Used from the customer list and from the billing counter. */
@Component({
  selector: 'app-customer-form',
  imports: [ReactiveFormsModule, ModalComponent],
  template: `
    <app-modal [title]="customer() ? 'Edit customer' : 'New customer'" (closed)="cancelled.emit()">
      <form id="customer-form" [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
        @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }
        <div class="field" [class.invalid]="err('name')">
          <label class="label" for="c-name">Name</label>
          <input id="c-name" class="input" formControlName="name" autocomplete="off" />
          @if (err('name'); as m) { <span class="field-error">{{ m }}</span> }
        </div>
        <div class="field" [class.invalid]="err('phone')">
          <label class="label" for="c-phone">Phone</label>
          <input id="c-phone" class="input" type="tel" inputmode="tel" formControlName="phone" autocomplete="off" />
          @if (err('phone'); as m) { <span class="field-error">{{ m }}</span> }
        </div>
        <div class="field" [class.invalid]="err('email')">
          <label class="label" for="c-email">Email <span class="muted">(optional)</span></label>
          <input id="c-email" class="input" type="email" formControlName="email" autocomplete="off" />
          @if (err('email'); as m) { <span class="field-error">{{ m }}</span> }
        </div>
        <div class="field">
          <label class="label" for="c-notes">Notes <span class="muted">(optional)</span></label>
          <textarea id="c-notes" class="textarea" formControlName="notes" placeholder="Allergies, preferred stylist…"></textarea>
        </div>
      </form>
      <ng-container modal-foot>
        <button type="button" class="btn btn-secondary" (click)="cancelled.emit()">Cancel</button>
        <button type="submit" form="customer-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save customer' }}</button>
      </ng-container>
    </app-modal>`,
})
export class CustomerFormComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(CustomersApi);
  private readonly toast = inject(ToastService);

  readonly customer = input<Customer | null>(null);
  readonly initialName = input('');
  readonly saved = output<Customer>();
  readonly cancelled = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9+\-\s()]{7,20}$/)]],
    email: ['', Validators.email],
    notes: ['', Validators.maxLength(500)],
  });

  ngOnInit() {
    const c = this.customer();
    if (c) this.form.patchValue({ name: c.name, phone: c.phone, email: c.email ?? '', notes: c.notes ?? '' });
    else if (this.initialName()) this.form.patchValue({ name: this.initialName() });
  }

  protected err(name: string) {
    return controlError(this.form.get(name), { required: name === 'name' ? 'Enter the customer name' : 'Enter a phone number', pattern: 'Enter a valid phone number' });
  }

  protected save() {
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.form.getRawValue();
    const body = { name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim() || null, notes: v.notes.trim() || null };
    const existing = this.customer();
    (existing ? this.api.update(existing.id, body) : this.api.create(body)).subscribe({
      next: (c) => { this.toast.success(existing ? 'Customer updated' : 'Customer added'); this.saved.emit(c); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (info.code === 'PHONE_EXISTS') { this.form.get('phone')?.setErrors({ server: info.message }); this.form.get('phone')?.markAsTouched(); }
        else if (!applyFieldErrors(this.form, info)) this.error.set(info.message);
      },
    });
  }
}
