import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Role } from './core/models';
import { LoginComponent } from './features/auth/login.component';
import { AttendanceLogComponent } from './features/admin/attendance-log.component';
import { CombosComponent } from './features/admin/combos.component';
import { DashboardComponent } from './features/admin/dashboard.component';
import { ReferralDetailComponent } from './features/admin/referral-detail.component';
import { ReferralsComponent } from './features/admin/referrals.component';
import { ServicesComponent } from './features/admin/services.component';
import { SettingsComponent } from './features/admin/settings.component';
import { TeamComponent } from './features/admin/team.component';
import { ShellComponent } from './features/shell/shell.component';
import { AccountComponent } from './features/shared/account.component';
import { AttendanceComponent } from './features/shared/attendance.component';
import { CustomersComponent } from './features/shared/customers.component';
import { InvoiceDetailComponent } from './features/shared/invoice-detail.component';
import { InvoicesComponent } from './features/shared/invoices.component';
import { NewBillComponent } from './features/shared/new-bill.component';
import { ParlourDetailComponent } from './features/superadmin/parlour-detail.component';
import { ParloursComponent } from './features/superadmin/parlours.component';
import { installDomShims, open } from './testing/harness';

jest.setTimeout(30000);
beforeAll(installDomShims);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const html = (page: { host: HTMLElement }, selector: string) => page.host.querySelector(selector);

/** Every screen, as the person who uses it. */
const PAGES: { name: string; component: Type<unknown>; role?: Role; heading: RegExp }[] = [
  { name: 'Sign in', component: LoginComponent, heading: /Sign in/ },
  { name: 'Dashboard', component: DashboardComponent, role: 'admin', heading: /Dashboard/ },
  { name: 'Services', component: ServicesComponent, role: 'admin', heading: /Services/ },
  { name: 'Combos', component: CombosComponent, role: 'admin', heading: /Combos/ },
  { name: 'Referrals', component: ReferralsComponent, role: 'admin', heading: /Referrals/ },
  { name: 'Referrer detail', component: ReferralDetailComponent, role: 'admin', heading: /Anita Rao/ },
  { name: 'Team', component: TeamComponent, role: 'admin', heading: /Team/ },
  { name: 'Settings', component: SettingsComponent, role: 'admin', heading: /Settings/ },
  { name: 'Customers (admin)', component: CustomersComponent, role: 'admin', heading: /Customers/ },
  { name: 'Customers (staff)', component: CustomersComponent, role: 'staff', heading: /Customers/ },
  { name: 'All bills', component: InvoicesComponent, role: 'admin', heading: /All bills/ },
  { name: 'My bills', component: InvoicesComponent, role: 'staff', heading: /My bills/ },
  { name: 'Bill (admin)', component: InvoiceDetailComponent, role: 'admin', heading: /Demo Parlour/ },
  { name: 'Bill (staff)', component: InvoiceDetailComponent, role: 'staff', heading: /Demo Parlour/ },
  { name: 'New bill (admin)', component: NewBillComponent, role: 'admin', heading: /New bill/ },
  { name: 'New bill (staff)', component: NewBillComponent, role: 'staff', heading: /New bill/ },
  { name: 'Account', component: AccountComponent, role: 'staff', heading: /Account/ },
  { name: 'Attendance (staff)', component: AttendanceComponent, role: 'staff', heading: /Attendance/ },
  { name: 'Attendance (admin)', component: AttendanceComponent, role: 'admin', heading: /Attendance/ },
  { name: 'Staff attendance (admin)', component: AttendanceLogComponent, role: 'admin', heading: /Staff attendance/ },
  { name: 'Parlours (platform admin)', component: ParloursComponent, role: 'super_admin', heading: /Parlours/ },
  { name: 'Parlour detail (platform admin)', component: ParlourDetailComponent, role: 'super_admin', heading: /Glow Salon/ },
  { name: 'Sidebar shell (admin)', component: ShellComponent, role: 'admin', heading: /Demo Parlour/ },
];

describe('every page renders without runtime errors', () => {
  for (const p of PAGES) {
    for (const empty of [false, true]) {
      it(`${p.name}, ${empty ? 'with nothing in it yet' : 'with data'}`, async () => {
        const page = await open(p.component, { role: p.role, empty });
        expect(page.text()).toMatch(p.heading);
        page.http.verify(); // no request left unanswered
      });
    }
  }
});

describe('the platform admin\'s switches change what each page offers', () => {
  const ADD_BUTTONS: { name: string; component: Type<unknown>; key: string; label: RegExp }[] = [
    { name: 'Combos', component: CombosComponent, key: 'action.combos.add', label: /New combo/ },
    { name: 'Referrals', component: ReferralsComponent, key: 'action.referrals.add', label: /New referrer/ },
    { name: 'Services', component: ServicesComponent, key: 'action.services.add', label: /Add service/ },
    { name: 'Team', component: TeamComponent, key: 'action.team.add', label: /Add team member/ },
  ];
  for (const b of ADD_BUTTONS) {
    it(`${b.name}: the add button is shown when on and gone when off`, async () => {
      const on = await open(b.component, { role: 'admin' });
      expect(on.text()).toMatch(b.label);
      TestBed.resetTestingModule();
      const off = await open(b.component, { role: 'admin', off: [b.key] });
      expect(off.text()).not.toMatch(b.label);
      expect(off.text()).toMatch(new RegExp(b.name)); // the page itself is still there
    });
  }

  it('sidebar: switched-off pages disappear, per role', async () => {
    const all = await open(ShellComponent, { role: 'admin' });
    for (const label of ['Dashboard', 'New bill', 'All bills', 'Customers', 'Services', 'Combos', 'Referrals', 'Team', 'Settings', 'My attendance', 'Staff attendance']) expect(all.text()).toContain(label);
    TestBed.resetTestingModule();

    const fewer = await open(ShellComponent, { role: 'admin', off: ['page.team', 'page.referrals', 'page.services'] });
    for (const gone of ['Team', 'Referrals', 'Services']) expect(fewer.text()).not.toContain(gone);
    for (const kept of ['Dashboard', 'Combos', 'Customers', 'Settings', 'New bill']) expect(fewer.text()).toContain(kept);
    TestBed.resetTestingModule();

    const staff = await open(ShellComponent, { role: 'staff' });
    for (const kept of ['New bill', 'My bills', 'Customers', 'Attendance']) expect(staff.text()).toContain(kept);
    for (const gone of ['Dashboard', 'Combos', 'Team', 'Settings', 'Parlours']) expect(staff.text()).not.toContain(gone);
    TestBed.resetTestingModule();

    const platform = await open(ShellComponent, { role: 'super_admin' });
    expect(platform.text()).toContain('Parlours');
    expect(platform.text()).toContain('Platform admin');
    for (const gone of ['Dashboard', 'New bill', 'Team']) expect(platform.text()).not.toContain(gone);
  });

  it('the home page for an admin follows the Dashboard switch', async () => {
    const withDash = await open(ShellComponent, { role: 'admin' });
    expect(withDash.auth.homePath()).toBe('/admin/dashboard');
    TestBed.resetTestingModule();
    const without = await open(ShellComponent, { role: 'admin', off: ['page.dashboard'] });
    expect(without.auth.homePath()).toBe('/admin/new-bill');
  });
});

describe('sign in', () => {
  it('has no sign-up link', async () => {
    const page = await open(LoginComponent);
    expect(page.text()).not.toMatch(/create (an )?account|register|sign up/i);
    expect(page.text()).toMatch(/Need access/);
  });
});

describe('forms open and work', () => {
  const FORMS: { name: string; component: Type<unknown>; role: Role; button: RegExp; expectText: RegExp }[] = [
    { name: 'new combo', component: CombosComponent, role: 'admin', button: /New combo/, expectText: /Services in this combo/ },
    { name: 'new referrer', component: ReferralsComponent, role: 'admin', button: /New referrer/, expectText: /Referral percentage/ },
    { name: 'new service', component: ServicesComponent, role: 'admin', button: /Add service/, expectText: /Duration \(minutes\)/ },
    { name: 'new team member', component: TeamComponent, role: 'admin', button: /Add team member/, expectText: /Temporary password/ },
    { name: 'new customer', component: CustomersComponent, role: 'admin', button: /Add customer/, expectText: /Notes/ },
    { name: 'new parlour', component: ParloursComponent, role: 'super_admin', button: /New parlour/, expectText: /Pages and buttons/ },
  ];
  for (const f of FORMS) {
    it(`${f.name} opens`, async () => {
      const page = await open(f.component, { role: f.role });
      await page.click(f.button);
      expect(html(page, 'dialog[open]')).not.toBeNull();
      expect(page.text()).toMatch(f.expectText);
    });
  }

  it('adding a referrer shows the generated referral ID', async () => {
    const page = await open(ReferralsComponent, { role: 'admin' });
    await page.click(/New referrer/);
    await page.type('#r-name', 'New Person');
    await page.type('#r-contact', '9841100077');
    await page.type('#r-percent', '12.5');
    await page.click(/Add referrer/);
    const req = page.expectOne('POST', '/referrers');
    expect(req.request.body).toEqual({ name: 'New Person', contact: '9841100077', percent: 12.5 });
    req.flush({ data: { id: 'r9', code: 'REF-0003', name: 'New Person', contact: '9841100077', percent: 12.5, isActive: true, createdAt: '2026-10-18', bills: 0, totalDiscount: 0, lastUsedAt: null, canDelete: true } });
    await page.settle();
    expect(page.text()).toContain('REF-0003');
    expect(page.text()).toMatch(/Give this ID to New Person/);
  });

  it('a combo shows what the customer saves while it is being built', async () => {
    const page = await open(CombosComponent, { role: 'admin' });
    await page.click(/New combo/);
    const select = html(page, 'select') as HTMLSelectElement;
    select.value = 's2'; select.dispatchEvent(new Event('change')); await page.settle(); // Facial 500
    await page.click(/^\s*Add\s*$/);
    select.value = 's1'; select.dispatchEvent(new Event('change')); await page.settle(); // Haircut 200
    await page.click(/^\s*Add\s*$/);
    await page.type('#cb-price', '600');
    expect(page.text()).toMatch(/Separately\s*₹700\.00/);
    expect(page.text()).toMatch(/Customer saves\s*₹100\.00/);
  });
});

describe('the billing screen', () => {
  it('adds a service, applies a referral and an extra discount, and the total matches the server maths (₹892.50)', async () => {
    const page = await open(NewBillComponent, { role: 'admin' });
    await page.click(/Massage/);                                   // ₹1,000
    await page.type('input[aria-label="Referral name or ID"]', 'ani');
    await sleep(350);                                              // the search waits a moment after typing
    await page.settle();
    await page.click(/Anita Rao/);                                 // 10% referral
    await page.type('#discount', '50');
    expect(page.text()).toContain('Referral discount (10%)');
    expect(page.text()).toContain('₹100.00');
    expect(page.text()).toContain('₹892.50');                      // 1000 − 100 − 50 = 850, + 5% GST (42.50)

    await page.click(/Save bill/);
    const req = page.expectOne('POST', '/invoices');
    expect(req.request.body).toEqual({ customerId: null, items: [{ serviceId: 's3', quantity: 1 }], referrerId: 'r1', discount: 50, paymentMethod: 'cash' });
  });

  it('adds a combo as one line and sends it as a combo', async () => {
    const page = await open(NewBillComponent, { role: 'staff' });
    expect(page.text()).not.toContain('Broken Pack');              // a combo with an archived service is never offered
    await page.click(/^\s*Combos/);
    await page.click(/Glow Pack/);
    expect(page.text()).toContain('Haircut + Facial');
    expect(page.text()).toContain('₹630');                         // 600 + 5% GST
    await page.click(/Save bill/);
    expect(page.expectOne('POST', '/invoices').request.body.items).toEqual([{ comboId: 'c1', quantity: 1 }]);
  });

  it('hides the referral box, the customer search and the combos tab when those are switched off', async () => {
    const page = await open(NewBillComponent, { role: 'staff', off: ['page.referrals', 'page.customers', 'page.combos'] });
    expect(html(page, 'input[aria-label="Referral name or ID"]')).toBeNull();
    expect(html(page, 'input[aria-label="Search customer"]')).toBeNull();
    expect(page.text()).not.toMatch(/Combos/);
    await page.click(/Massage/);
    expect(page.text()).toContain('₹1,050');                       // services still bill normally
  });
});

describe('a saved bill', () => {
  const fakeWindow = () => {
    const win = { location: { href: '' }, close: jest.fn(), opener: {} as unknown };
    jest.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
    return win;
  };
  afterEach(() => jest.restoreAllMocks());

  it('shows the combo contents and the referral discount', async () => {
    const page = await open(InvoiceDetailComponent, { role: 'admin' });
    expect(page.text()).toContain('Glow Pack');
    expect(page.text()).toContain('Haircut + Facial');
    expect(page.text()).toContain('Referral discount (Anita Rao, 10%)');
  });

  it('WhatsApp: uses the saved number and opens the link the server builds', async () => {
    const win = fakeWindow();
    const page = await open(InvoiceDetailComponent, { role: 'staff' });
    await page.click(/WhatsApp/);
    const req = page.expectOne('GET', '/whatsapp');
    expect(req.request.params.has('phone')).toBe(false);
    req.flush({ data: { url: 'https://wa.me/919000000005?text=Hello', message: 'Hello', phone: '919000000005' } });
    await page.settle();
    expect(win.location.href).toBe('https://wa.me/919000000005?text=Hello');
  });

  it('WhatsApp: a customer with no saved number is asked for one first', async () => {
    const win = fakeWindow();
    const page = await open(InvoiceDetailComponent, { role: 'staff', invoicePhone: null });
    await page.click(/WhatsApp/);
    expect(page.text()).toContain('no saved number');
    page.http.expectNone((r) => r.url.includes('/whatsapp'));       // nothing is sent until a number is entered
    await page.type('#wa-phone', '98400 12345');
    await page.click(/Open WhatsApp/);
    const req = page.expectOne('GET', '/whatsapp');
    expect(req.request.params.get('phone')).toBe('98400 12345');
    req.flush({ data: { url: 'https://wa.me/919840012345?text=Hi', message: 'Hi', phone: '919840012345' } });
    await page.settle();
    expect(win.location.href).toContain('919840012345');
  });

  it('WhatsApp: a bad number from the server is shown on the form', async () => {
    fakeWindow();
    const page = await open(InvoiceDetailComponent, { role: 'staff', invoicePhone: null });
    await page.click(/WhatsApp/);
    await page.type('#wa-phone', '123');
    await page.click(/Open WhatsApp/);
    page.expectOne('GET', '/whatsapp').flush({ error: { code: 'INVALID_PHONE', message: 'That does not look like a valid phone number' } }, { status: 400, statusText: 'Bad Request' });
    await page.settle();
    expect(page.text()).toContain('does not look like a valid phone number');
  });

  it('WhatsApp button follows its switch; only admins can void', async () => {
    const off = await open(InvoiceDetailComponent, { role: 'admin', off: ['action.whatsapp.send'] });
    expect(off.text()).not.toContain('WhatsApp');
    expect(off.text()).toContain('Void bill');
    TestBed.resetTestingModule();
    const staff = await open(InvoiceDetailComponent, { role: 'staff' });
    expect(staff.text()).toContain('WhatsApp');
    expect(staff.text()).not.toContain('Void bill');
  });
});

describe('the bills list', () => {
  it('admins can filter by who made the bill; staff do not get the filter', async () => {
    const admin = await open(InvoicesComponent, { role: 'admin' });
    expect(admin.text()).toContain('Made by');
    const select = [...admin.host.querySelectorAll('select')].find((s) => s.textContent?.includes('Everyone')) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual(['Everyone', 'Riya', 'Farah']);
    select.value = 'u1'; select.dispatchEvent(new Event('change'));
    await admin.settle();
    // the list was asked again, this time for that person's bills only
    TestBed.resetTestingModule();
    const staff = await open(InvoicesComponent, { role: 'staff' });
    expect(staff.text()).not.toContain('Made by');
  });
});

describe('the platform admin\'s parlour page', () => {
  it('flipping a switch marks the change as unsaved, and saving sends it', async () => {
    const page = await open(ParlourDetailComponent, { role: 'super_admin' });
    expect(page.text()).toContain('Saved. Takes effect immediately.');
    const switches = [...page.host.querySelectorAll('[role="switch"]')] as HTMLElement[];
    expect(switches.length).toBe(16);
    expect(switches.some((s) => s.getAttribute('aria-checked') === 'false')).toBe(true); // Team is off in the sample parlour
    const combos = switches.find((s) => document.getElementById(s.getAttribute('aria-labelledby') ?? '')?.textContent === 'Combos')!;
    combos.click();
    await page.settle();
    expect(page.text()).toContain('You have unsaved changes');
    await page.click(/Save access/);
    const req = page.expectOne('PATCH', '/platform/parlours/');
    expect(req.request.body.features['page.combos']).toBe(false);
    expect(req.request.body.features['page.referrals']).toBe(true);
  });

  it('deleting asks for the parlour\'s name first', async () => {
    const page = await open(ParlourDetailComponent, { role: 'super_admin' });
    await page.click(/^\s*Delete\s*$/);
    const del = [...page.host.querySelectorAll('button')].find((b) => /Delete permanently/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    await page.type('#d-confirm', 'glow salon');
    expect(del.disabled).toBe(false);
  });
});

describe('the Team page', () => {
  const buttons = (page: { host: HTMLElement }) => [...page.host.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());

  it('shows each member\'s mobile number, or says there is none', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    expect(page.text()).toContain('9840011111');
    expect(page.text()).toContain('No mobile number');
  });

  it('adding a member asks for a mobile number first, and sends it', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    await page.click(/Add team member/);
    await page.click(/Add member/);                         // nothing filled in yet
    expect(page.text()).toContain('Enter a mobile number');
    page.http.expectNone((r) => r.method === 'POST');

    await page.type('#a-name', 'Priya');
    await page.type('#a-email', 'priya@x.test');
    await page.type('#a-mobile', '12');
    await page.type('#a-pass', 'Secret123');
    await page.click(/Add member/);
    expect(page.text()).toContain('Enter a valid mobile number');
    page.http.expectNone((r) => r.method === 'POST');

    await page.type('#a-mobile', '98400 12345');
    await page.click(/Add member/);
    expect(page.expectOne('POST', '/staff').request.body).toEqual({ name: 'Priya', email: 'priya@x.test', mobile: '98400 12345', password: 'Secret123', role: 'staff' });
  });

  it('editing shows the current number and sends the new one', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    const edits = [...page.host.querySelectorAll('button')].filter((b) => (b.textContent ?? '').trim() === 'Edit');
    edits[1].click();                                       // Riya, who has a number
    await page.settle();
    expect((html(page, '#e-mobile') as HTMLInputElement).value).toBe('9840011111');
    await page.type('#e-mobile', '9840099999');
    await page.click(/Save changes/);
    expect(page.expectOne('PATCH', '/staff/u2').request.body).toEqual({ name: 'Riya', mobile: '9840099999', role: 'staff' });
  });

  const ROW_BUTTONS: { name: string; key: string; label: RegExp }[] = [
    { name: 'Edit', key: 'action.team.edit', label: /^Edit$/ },
    { name: 'Reset password', key: 'action.team.reset', label: /^Reset password$/ },
    { name: 'Deactivate', key: 'action.team.deactivate', label: /^Deactivate$/ },
  ];
  for (const b of ROW_BUTTONS) {
    it(`the ${b.name} button follows its own switch and nothing else`, async () => {
      const on = await open(TeamComponent, { role: 'admin' });
      for (const other of ROW_BUTTONS) expect(buttons(on).some((t) => other.label.test(t))).toBe(true);
      TestBed.resetTestingModule();

      const off = await open(TeamComponent, { role: 'admin', off: [b.key] });
      expect(buttons(off).some((t) => b.label.test(t))).toBe(false);
      for (const other of ROW_BUTTONS.filter((o) => o !== b)) expect(buttons(off).some((t) => other.label.test(t))).toBe(true);
      expect(off.text()).toMatch(/Add team member/); // the page and its Add button are unaffected
    });
  }

  it('the Deactivate switch also hides Reactivate', async () => {
    const page = await open(TeamComponent, { role: 'admin' });
    expect(buttons(page)).toContain('Reactivate');
    TestBed.resetTestingModule();
    const off = await open(TeamComponent, { role: 'admin', off: ['action.team.deactivate'] });
    expect(buttons(off)).not.toContain('Reactivate');
  });
});

describe('the platform admin sees the Team button switches', () => {
  it('lists Edit, Reset password and Deactivate, tied to the Team page', async () => {
    const page = await open(ParlourDetailComponent, { role: 'super_admin' });
    for (const label of ['Edit team member button', 'Reset password button', 'Deactivate / Reactivate button']) expect(page.text()).toContain(label);
    expect(page.text()).toContain('Unavailable while the Team page is off.'); // the sample parlour has Team off
  });
});
