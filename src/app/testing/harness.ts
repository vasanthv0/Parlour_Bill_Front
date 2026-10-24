/**
 * Test helpers: open a page the way the router does, signed in as a given role, with realistic API
 * responses, so that a runtime error in a template or in injection fails a test instead of reaching a browser.
 */
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../environments/environment';
import { authInterceptor } from '../core/auth.interceptor';
import { AuthService } from '../core/auth.service';
import { Role } from '../core/models';

export const ALL_FEATURES = [
  'page.dashboard', 'page.customers', 'page.services', 'page.combos', 'page.referrals', 'page.team', 'page.settings',
  'action.services.add', 'action.team.add', 'action.team.edit', 'action.team.reset', 'action.team.deactivate',
  'action.combos.add', 'action.referrals.add', 'action.whatsapp.send',
];
const REQUIRES: Record<string, string> = { 'action.services.add': 'page.services', 'action.team.add': 'page.team', 'action.team.edit': 'page.team', 'action.team.reset': 'page.team', 'action.team.deactivate': 'page.team', 'action.combos.add': 'page.combos', 'action.referrals.add': 'page.referrals' };

/** What a parlour is allowed to use, as the API sends it: a button is off whenever its page is off. */
export function featuresWith(off: string[] = []): Record<string, boolean> {
  return Object.fromEntries(ALL_FEATURES.map((k) => [k, !off.includes(k) && !(REQUIRES[k] && off.includes(REQUIRES[k]))]));
}

/** jsdom lacks a few browser features the app relies on. */
export function installDomShims() {
  const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void; close?: () => void };
  proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  proto.close = function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  // The password generator needs random numbers; jsdom may not provide them.
  if (!globalThis.crypto?.getRandomValues) {
    const getRandomValues = <T extends ArrayBufferView>(a: T): T => { const u = a as unknown as Uint32Array; for (let i = 0; i < u.length; i++) u[i] = Math.floor(Math.random() * 2 ** 32); return a; };
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues }, configurable: true });
  }
}

// ───────────── API responses (the shapes the real API returns) ─────────────
const iso = '2026-10-18T10:30:00.000Z';
const meta = (n: number) => ({ page: 1, limit: 20, total: n, pages: 1 });
const parlour = { id: 'p1', name: 'Demo Parlour', phone: '9840000000', address: '12 Lake View Road', gstNumber: '33ABCDE1234F1Z5', currency: 'INR', timezone: 'Asia/Kolkata', taxPercent: 5, invoicePrefix: 'DP' };
const services = [
  { id: 's1', name: 'Haircut', category: 'Hair', price: 200, durationMin: 30, isActive: true },
  { id: 's2', name: 'Facial', category: 'Skin', price: 500, durationMin: 60, isActive: true },
  { id: 's3', name: 'Massage', category: 'Hair', price: 1000, durationMin: 45, isActive: true },
  { id: 's4', name: 'Old Wax', category: 'Nails', price: 300, durationMin: 20, isActive: false },
];
const combos = [
  { id: 'c1', name: 'Glow Pack', price: 600, isActive: true, createdAt: iso, regularPrice: 700, savings: 100, available: true,
    items: [{ serviceId: 's1', name: 'Haircut', quantity: 1, price: 200, isActive: true }, { serviceId: 's2', name: 'Facial', quantity: 1, price: 500, isActive: true }] },
  { id: 'c2', name: 'Broken Pack', price: 400, isActive: true, createdAt: iso, regularPrice: 500, savings: 100, available: false,
    items: [{ serviceId: 's4', name: 'Old Wax', quantity: 1, price: 300, isActive: false }, { serviceId: 's1', name: 'Haircut', quantity: 1, price: 200, isActive: true }] },
];
const referrers = [
  { id: 'r1', code: 'REF-0001', name: 'Anita Rao', contact: '9841100001', percent: 10, isActive: true, createdAt: iso, bills: 2, totalDiscount: 240, lastUsedAt: iso, canDelete: false },
  { id: 'r2', code: 'REF-0002', name: 'Kumar S', contact: '9841100002', percent: 5, isActive: false, createdAt: iso, bills: 0, totalDiscount: 0, lastUsedAt: null, canDelete: true },
];
const customers = [{ id: 'cu1', name: 'Cara Customer', phone: '9000000005', email: 'cara@example.com', notes: 'Prefers mornings', createdAt: iso, visits: 3, totalSpent: 2100, lastVisit: iso }];
const invoiceRow = { id: 'i1', number: 'DP-00001', customerId: 'cu1', customerName: 'Cara Customer', createdBy: 'u1', createdByName: 'Riya', subtotal: 900, discount: 0, referrerId: 'r1', referralPercent: 10, referralDiscount: 90, taxPercent: 5, tax: 40.5, total: 850.5, paymentMethod: 'upi', notes: null, status: 'paid', voidReason: null, voidedAt: null, createdAt: iso };
const invoice = (phone: string | null) => ({
  ...invoiceRow, customerPhone: phone, referrer: { id: 'r1', code: 'REF-0001', name: 'Anita Rao' },
  parlour: { name: 'Demo Parlour', phone: '9840000000', address: '12 Lake View Road', gstNumber: '33ABCDE1234F1Z5', timezone: 'Asia/Kolkata' },
  items: [
    { id: 'it1', comboId: 'c1', description: 'Haircut + Facial', name: 'Glow Pack', unitPrice: 600, quantity: 1, lineTotal: 600 },
    { id: 'it2', comboId: null, description: null, name: 'Wax', unitPrice: 300, quantity: 1, lineTotal: 300 },
  ],
});
const days = Array.from({ length: 7 }, (_, i) => ({ day: `2026-10-${12 + i}`, revenue: i * 500, invoices: i }));
const summary = (empty: boolean) => ({
  range: { from: '2026-10-12', to: '2026-10-18' },
  totals: { invoices: empty ? 0 : 12, revenue: empty ? 0 : 9400, discounts: empty ? 0 : 640, referralDiscounts: empty ? 0 : 240, tax: 410, averageBill: empty ? 0 : 783.33 },
  byPayment: empty ? [] : [{ method: 'cash', invoices: 5, revenue: 3000 }, { method: 'upi', invoices: 7, revenue: 6400 }],
  daily: days, topServices: empty ? [] : [{ name: 'Facial', quantity: 5, revenue: 2500 }], byStaff: empty ? [] : [{ name: 'Riya', invoices: 7, revenue: 5000 }],
});
const defs = [
  ...['Dashboard', 'Customers', 'Services', 'Combos', 'Referrals', 'Team', 'Settings'].map((l) => ({ key: `page.${l.toLowerCase()}`, group: 'page', label: l, description: `The ${l} page.` })),
  { key: 'action.services.add', group: 'action', requires: 'page.services', label: 'Add service button', description: 'Create services.' },
  { key: 'action.team.add', group: 'action', requires: 'page.team', label: 'Add team member button', description: 'Create staff.' },
  { key: 'action.team.edit', group: 'action', requires: 'page.team', label: 'Edit team member button', description: 'Edit staff.' },
  { key: 'action.team.reset', group: 'action', requires: 'page.team', label: 'Reset password button', description: 'Reset passwords.' },
  { key: 'action.team.deactivate', group: 'action', requires: 'page.team', label: 'Deactivate / Reactivate button', description: 'Deactivate staff.' },
  { key: 'action.combos.add', group: 'action', requires: 'page.combos', label: 'Add combo button', description: 'Create combos.' },
  { key: 'action.referrals.add', group: 'action', requires: 'page.referrals', label: 'Add referrer button', description: 'Create referrers.' },
  { key: 'action.whatsapp.send', group: 'action', label: 'Send on WhatsApp button', description: 'WhatsApp.' },
];
const platformParlour = { id: 'pp1', name: 'Glow Salon', status: 'active', createdAt: iso, features: featuresWith(['page.team']),
  owner: { id: 'o1', name: 'Olive Owner', email: 'olive@glow.test', isActive: true, lastLoginAt: iso }, counts: { team: 3, bills: 42, customers: 18, services: 9 } };

/** The response for a GET, by path. `empty` gives the "nothing here yet" version of every list. */
export function respond(path: string, empty: boolean): unknown {
  const list = <T>(rows: T[]) => ({ data: empty ? [] : rows, meta: meta(empty ? 0 : rows.length) });
  const routes: [RegExp, () => unknown][] = [
    [/^\/parlour$/, () => ({ data: parlour })],
    [/^\/services$/, () => ({ data: empty ? [] : services })],
    [/^\/combos$/, () => ({ data: empty ? [] : combos })],
    [/^\/referrers\/lookup$/, () => ({ data: [{ id: 'r1', code: 'REF-0001', name: 'Anita Rao', percent: 10 }] })],
    [/^\/referrers\/[^/]+$/, () => ({ data: { ...referrers[0], history: empty ? [] : [{ id: 'i1', number: 'DP-00001', customerName: 'Cara', percent: 10, discount: 90, total: 850.5, status: 'paid', createdAt: iso }, { id: 'i2', number: 'DP-00002', customerName: 'Walk-in', percent: 10, discount: 150, total: 1400, status: 'void', createdAt: iso }] } })],
    [/^\/referrers$/, () => list(referrers)],
    [/^\/customers\/[^/]+$/, () => ({ data: { ...customers[0], recentInvoices: empty ? [] : [{ id: 'i1', number: 'DP-00001', total: 850.5, status: 'paid', paymentMethod: 'upi', createdAt: iso }] } })],
    [/^\/customers$/, () => list(customers)],
    [/^\/invoices\/makers$/, () => ({ data: [{ id: 'u1', name: 'Riya' }, { id: 'u2', name: 'Farah' }] })],
    [/^\/invoices\/[^/]+$/, () => ({ data: invoice('9000000005') })],
    [/^\/invoices$/, () => list([invoiceRow])],
    [/^\/reports\/summary$/, () => ({ data: summary(empty) })],
    [/^\/reports\/my-day$/, () => ({ data: { invoices: empty ? 0 : 3, revenue: empty ? 0 : 900 } })],
    [/^\/staff$/, () => ({ data: [
      { id: 'u1', name: 'Olive Owner', email: 'o@x.test', mobile: null, role: 'admin', isActive: true, lastLoginAt: iso, createdAt: iso },
      { id: 'u2', name: 'Riya', email: 'riya@x.test', mobile: '9840011111', role: 'staff', isActive: true, lastLoginAt: iso, createdAt: iso },
      { id: 'u3', name: 'Farah', email: 'farah@x.test', mobile: null, role: 'staff', isActive: false, lastLoginAt: null, createdAt: iso },
    ] })],
    [/^\/platform\/features$/, () => ({ data: defs })],
    [/^\/platform\/summary$/, () => ({ data: { parlours: empty ? 0 : 5, active: empty ? 0 : 4, suspended: empty ? 0 : 1, bills: empty ? 0 : 320 } })],
    [/^\/platform\/parlours\/[^/]+$/, () => ({ data: platformParlour })],
    [/^\/platform\/parlours$/, () => list([platformParlour, { ...platformParlour, id: 'pp2', name: 'Calm Spa', status: 'suspended' }])],
  ];
  for (const [pattern, build] of routes) if (pattern.test(path)) return build();
  throw new Error(`Test harness has no response for GET ${path}. Add it to respond() in harness.ts.`);
}

// ───────────── opening a page ─────────────
export interface OpenOptions {
  role?: Role;
  /** Switches the platform admin turned off (a button is also off if its page is). */
  off?: string[];
  empty?: boolean;
  /** Overrides the saved customer phone etc. on the bill the invoice page loads. */
  invoicePhone?: string | null;
  query?: string;
}

export interface Page {
  host: HTMLElement;
  http: HttpTestingController;
  auth: AuthService;
  /** Answers every pending GET, then re-renders; repeats until nothing is pending. */
  settle(): Promise<void>;
  text(): string;
  /** Click the first button or link whose text matches. */
  click(label: RegExp | string): Promise<void>;
  type(selector: string, value: string): Promise<void>;
  expectOne(method: string, urlPart: string): TestRequest;
}

export async function open<T>(component: Type<T>, o: OpenOptions = {}): Promise<Page> {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'page/:id', component }, { path: '**', component }]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const auth = TestBed.inject(AuthService);
  const http = TestBed.inject(HttpTestingController);

  if (o.role) {
    auth.login('t@t.test', 'pw').subscribe();
    const user = o.role === 'super_admin'
      ? { id: 'su', name: 'Platform Admin', email: 'p@p.test', role: 'super_admin', parlourId: null, parlourName: null, features: null }
      : { id: 'u1', name: 'Olive Owner', email: 'o@x.test', role: o.role, parlourId: 'p1', parlourName: 'Demo Parlour', features: featuresWith(o.off) };
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ data: { accessToken: 'token', user } });
  }

  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(`/page/x1${o.query ?? ''}`, component);

  const pathOf = (url: string) => url.replace(environment.apiUrl, '').split('?')[0];
  const page: Page = {
    host: harness.fixture.nativeElement as HTMLElement,
    http,
    auth,
    async settle() {
      for (let i = 0; i < 8; i++) {
        harness.detectChanges();
        await harness.fixture.whenStable();
        const pending = http.match((r) => r.method === 'GET' && !r.url.includes('/whatsapp')); // tests inspect that one themselves
        if (!pending.length) break;
        for (const r of pending) {
          const body = pathOf(r.request.url).match(/^\/invoices\/[^/]+$/) && o.invoicePhone !== undefined
            ? { data: invoice(o.invoicePhone) }
            : respond(pathOf(r.request.url), !!o.empty);
          r.flush(body as object);
        }
      }
      harness.detectChanges();
      await harness.fixture.whenStable();
    },
    text: () => page.host.textContent ?? '',
    async click(label) {
      const match = (el: Element) => (typeof label === 'string' ? (el.textContent ?? '').includes(label) : label.test(el.textContent ?? ''));
      const target = [...page.host.querySelectorAll('button, a')].find(match) as HTMLElement | undefined;
      if (!target) throw new Error(`No button or link matching ${label}. Page text: ${page.text().slice(0, 400)}`);
      target.click();
      await page.settle();
    },
    async type(selector, value) {
      const input = page.host.querySelector(selector) as HTMLInputElement | null;
      if (!input) throw new Error(`No element for ${selector}`);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await page.settle();
    },
    expectOne: (method, urlPart) => http.expectOne((r) => r.method === method && r.url.includes(urlPart)),
  };
  await page.settle();
  return page;
}
