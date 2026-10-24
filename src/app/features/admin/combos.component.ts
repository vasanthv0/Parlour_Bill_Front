import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CombosApi, ServicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { Combo, Service } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

interface Part { serviceId: string; name: string; price: number; quantity: number; isActive: boolean }
const toPaise = (n: number) => Math.round(n * 100);

@Component({
  selector: 'app-combos',
  imports: [ReactiveFormsModule, FormsModule, MoneyPipe, IconComponent, ModalComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Combos</h1><p class="sub">Services sold together at one price. Staff pick a combo at the counter in one tap.</p></div>
        @if (canAdd()) { <button type="button" class="btn btn-primary" (click)="openForm(null)"><app-icon name="plus" /> New combo</button> }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 260px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load combos</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (items().length === 0) {
        <div class="panel empty">
          <h3>No combos yet</h3>
          @if (canAdd()) { <p>Bundle services at a special price, like Facial + Haircut + Threading.</p><button class="btn btn-primary" (click)="openForm(null)">Create the first combo</button> }
          @else { <p>Combos are set up for your parlour by the team that manages your account.</p> }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Combo</th><th class="num">Separately</th><th class="num">Combo price</th><th class="num">Customer saves</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (c of items(); track c.id) {
                <tr [class.off]="!c.isActive">
                  <td><strong>{{ c.name }}</strong><div class="muted small">{{ contents(c) }}</div></td>
                  <td class="num muted">{{ c.regularPrice | money }}</td>
                  <td class="num"><strong>{{ c.price | money }}</strong></td>
                  <td class="num" [class.good]="c.savings > 0">{{ c.savings > 0 ? (c.savings | money) : 'None' }}</td>
                  <td>
                    @if (!c.isActive) { <span class="badge badge-warn">Paused</span> }
                    @else if (!c.available) { <span class="badge badge-void" title="A service inside this combo was archived. Edit the combo to fix it.">Needs attention</span> }
                    @else { <span class="badge badge-paid">Active</span> }
                  </td>
                  <td class="cell-actions">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openForm(c)"><app-icon name="pencil" [size]="16" /> Edit</button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(c)">{{ c.isActive ? 'Pause' : 'Resume' }}</button>
                    <button type="button" class="btn btn-ghost btn-sm danger" (click)="deleting.set(c)"><app-icon name="trash" [size]="16" /> Delete</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="hint" style="margin-top: 12px">Past bills keep the combo exactly as it was sold, so editing or deleting a combo never changes them.</p>
      }
    </div>

    @if (formOpen()) {
      <app-modal [title]="editing() ? 'Edit combo' : 'New combo'" [wide]="true" (closed)="formOpen.set(false)">
        <form id="combo-form" [formGroup]="form" (ngSubmit)="save()" class="stack" novalidate>
          @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }

          <div class="field" [class.invalid]="err('name')">
            <label class="label" for="cb-name">Combo name</label>
            <input id="cb-name" class="input" formControlName="name" autocomplete="off" placeholder="e.g. Glow Package" />
            @if (err('name'); as m) { <span class="field-error">{{ m }}</span> }
          </div>

          <div class="field" [class.invalid]="partsError()">
            <span class="label" id="cb-parts">Services in this combo</span>
            <div class="row">
              <select class="select grow" aria-labelledby="cb-parts" [ngModel]="pick()" (ngModelChange)="pick.set($event)" [ngModelOptions]="{ standalone: true }">
                <option value="">Choose a service to add…</option>
                @for (s of addable(); track s.id) { <option [value]="s.id">{{ s.name }} · {{ s.price | money }}</option> }
              </select>
              <button type="button" class="btn btn-secondary" [disabled]="!pick()" (click)="addPart()"><app-icon name="plus" [size]="16" /> Add</button>
            </div>
            @if (parts().length) {
              <ul class="parts">
                @for (p of parts(); track p.serviceId) {
                  <li>
                    <span class="grow">{{ p.name }} @if (!p.isActive) { <span class="badge badge-void">Archived: remove it</span> }<span class="muted small"> · {{ p.price | money }} each</span></span>
                    <span class="qty">
                      <button type="button" [attr.aria-label]="'Fewer ' + p.name" (click)="step(p, -1)"><app-icon name="minus" [size]="14" /></button>
                      <span>{{ p.quantity }}</span>
                      <button type="button" [attr.aria-label]="'More ' + p.name" (click)="step(p, 1)"><app-icon name="plus" [size]="14" /></button>
                    </span>
                    <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="'Remove ' + p.name" (click)="removePart(p)"><app-icon name="x" [size]="16" /></button>
                  </li>
                }
              </ul>
            }
            @if (partsError(); as m) { <span class="field-error">{{ m }}</span> }
          </div>

          <div class="form-grid">
            <div class="field" [class.invalid]="err('price')">
              <label class="label" for="cb-price">Combo price</label>
              <span class="input-prefix"><span class="prefix">₹</span><input id="cb-price" class="input" type="number" step="0.01" min="0" inputmode="decimal" formControlName="price" /></span>
              @if (err('price'); as m) { <span class="field-error">{{ m }}</span> }
            </div>
            <div class="summary" aria-live="polite">
              <div class="row spread"><span class="muted">Separately</span><span class="num">{{ regularPaise() / 100 | money: true }}</span></div>
              <div class="row spread">
                <span class="muted">Customer saves</span>
                <strong class="num" [class.good]="savePaise() > 0" [class.bad]="savePaise() <= 0 && parts().length > 0">{{ savePaise() > 0 ? (savePaise() / 100 | money: true) : 'Nothing' }}</strong>
              </div>
              @if (parts().length && savePaise() <= 0) { <span class="small bad">The combo costs the same or more than buying separately.</span> }
            </div>
          </div>
        </form>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="formOpen.set(false)">Cancel</button>
          <button type="submit" form="combo-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save combo' }}</button>
        </ng-container>
      </app-modal>
    }

    @if (deleting(); as d) {
      <app-modal title="Delete this combo?" (closed)="deleting.set(null)">
        <p>Delete <strong>{{ d.name }}</strong>? It disappears from the billing screen. Bills that already include it are not changed. To stop selling it for a while, pause it instead.</p>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="deleting.set(null)">Keep combo</button>
          <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="remove(d)">{{ busy() ? 'Deleting…' : 'Delete combo' }}</button>
        </ng-container>
      </app-modal>
    }`,
  styles: [`
    .off td { color: var(--muted); }
    .good { color: var(--sage); font-weight: 600; }
    .bad { color: var(--brick); }
    .danger { color: var(--brick); }
    .parts { list-style: none; margin: 10px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 10px; li { display: flex; align-items: center; gap: 10px; padding: 9px 12px; } li + li { border-top: 1px solid var(--line); } }
    .summary { display: grid; gap: 6px; align-content: center; padding: 12px 14px; background: var(--sunken); border: 1px solid var(--line); border-radius: 10px; }
  `],
})
export class CombosComponent {
  private readonly api = inject(CombosApi);
  private readonly servicesApi = inject(ServicesApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  protected readonly canAdd = () => this.auth.hasFeature('action.combos.add');

  protected readonly items = signal<Combo[]>([]);
  protected readonly services = signal<Service[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Combo | null>(null);
  protected readonly deleting = signal<Combo | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly partsError = signal('');

  protected readonly parts = signal<Part[]>([]);
  protected readonly pick = signal('');
  protected readonly price = signal(0);

  protected readonly addable = computed(() => this.services().filter((s) => !this.parts().some((p) => p.serviceId === s.id)));
  protected readonly regularPaise = computed(() => this.parts().reduce((sum, p) => sum + toPaise(p.price) * p.quantity, 0));
  protected readonly savePaise = computed(() => this.regularPaise() - toPaise(this.price()));

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    price: [0, [Validators.required, Validators.min(0), Validators.max(1000000)]],
  });

  constructor() {
    this.form.controls.price.valueChanges.subscribe((v) => this.price.set(Number(v) || 0));
    this.servicesApi.list(false).subscribe({ next: (l) => this.services.set(l), error: () => undefined });
    this.load();
  }

  protected contents(c: Combo) { return c.items.map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)).join(' + '); }
  protected err(name: string) { return controlError(this.form.get(name), { required: 'Required' }); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.list(true).subscribe({
      next: (l) => { this.items.set(l); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected openForm(c: Combo | null) {
    this.editing.set(c);
    this.formError.set('');
    this.partsError.set('');
    this.pick.set('');
    this.parts.set(c ? c.items.map((i) => ({ serviceId: i.serviceId, name: i.name, price: i.price, quantity: i.quantity, isActive: i.isActive })) : []);
    this.form.reset({ name: c?.name ?? '', price: c?.price ?? 0 });
    this.price.set(c?.price ?? 0);
    this.formOpen.set(true);
  }

  protected addPart() {
    const s = this.services().find((x) => x.id === this.pick());
    if (!s) return;
    this.parts.update((p) => [...p, { serviceId: s.id, name: s.name, price: s.price, quantity: 1, isActive: true }]);
    this.pick.set('');
    this.partsError.set('');
  }
  protected step(p: Part, delta: number) {
    this.parts.update((list) => list.map((x) => (x.serviceId === p.serviceId ? { ...x, quantity: Math.min(20, Math.max(1, x.quantity + delta)) } : x)));
  }
  protected removePart(p: Part) { this.parts.update((list) => list.filter((x) => x.serviceId !== p.serviceId)); }

  protected save() {
    this.formError.set('');
    this.partsError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); }
    if (!this.parts().length) this.partsError.set('Add at least one service');
    else if (this.parts().some((p) => !p.isActive)) this.partsError.set('Remove the archived service, or put it back on the menu first');
    if (this.form.invalid || this.partsError()) return;

    this.busy.set(true);
    const v = this.form.getRawValue();
    const body = { name: v.name.trim(), price: Number(v.price), items: this.parts().map((p) => ({ serviceId: p.serviceId, quantity: p.quantity })) };
    const editing = this.editing();
    (editing ? this.api.update(editing.id, body) : this.api.create(body)).subscribe({
      next: () => { this.busy.set(false); this.formOpen.set(false); this.toast.success(editing ? 'Combo updated' : 'Combo created'); this.load(); },
      error: (e) => {
        this.busy.set(false);
        const info = parseError(e);
        if (info.code === 'COMBO_EXISTS') { this.form.controls.name.setErrors({ server: info.message }); this.form.controls.name.markAsTouched(); }
        else if (info.fields['items']) this.partsError.set(info.fields['items']);
        else if (!applyFieldErrors(this.form, info)) this.formError.set(info.message);
      },
    });
  }

  protected toggle(c: Combo) {
    this.api.update(c.id, { isActive: !c.isActive }).subscribe({
      next: () => { this.toast.success(c.isActive ? `${c.name} paused` : `${c.name} is on again`); this.load(); },
      error: (e) => this.toast.error(parseError(e).message),
    });
  }

  protected remove(c: Combo) {
    this.busy.set(true);
    this.api.remove(c.id).subscribe({
      next: () => { this.busy.set(false); this.deleting.set(null); this.toast.success(`${c.name} deleted`); this.load(); },
      error: (e) => { this.busy.set(false); this.deleting.set(null); this.toast.error(parseError(e).message); },
    });
  }
}
