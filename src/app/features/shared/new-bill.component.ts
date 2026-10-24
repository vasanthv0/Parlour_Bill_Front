import { DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, catchError, of } from 'rxjs';
import { CombosApi, InvoicesApi, ParlourApi, ReportsApi, ServicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { Combo, Customer, Parlour, PaymentMethod, ReferrerLookup, Service } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { CustomerPickerComponent } from './customer-picker.component';
import { ReferrerPickerComponent } from './referrer-picker.component';

const toPaise = (n: number) => Math.round(n * 100);

/** One line on the bill: a service or a combo. `key` is 's:<id>' or 'c:<id>'. */
interface Line { key: string; id: string; kind: 'service' | 'combo'; name: string; contents: string; unitPaise: number; qty: number; linePaise: number }
const SWATCHES: Record<string, string> = { hair: 'var(--cat-hair)', skin: 'var(--cat-skin)', nails: 'var(--cat-nails)', waxing: 'var(--cat-waxing)', bridal: 'var(--cat-bridal)' };

@Component({
  selector: 'app-new-bill',
  imports: [FormsModule, RouterLink, DatePipe, MoneyPipe, IconComponent, CustomerPickerComponent, ReferrerPickerComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>New bill</h1>
          <p class="sub">
            @if (myDay(); as d) { Today you have made {{ d.invoices }} bill{{ d.invoices === 1 ? '' : 's' }} totalling {{ d.revenue | money }}. }
            @else { Tap services to build the bill. }
          </p>
        </div>
      </div>

      @if (loading()) {
        <div class="layout"><div class="skeleton" style="height: 360px"></div><div class="skeleton" style="height: 420px"></div></div>
      } @else if (loadError()) {
        <div class="panel empty"><h3>Could not load the service menu</h3><p>{{ loadError() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (services().length === 0) {
        <div class="panel empty">
          <h3>No services on the menu yet</h3>
          @if (auth.role() === 'admin' && auth.hasFeature('action.services.add')) {
            <p>Add the services you offer and their prices, then come back to bill.</p>
            <a class="btn btn-primary" routerLink="/admin/services">Add services</a>
          } @else if (auth.role() === 'admin') { <p>Your menu has not been set up yet. Contact the team that manages your account.</p> }
          @else { <p>Ask your admin to add the service menu, then refresh this page.</p> }
        </div>
      } @else {
        <div class="layout">
          <section aria-label="Services">
            @if (showCombos()) {
              <div class="segmented viewtoggle" role="group" aria-label="What to add">
                <button type="button" [attr.aria-pressed]="view() === 'services'" (click)="view.set('services')">Services</button>
                <button type="button" [attr.aria-pressed]="view() === 'combos'" (click)="view.set('combos')">Combos <span class="count">{{ availableCombos().length }}</span></button>
              </div>
            }
            @if (view() === 'services' || !showCombos()) {
            <div class="toolbar">
              <div class="search input-affix">
                <input class="input" type="search" placeholder="Search services" aria-label="Search services" [ngModel]="search()" (ngModelChange)="search.set($event)" />
                <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
              </div>
            </div>
            <div class="row-wrap chips" role="group" aria-label="Filter by category">
              <button type="button" class="chip" [attr.aria-pressed]="category() === ''" (click)="category.set('')">All</button>
              @for (c of categories(); track c) {
                <button type="button" class="chip" [attr.aria-pressed]="category() === c" (click)="category.set(c)">{{ c }}</button>
              }
            </div>

            @if (visible().length === 0) {
              <div class="panel empty"><h3>No services match</h3><p>Try a different word or category.</p></div>
            } @else {
              <div class="tile-grid">
                @for (s of visible(); track s.id) {
                  <button type="button" class="tile" [class.in-bill]="qtyOf('s:' + s.id) > 0" [style.--swatch]="swatch(s.category)" (click)="add('s:' + s.id)" [attr.aria-label]="'Add ' + s.name + ', ' + (s.price | money)">
                    @if (qtyOf('s:' + s.id) > 0) { <span class="t-count" aria-hidden="true">{{ qtyOf('s:' + s.id) }}</span> }
                    <span class="t-name">{{ s.name }}</span>
                    <span class="t-meta"><span>{{ s.durationMin }} min</span><span class="t-price">{{ s.price | money }}</span></span>
                  </button>
                }
              </div>
            }
            } @else {
              <div class="tile-grid">
                @for (c of availableCombos(); track c.id) {
                  <button type="button" class="tile combo" [class.in-bill]="qtyOf('c:' + c.id) > 0" (click)="add('c:' + c.id)" [attr.aria-label]="'Add combo ' + c.name + ', ' + (c.price | money)">
                    @if (qtyOf('c:' + c.id) > 0) { <span class="t-count" aria-hidden="true">{{ qtyOf('c:' + c.id) }}</span> }
                    <span class="t-name">{{ c.name }}</span>
                    <span class="t-contents">{{ contents(c) }}</span>
                    <span class="t-meta"><span class="t-save">{{ c.savings > 0 ? 'Save ' + (c.savings | money) : 'Combo' }}</span><span class="t-price">{{ c.price | money }}</span></span>
                  </button>
                }
              </div>
            }
          </section>

          <aside class="bill" #bill aria-label="Current bill">
            <div class="receipt">
              <div class="receipt-title">
                <h2>{{ parlour()?.name }}</h2>
                <div class="meta">New bill · {{ today | date: 'd MMM y, h:mm a' }}</div>
              </div>

              <div class="customer">
                @if (customer(); as c) {
                  <div class="row spread">
                    <div><strong>{{ c.name }}</strong><div class="muted small num">{{ c.phone }}</div></div>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="customer.set(null)">Change</button>
                  </div>
                } @else {
                  @if (auth.hasFeature('page.customers')) { <app-customer-picker (picked)="customer.set($event)" /> }
                  <input class="input walkin" [placeholder]="auth.hasFeature('page.customers') ? 'Or type a walk-in name (optional)' : 'Customer name (optional)'" aria-label="Walk-in name" maxlength="80" [ngModel]="walkIn()" (ngModelChange)="walkIn.set($event)" />
                }
              </div>

              @if (auth.hasFeature('page.referrals')) {
                <div class="referral">
                  @if (referrer(); as r) {
                    <div class="row spread">
                      <div><strong>{{ r.name }}</strong> <span class="badge badge-admin num">{{ r.code }}</span><div class="muted small">{{ r.percent }}% referral discount</div></div>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="referrer.set(null)">Remove</button>
                    </div>
                  } @else { <app-referrer-picker (picked)="referrer.set($event)" /> }
                </div>
              }

              @if (lines().length === 0) {
                <p class="empty-lines muted">Nothing on the bill yet. Tap a service{{ showCombos() ? ' or a combo' : '' }} to add it.</p>
              } @else {
                <ul class="receipt-lines">
                  @for (l of lines(); track l.key) {
                    <li class="receipt-line">
                      <span class="name">{{ l.name }} @if (l.kind === 'combo') { <span class="badge badge-admin">Combo</span> }</span>
                      <span class="amt">{{ l.linePaise / 100 | money }}</span>
                      <span class="sub">{{ l.unitPaise / 100 | money }} each</span>
                      <span class="qty-wrap">
                        <span class="qty">
                          <button type="button" [attr.aria-label]="'Remove one ' + l.name" (click)="change(l.key, -1)"><app-icon [name]="l.qty === 1 ? 'trash' : 'minus'" [size]="14" /></button>
                          <span aria-live="polite">{{ l.qty }}</span>
                          <button type="button" [attr.aria-label]="'Add one ' + l.name" (click)="change(l.key, 1)"><app-icon name="plus" [size]="14" /></button>
                        </span>
                      </span>
                      @if (l.contents) { <span class="contents">{{ l.contents }}</span> }
                    </li>
                  }
                </ul>
              }

              <div class="receipt-sums">
                <div class="line"><span>Subtotal</span><span>{{ subtotalP() / 100 | money: true }}</span></div>
                @if (referrer(); as r) { <div class="line referral-line"><span>Referral discount ({{ r.percent }}%)</span><span>− {{ referralP() / 100 | money: true }}</span></div> }
                <div class="line discount">
                  <label for="discount">{{ referrer() ? 'Extra discount' : 'Discount' }}</label>
                  <span class="input-prefix"><span class="prefix">₹</span><input id="discount" class="input" inputmode="decimal" placeholder="0" [ngModel]="discountInput()" (ngModelChange)="discountInput.set($event)" [class.bad]="discountError()" /></span>
                </div>
                @if (discountError(); as m) { <div class="field-error">{{ m }}</div> }
                @if ((parlour()?.taxPercent ?? 0) > 0) {
                  <div class="line"><span>GST {{ parlour()?.taxPercent }}%</span><span>{{ taxP() / 100 | money: true }}</span></div>
                }
              </div>
              <div class="receipt-total"><span class="label">Total</span><span class="amount">{{ totalP() / 100 | money }}</span></div>

              <div class="pay">
                <div class="label" id="pay-label">Payment</div>
                <div class="segmented fill" role="group" aria-labelledby="pay-label">
                  @for (m of methods; track m.value) {
                    <button type="button" [attr.aria-pressed]="payment() === m.value" (click)="payment.set(m.value)">{{ m.label }}</button>
                  }
                </div>
              </div>

              <button type="button" class="btn btn-primary btn-lg btn-block save" [disabled]="!canSave()" (click)="save()">
                {{ saving() ? 'Saving…' : lines().length ? 'Save bill · ' + (totalP() / 100 | money) : 'Save bill' }}
              </button>
              @if (lines().length) { <button type="button" class="btn btn-ghost btn-block clear" (click)="clear()">Clear bill</button> }
            </div>
          </aside>
        </div>

        @if (lines().length) {
          <div class="mobile-bar no-print">
            <div><div class="muted small">{{ itemCount() }} item{{ itemCount() === 1 ? '' : 's' }}</div><strong class="num">{{ totalP() / 100 | money }}</strong></div>
            <button type="button" class="btn btn-primary" (click)="jumpToBill()">Review bill</button>
          </div>
        }
      }
    </div>`,
  styles: [`
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 390px; gap: 28px; align-items: start; }
    .chips { margin-bottom: 16px; gap: 8px; }
    .bill { position: sticky; top: 20px; padding: 8px 0 12px; }
    .customer { padding: 14px 0; border-bottom: 1px dashed var(--line-strong); display: grid; gap: 8px; }
    .walkin { min-height: 38px; font-size: 14px; }
    .referral { padding: 14px 0; border-bottom: 1px dashed var(--line-strong); }
    .referral-line { color: var(--sage); font-weight: 600; }
    .viewtoggle { margin-bottom: 14px; .count { margin-left: 4px; opacity: 0.7; } }
    .tile.combo { .t-contents { color: var(--muted); font-size: 13px; line-height: 1.3; } .t-save { color: var(--sage); font-weight: 600; } }
    .receipt-line .contents { grid-column: 1 / -1; color: var(--muted); font-size: 13px; }
    .empty-lines { padding: 22px 0; text-align: center; border-bottom: 1px dashed var(--line-strong); }
    .receipt-line .qty-wrap { grid-column: 2; grid-row: 2; justify-self: end; }
    .receipt-line .sub { grid-column: 1; grid-row: 2; align-self: center; }
    .discount { align-items: center; .input-prefix { width: 120px; } .input { text-align: right; min-height: 36px; padding-top: 6px; padding-bottom: 6px; } .input.bad { border-color: var(--brick); } }
    .pay { margin-top: 18px; display: grid; gap: 6px; }
    .save { margin-top: 16px; }
    .clear { margin-top: 6px; }
    .mobile-bar { display: none; }
    @media (max-width: 1000px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .bill { position: static; }
      .mobile-bar { display: flex; align-items: center; justify-content: space-between; position: fixed; left: 0; right: 0; bottom: 0; z-index: 25; padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); background: var(--surface); border-top: 1px solid var(--line-strong); box-shadow: 0 -6px 18px rgba(36, 26, 39, 0.1); strong { font-family: var(--font-display); font-size: 20px; } }
    }
  `],
})
export class NewBillComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly invoicesApi = inject(InvoicesApi);
  private readonly servicesApi = inject(ServicesApi);
  private readonly combosApi = inject(CombosApi);
  private readonly parlourApi = inject(ParlourApi);
  private readonly reports = inject(ReportsApi);
  private readonly billEl = viewChild<ElementRef<HTMLElement>>('bill');

  protected readonly methods: { value: PaymentMethod; label: string }[] = [{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }];
  protected readonly today = new Date();

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly services = signal<Service[]>([]);
  protected readonly combos = signal<Combo[]>([]);
  protected readonly parlour = signal<Parlour | null>(null);
  protected readonly myDay = signal<{ invoices: number; revenue: number } | null>(null);

  protected readonly view = signal<'services' | 'combos'>('services');
  protected readonly search = signal('');
  protected readonly category = signal('');
  protected readonly cart = signal<ReadonlyMap<string, number>>(new Map());
  protected readonly customer = signal<Customer | null>(null);
  protected readonly referrer = signal<ReferrerLookup | null>(null);
  protected readonly walkIn = signal('');
  protected readonly discountInput = signal('');
  protected readonly payment = signal<PaymentMethod>('cash');
  protected readonly saving = signal(false);

  protected readonly categories = computed(() => [...new Set(this.services().map((s) => s.category))].sort());
  protected readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.category();
    return this.services().filter((s) => (!cat || s.category === cat) && (!q || s.name.toLowerCase().includes(q)));
  });
  protected readonly availableCombos = computed(() => this.combos().filter((c) => c.available));
  protected readonly showCombos = computed(() => this.auth.hasFeature('page.combos') && this.availableCombos().length > 0);

  // Same arithmetic as the server (integer paise), so the total on screen is the total that is saved.
  protected readonly lines = computed<Line[]>(() => {
    const services = new Map(this.services().map((s) => [s.id, s]));
    const combos = new Map(this.availableCombos().map((c) => [c.id, c]));
    return [...this.cart().entries()].flatMap(([key, qty]): Line[] => {
      const id = key.slice(2);
      if (key.startsWith('s:')) {
        const s = services.get(id);
        return s ? [{ key, id, kind: 'service', name: s.name, contents: '', unitPaise: toPaise(s.price), qty, linePaise: toPaise(s.price) * qty }] : [];
      }
      const c = combos.get(id);
      return c ? [{ key, id, kind: 'combo', name: c.name, contents: this.contents(c), unitPaise: toPaise(c.price), qty, linePaise: toPaise(c.price) * qty }] : [];
    });
  });
  protected readonly itemCount = computed(() => this.lines().reduce((n, l) => n + l.qty, 0));
  protected readonly subtotalP = computed(() => this.lines().reduce((s, l) => s + l.linePaise, 0));
  /** The referrer's percentage of the subtotal. */
  protected readonly referralP = computed(() => {
    const r = this.referrer();
    return r ? Math.round((this.subtotalP() * r.percent) / 100) : 0;
  });
  private readonly discountValue = computed(() => {
    const raw = this.discountInput().trim();
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? n : NaN;
  });
  protected readonly discountError = computed(() => {
    const d = this.discountValue();
    if (Number.isNaN(d)) return 'Enter an amount like 100 or 99.50';
    if (toPaise(d) + this.referralP() <= this.subtotalP()) return '';
    return this.referralP() ? 'With the referral discount, this is more than the subtotal' : 'Discount cannot be more than the subtotal';
  });
  private readonly discountP = computed(() => (this.discountError() ? 0 : toPaise(this.discountValue())));
  protected readonly taxP = computed(() => Math.round(((this.subtotalP() - this.referralP() - this.discountP()) * (this.parlour()?.taxPercent ?? 0)) / 100));
  protected readonly totalP = computed(() => this.subtotalP() - this.referralP() - this.discountP() + this.taxP());
  protected readonly canSave = computed(() => this.lines().length > 0 && !this.discountError() && !this.saving());

  constructor() {
    this.load();
    this.reports.myDay().subscribe({ next: (d) => this.myDay.set(d), error: () => undefined });
  }

  protected contents(c: Combo) { return c.items.map((i) => (i.quantity > 1 ? `${i.name} × ${i.quantity}` : i.name)).join(' + '); }

  protected load() {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      services: this.servicesApi.list(),
      parlour: this.parlourApi.get(),
      // Combos are optional: if they are switched off or fail to load, billing carries on with services.
      combos: this.auth.hasFeature('page.combos') ? this.combosApi.list().pipe(catchError(() => of([] as Combo[]))) : of([] as Combo[]),
    }).subscribe({
      next: ({ services, parlour, combos }) => {
        this.services.set(services);
        this.combos.set(combos);
        this.parlour.set(parlour);
        // Drop anything in the bill that is no longer for sale.
        const valid = new Set([...services.map((s) => 's:' + s.id), ...combos.filter((c) => c.available).map((c) => 'c:' + c.id)]);
        this.cart.update((c) => new Map([...c].filter(([key]) => valid.has(key))));
        if (this.view() === 'combos' && !combos.some((c) => c.available)) this.view.set('services');
        this.loading.set(false);
      },
      error: (e) => { this.loadError.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected qtyOf(key: string) { return this.cart().get(key) ?? 0; }
  protected add(key: string) { this.change(key, 1); }
  protected change(key: string, delta: number) {
    this.cart.update((c) => {
      const next = new Map(c);
      const qty = Math.min(50, (next.get(key) ?? 0) + delta);
      if (qty <= 0) next.delete(key); else next.set(key, qty);
      return next;
    });
  }
  protected clear() { this.cart.set(new Map()); this.discountInput.set(''); this.referrer.set(null); }
  protected swatch(category: string) { return SWATCHES[category.trim().toLowerCase()] ?? 'var(--cat-other)'; }
  protected jumpToBill() { this.billEl()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  protected save() {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.invoicesApi.create({
      customerId: this.customer()?.id ?? null,
      walkInName: this.customer() ? undefined : this.walkIn().trim() || undefined,
      items: this.lines().map((l) => (l.kind === 'combo' ? { comboId: l.id, quantity: l.qty } : { serviceId: l.id, quantity: l.qty })),
      referrerId: this.referrer()?.id ?? null,
      discount: this.discountP() / 100,
      paymentMethod: this.payment(),
    }).subscribe({
      next: (inv) => {
        this.toast.success(`Bill ${inv.number} saved`);
        void this.router.navigate([this.auth.basePath(), 'invoices', inv.id], { queryParams: { new: 1 } });
      },
      error: (e) => {
        this.saving.set(false);
        const info = parseError(e);
        this.toast.error(info.message);
        // The menu changed while billing: refresh it. A referrer that is no longer valid comes off the bill.
        if (info.code === 'SERVICE_UNAVAILABLE' || info.code === 'COMBO_UNAVAILABLE') this.load();
        if (info.code === 'REFERRER_UNAVAILABLE') this.referrer.set(null);
      },
    });
  }
}
