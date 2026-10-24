import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ServicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { Service } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

@Component({
  selector: 'app-services',
  imports: [ReactiveFormsModule, MoneyPipe, IconComponent, ModalComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Services</h1><p class="sub">Your menu and prices. Staff can use these but not change them.</p></div>
        @if (canAdd()) { <button type="button" class="btn btn-primary" (click)="openForm(null)"><app-icon name="plus" /> Add service</button> }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 280px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load services</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (items().length === 0) {
        <div class="panel empty">
          <h3>Your menu is empty</h3>
          @if (canAdd()) { <p>Add the services you offer, like haircuts, facials and waxing.</p><button class="btn btn-primary" (click)="openForm(null)">Add the first service</button> }
          @else { <p>Services are set up for your parlour by the team that manages your account. Contact them to add yours.</p> }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Service</th><th class="num">Duration</th><th class="num">Price</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (g of groups(); track g.category) {
                <tr class="group-row"><td colspan="4">{{ g.category }}</td></tr>
                @for (s of g.items; track s.id) {
                  <tr [class.archived]="!s.isActive">
                    <td>{{ s.name }} @if (!s.isActive) { <span class="badge badge-warn">Archived</span> }</td>
                    <td class="num muted">{{ s.durationMin }} min</td>
                    <td class="num"><strong>{{ s.price | money }}</strong></td>
                    <td class="cell-actions">
                      <button type="button" class="btn btn-ghost btn-sm" (click)="openForm(s)"><app-icon name="pencil" [size]="16" /> Edit</button>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(s)">
                        <app-icon [name]="s.isActive ? 'archive' : 'restore'" [size]="16" /> {{ s.isActive ? 'Archive' : 'Restore' }}
                      </button>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
        <p class="hint" style="margin-top: 12px">Archived services disappear from the billing screen but stay on old bills. Price changes only affect new bills.</p>
      }
    </div>

    @if (formOpen()) {
      <app-modal [title]="editing() ? 'Edit service' : 'New service'" (closed)="formOpen.set(false)">
        <form id="service-form" [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
          @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
          <div class="field" [class.invalid]="err('name')">
            <label class="label" for="s-name">Name</label>
            <input id="s-name" class="input" formControlName="name" autocomplete="off" />
            @if (err('name'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="field" [class.invalid]="err('category')">
            <label class="label" for="s-cat">Category</label>
            <input id="s-cat" class="input" formControlName="category" list="categories" autocomplete="off" placeholder="Hair, Skin, Nails…" />
            <datalist id="categories">@for (c of categories(); track c) { <option [value]="c"></option> }</datalist>
            @if (err('category'); as m) { <span class="field-error">{{ m }}</span> }
          </div>
          <div class="form-grid">
            <div class="field" [class.invalid]="err('price')">
              <label class="label" for="s-price">Price</label>
              <span class="input-prefix"><span class="prefix">₹</span><input id="s-price" class="input" type="number" step="0.01" min="0" inputmode="decimal" formControlName="price" /></span>
              @if (err('price'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
            <div class="field" [class.invalid]="err('durationMin')">
              <label class="label" for="s-dur">Duration (minutes)</label>
              <input id="s-dur" class="input" type="number" step="5" min="5" inputmode="numeric" formControlName="durationMin" />
              @if (err('durationMin'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
          </div>
        </form>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="formOpen.set(false)">Cancel</button>
          <button type="submit" form="service-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save service' }}</button>
        </ng-container>
      </app-modal>
    }`,
  styles: [`.archived td { color: var(--muted); } .archived td strong { font-weight: 500; }`],
})
export class ServicesComponent {
  private readonly api = inject(ServicesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  protected readonly canAdd = () => this.auth.hasFeature('action.services.add');

  protected readonly items = signal<Service[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Service | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');

  protected readonly categories = computed(() => [...new Set(this.items().map((s) => s.category))].sort());
  protected readonly groups = computed(() => this.categories().map((category) => ({ category, items: this.items().filter((s) => s.category === category) })));

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    category: ['', [Validators.required, Validators.maxLength(40)]],
    price: [0, [Validators.required, Validators.min(0), Validators.max(1000000)]],
    durationMin: [30, [Validators.required, Validators.min(5), Validators.max(600)]],
  });

  constructor() { this.load(); }

  protected err(name: string) { return controlError(this.form.get(name), { required: 'Required' }); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.list(true).subscribe({
      next: (list) => { this.items.set(list); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected openForm(s: Service | null) {
    this.editing.set(s);
    this.formError.set('');
    this.form.reset(s ? { name: s.name, category: s.category, price: s.price, durationMin: s.durationMin } : { name: '', category: '', price: 0, durationMin: 30 });
    this.formOpen.set(true);
  }

  protected save() {
    this.formError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.form.getRawValue();
    const body = { name: v.name.trim(), category: v.category.trim(), price: Number(v.price), durationMin: Number(v.durationMin) };
    const editing = this.editing();
    (editing ? this.api.update(editing.id, body) : this.api.create(body)).subscribe({
      next: () => { this.busy.set(false); this.formOpen.set(false); this.toast.success(editing ? 'Service updated' : 'Service added'); this.load(); },
      error: (e) => { this.busy.set(false); const info = parseError(e); if (!applyFieldErrors(this.form, info)) this.formError.set(info.message); },
    });
  }

  protected toggle(s: Service) {
    this.api.update(s.id, { isActive: !s.isActive }).subscribe({
      next: () => { this.toast.success(s.isActive ? `${s.name} archived` : `${s.name} restored`); this.load(); },
      error: (e) => this.toast.error(parseError(e).message),
    });
  }
}
