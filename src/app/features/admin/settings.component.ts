import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ParlourApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page narrow">
      <div class="page-head"><div><h1>Settings</h1><p class="sub">Details that appear on every bill you print.</p></div></div>

      @if (loading()) {
        <div class="skeleton" style="height: 380px"></div>
      } @else if (loadError()) {
        <div class="panel empty"><h3>Could not load settings</h3><p>{{ loadError() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else {
        <form class="panel" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="panel-body stack">
            @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }
            <div class="field" [class.invalid]="err('name')"><label class="label" for="name">Parlour name</label><input id="name" class="input" formControlName="name" />@if (err('name'); as m) { <span class="field-error">{{ m }}</span> }</div>
            <div class="form-grid">
              <div class="field" [class.invalid]="err('phone')"><label class="label" for="phone">Phone</label><input id="phone" class="input" type="tel" formControlName="phone" />@if (err('phone'); as m) { <span class="field-error">{{ m }}</span> }</div>
              <div class="field" [class.invalid]="err('gstNumber')"><label class="label" for="gst">GST number <span class="muted">(optional)</span></label><input id="gst" class="input" formControlName="gstNumber" />@if (err('gstNumber'); as m) { <span class="field-error">{{ m }}</span> }</div>
            </div>
            <div class="field"><label class="label" for="address">Address</label><textarea id="address" class="textarea" formControlName="address"></textarea></div>
            <div class="form-grid">
              <div class="field" [class.invalid]="err('taxPercent')">
                <label class="label" for="tax">GST on bills (%)</label>
                <input id="tax" class="input" type="number" step="0.01" min="0" max="100" inputmode="decimal" formControlName="taxPercent" />
                @if (err('taxPercent'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">Use 0 if you do not charge GST.</span> }
              </div>
              <div class="field" [class.invalid]="err('invoicePrefix')">
                <label class="label" for="prefix">Bill number prefix</label>
                <input id="prefix" class="input" formControlName="invoicePrefix" maxlength="8" />
                @if (err('invoicePrefix'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">Bills read like {{ form.controls.invoicePrefix.value || 'INV' }}-00001. Only new bills change.</span> }
              </div>
            </div>
          </div>
          <div class="panel-head" style="border-top: 1px solid var(--line); border-bottom: 0; justify-content: flex-end">
            <button type="submit" class="btn btn-primary" [disabled]="busy() || form.pristine">{{ busy() ? 'Saving…' : 'Save settings' }}</button>
          </div>
        </form>
      }
    </div>`,
  styles: [`.narrow { max-width: 720px; }`],
})
export class SettingsComponent {
  private readonly api = inject(ParlourApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    phone: ['', Validators.maxLength(20)],
    gstNumber: ['', Validators.maxLength(20)],
    address: ['', Validators.maxLength(300)],
    taxPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    invoicePrefix: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{2,8}$/)]],
  });

  constructor() { this.load(); }

  protected err(name: string) { return controlError(this.form.get(name), { required: 'Required', pattern: 'Use 2–8 letters or numbers' }); }

  protected load() {
    this.loading.set(true);
    this.loadError.set('');
    this.api.get().subscribe({
      next: (p) => { this.form.reset({ name: p.name, phone: p.phone ?? '', gstNumber: p.gstNumber ?? '', address: p.address ?? '', taxPercent: p.taxPercent, invoicePrefix: p.invoicePrefix }); this.loading.set(false); },
      error: (e) => { this.loadError.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected save() {
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.form.getRawValue();
    this.api.update({ name: v.name.trim(), phone: v.phone.trim() || null, gstNumber: v.gstNumber.trim() || null, address: v.address.trim() || null, taxPercent: Number(v.taxPercent), invoicePrefix: v.invoicePrefix.trim() }).subscribe({
      next: () => { this.busy.set(false); this.form.markAsPristine(); this.toast.success('Settings saved'); },
      error: (e) => { this.busy.set(false); const info = parseError(e); if (!applyFieldErrors(this.form, info)) this.error.set(info.message); },
    });
  }
}
