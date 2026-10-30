import { TestBed } from '@angular/core/testing';
import { AttendanceLogComponent } from './features/admin/attendance-log.component';
import { ShellComponent } from './features/shell/shell.component';
import { AttendanceComponent } from './features/shared/attendance.component';
import { Page, installDomShims, open } from './testing/harness';

jest.setTimeout(30000);
beforeAll(installDomShims);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───────────── a pretend browser Geolocation API ─────────────
// jsdom has none. This answers every request with one fixed reading (or a "denied"), a moment later, like a phone would.
type Fix = { accuracy: number; latitude?: number; longitude?: number } | 'denied';
function useLocation(fix: Fix) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (ok: (p: unknown) => void, fail: (e: { code: number }) => void) => {
        setTimeout(() => (fix === 'denied'
          ? fail({ code: 1 })
          : ok({ coords: { latitude: fix.latitude ?? 13.0827, longitude: fix.longitude ?? 80.2707, accuracy: fix.accuracy }, timestamp: Date.now() })), 0);
        return 1;
      },
      clearWatch: () => undefined,
    },
  });
}
beforeEach(() => localStorage.clear()); // the shared-tablet choice is remembered on the device: do not let it leak between tests
afterEach(() => { Reflect.deleteProperty(navigator, 'geolocation'); });

/** Waits for the app to make a (non-GET) request, answers it, and lets the screen update. */
async function answer(page: Page, method: string, urlPart: string, body: object, opts?: { status: number; statusText: string }) {
  for (let i = 0; i < 60; i++) {
    const [req] = page.http.match((r) => r.method === method && r.url.includes(urlPart));
    if (req) { req.flush(body, opts); await page.settle(); return req; }
    await sleep(10);
  }
  throw new Error(`The app never sent ${method} ${urlPart}. Screen says: ${page.text().slice(0, 300)}`);
}

const verdict = (v: 'ok' | 'out_of_range' | 'inaccurate' | 'stale', distanceM: number, accuracyM = 12) =>
  ({ data: { verdict: v, withinRadius: distanceM <= 100, distanceM, radiusM: 100, accuracyM, maxAccuracyM: 50 } });
const checkedIn = {
  data: {
    workDate: '2026-10-29', timezone: 'Asia/Kolkata', configured: true, radiusM: 100, maxAccuracyM: 50,
    record: { id: 'r1', userId: 'u1', workDate: '2026-10-29', status: 'checked_in',
      checkIn: { at: '2026-10-29T03:32:00.000Z', latitude: 13.0829, longitude: 80.2709, accuracyM: 12, distanceM: 50, deviceType: 'personal' }, checkOut: null },
  },
};
const checkedOut = {
  data: { ...checkedIn.data, record: { ...checkedIn.data.record, status: 'checked_out',
    checkOut: { at: '2026-10-29T12:45:00.000Z', latitude: 13.0826, longitude: 80.2706, accuracyM: 9, distanceM: 22, deviceType: 'personal' } } },
};

const button = (page: Page, label: RegExp) =>
  [...page.host.querySelectorAll('button')].find((b) => label.test(b.textContent ?? '')) as HTMLButtonElement;

describe('the attendance screen', () => {
  it('inside the radius: shows the distance, enables Check in, and sends a fresh reading with no identity in it', async () => {
    useLocation({ accuracy: 12 });
    const page = await open(AttendanceComponent, { role: 'staff' });
    await answer(page, 'POST', '/attendance/location-check', verdict('ok', 50));

    expect(page.text()).toContain('You are at the salon');
    expect(page.text()).toContain('50 m');
    expect(page.text()).toContain('Not checked in');
    expect(button(page, /Present/).disabled).toBe(false);
    expect(button(page, /Check out/).disabled).toBe(true);

    await page.click(/Present/);
    const req = await answer(page, 'POST', '/attendance/check-in', checkedIn);
    const body = req.request.body;
    expect(body.latitude).toBeCloseTo(13.0827);
    expect(body.longitude).toBeCloseTo(80.2707);
    expect(body.accuracy).toBe(12);
    expect(typeof body.capturedAt).toBe('number');
    expect(body.deviceType).toBe('personal');
    expect(body.password).toBeUndefined();
    expect(body.userId).toBeUndefined(); // who is acting comes from the token, never from the screen
    expect(body.parlourId).toBeUndefined();

    // Today's status now shows the check-in time in the salon's time zone (9:02 AM in Chennai)
    expect(page.text()).toMatch(/9:02\sAM/);
    expect(page.text()).toContain('Checked in');
    expect(button(page, /Present/).disabled).toBe(true);
    expect(button(page, /Check out/).disabled).toBe(false);
    page.http.verify();
  });

  it('check out: sends the reading and then shows both times and the time worked', async () => {
    useLocation({ accuracy: 9 });
    const page = await open(AttendanceComponent, { role: 'staff' });
    await answer(page, 'POST', '/attendance/location-check', verdict('ok', 50));
    await page.click(/Present/);
    await answer(page, 'POST', '/attendance/check-in', checkedIn);

    await page.click(/Check out/);
    const req = await answer(page, 'POST', '/attendance/check-out', checkedOut);
    expect(req.request.body.accuracy).toBe(9);
    expect(page.text()).toMatch(/9:02\sAM/);
    expect(page.text()).toMatch(/6:15\sPM/);
    expect(page.text()).toContain('9h 13m');
    expect(page.text()).toContain('Checked out');
    expect(button(page, /Present/).disabled).toBe(true);
    expect(button(page, /Check out/).disabled).toBe(true);
  });

  it('outside the radius: says how far away, disables both buttons and explains why', async () => {
    useLocation({ accuracy: 10 });
    const page = await open(AttendanceComponent, { role: 'staff' });
    await answer(page, 'POST', '/attendance/location-check', verdict('out_of_range', 250));

    expect(page.text()).toContain('You are too far from the salon');
    expect(page.text()).toContain('250 m away');
    expect(page.text()).toMatch(/within 100 m/);
    expect(button(page, /Present/).disabled).toBe(true);
    expect(button(page, /Check out/).disabled).toBe(true);
    page.http.verify(); // nothing was sent to check in
  });

  it('inaccurate GPS: says the signal is too weak and keeps the buttons off', async () => {
    useLocation({ accuracy: 10 });
    const page = await open(AttendanceComponent, { role: 'staff' });
    await answer(page, 'POST', '/attendance/location-check', verdict('inaccurate', 30, 120));

    expect(page.text()).toContain('Your GPS signal is too weak');
    expect(page.text()).toContain('±120 m');
    expect(page.text()).toContain('±50 m or better');
    expect(button(page, /Present/).disabled).toBe(true);
  });

  it('location permission denied: explains how to allow it, never asks the server, buttons stay off', async () => {
    useLocation('denied');
    const page = await open(AttendanceComponent, { role: 'staff' });
    await sleep(40);
    await page.settle();

    expect(page.text()).toContain('Location access is blocked');
    expect(page.text()).toMatch(/Allow/);
    expect(button(page, /Present/).disabled).toBe(true);
    expect(button(page, /Refresh location/).disabled).toBe(false);
    page.http.verify(); // no location-check request: there was no location to send
  });

  it('a browser with no location support says so', async () => {
    const page = await open(AttendanceComponent, { role: 'staff' }); // no fake installed
    await sleep(40);
    await page.settle();
    expect(page.text()).toContain('This browser cannot share its location');
  });

  it('Refresh location asks again, and the new answer replaces the old one', async () => {
    useLocation({ accuracy: 10 });
    const page = await open(AttendanceComponent, { role: 'staff' });
    await answer(page, 'POST', '/attendance/location-check', verdict('out_of_range', 250));
    expect(page.text()).toContain('too far');

    await page.click(/Refresh location/);
    await answer(page, 'POST', '/attendance/location-check', verdict('ok', 40));
    expect(page.text()).toContain('You are at the salon');
    expect(button(page, /Present/).disabled).toBe(false);
  });

  it('before an admin sets the salon location: explains, and does not ask for a location at all', async () => {
    useLocation({ accuracy: 10 });
    const page = await open(AttendanceComponent, { role: 'staff', empty: true });
    await sleep(40);
    await page.settle();
    expect(page.text()).toContain('The salon location has not been set');
    expect(button(page, /Present/).disabled).toBe(true);
    page.http.verify();
  });

  it('the server can still say no at the moment of check-in (the screen is only a convenience): its message is shown and the location is re-checked', async () => {
    useLocation({ accuracy: 10 });
    const page = await open(AttendanceComponent, { role: 'staff' });
    await answer(page, 'POST', '/attendance/location-check', verdict('ok', 50));

    await page.click(/Present/);
    await answer(page, 'POST', '/attendance/check-in',
      { error: { code: 'OUT_OF_RANGE', message: 'You are 250 m from the salon. You need to be within 100 m.' } },
      { status: 403, statusText: 'Forbidden' });
    expect(page.text()).toContain('You are 250 m from the salon. You need to be within 100 m.');
    // ...and it looked again, so the screen does not keep claiming "you are at the salon"
    await answer(page, 'POST', '/attendance/location-check', verdict('out_of_range', 250));
    expect(page.text()).toContain('You are too far from the salon');
    expect(button(page, /Present/).disabled).toBe(true);
  });

  it('pressing Refresh location clears an old "you are too far" error once the person has moved', async () => {
    useLocation({ accuracy: 10 });
    const page = await open(AttendanceComponent, { role: 'staff' });
    await answer(page, 'POST', '/attendance/location-check', verdict('ok', 50));
    await page.click(/Present/);
    await answer(page, 'POST', '/attendance/check-in',
      { error: { code: 'OUT_OF_RANGE', message: 'You are 250 m from the salon. You need to be within 100 m.' } },
      { status: 403, statusText: 'Forbidden' });
    await answer(page, 'POST', '/attendance/location-check', verdict('out_of_range', 250));
    expect(page.text()).toContain('You are 250 m from the salon. You need to be within 100 m.');

    await page.click(/Refresh location/);
    await answer(page, 'POST', '/attendance/location-check', verdict('ok', 40));
    expect(page.text()).not.toContain('You need to be within 100 m.');
    expect(page.text()).toContain('You are at the salon');
  });

  it('already checked in (e.g. on another device): the screen catches up instead of showing a stale state', async () => {
    useLocation({ accuracy: 10 });
    const page = await open(AttendanceComponent, { role: 'staff' });
    await answer(page, 'POST', '/attendance/location-check', verdict('ok', 50));
    await page.click(/Present/);
    await answer(page, 'POST', '/attendance/check-in',
      { error: { code: 'ALREADY_CHECKED_IN', message: 'You are already checked in for today.' } },
      { status: 409, statusText: 'Conflict' });
    expect(page.text()).toContain('You are already checked in for today.');
  });

  describe('on a shared salon tablet', () => {
    it('asks for the password first, and sends nothing until it is typed', async () => {
      useLocation({ accuracy: 10 });
      const page = await open(AttendanceComponent, { role: 'staff' });
      await answer(page, 'POST', '/attendance/location-check', verdict('ok', 50));
      expect(page.host.querySelector('#att-pass')).toBeNull(); // not on a personal phone

      await page.click(/Shared salon tablet/);
      expect(page.host.querySelector('#att-pass')).not.toBeNull();
      await page.click(/Present/);
      expect(page.text()).toContain('Enter your password to confirm it is you');
      page.http.verify(); // no check-in was sent
    });

    it('sends the password and device type, and shows a wrong password next to the box (without signing the person out)', async () => {
      useLocation({ accuracy: 10 });
      const page = await open(AttendanceComponent, { role: 'staff' });
      await answer(page, 'POST', '/attendance/location-check', verdict('ok', 50));
      await page.click(/Shared salon tablet/);
      await page.type('#att-pass', 'Not-right-1');
      await page.click(/Present/);
      const req = await answer(page, 'POST', '/attendance/check-in',
        { error: { code: 'WRONG_PASSWORD', message: 'Incorrect password', details: { password: 'Incorrect password' } } },
        { status: 400, statusText: 'Bad Request' });
      expect(req.request.body.deviceType).toBe('shared');
      expect(req.request.body.password).toBe('Not-right-1');
      expect(page.text()).toContain('Incorrect password');
      expect(page.auth.user()).not.toBeNull(); // still signed in
    });

    it('remembers that this device is the shared one', async () => {
      useLocation({ accuracy: 10 });
      const page = await open(AttendanceComponent, { role: 'staff' });
      await answer(page, 'POST', '/attendance/location-check', verdict('ok', 50));
      await page.click(/Shared salon tablet/);
      expect(localStorage.getItem('parlourbill.deviceType')).toBe('shared');
      await page.click(/My phone/);
      expect(localStorage.getItem('parlourbill.deviceType')).toBe('personal');
    });
  });
});

describe('the sidebar', () => {
  it('shows attendance for each role, and hides it when the platform admin switches it off', async () => {
    const admin = await open(ShellComponent, { role: 'admin' });
    expect(admin.text()).toContain('My attendance');
    expect(admin.text()).toContain('Staff attendance');
    TestBed.resetTestingModule();
    const staff = await open(ShellComponent, { role: 'staff' });
    expect(staff.text()).toContain('Attendance');
    expect(staff.text()).not.toContain('Staff attendance');
    TestBed.resetTestingModule();

    const offAdmin = await open(ShellComponent, { role: 'admin', off: ['page.attendance'] });
    expect(offAdmin.text()).not.toContain('My attendance');
    expect(offAdmin.text()).not.toContain('Staff attendance');
    TestBed.resetTestingModule();
    const offStaff = await open(ShellComponent, { role: 'staff', off: ['page.attendance'] });
    expect(offStaff.text()).not.toContain('Attendance');
  });
});

describe('the admin attendance page', () => {
  it('shows the saved location and who checked in, with times in the salon’s time zone', async () => {
    const page = await open(AttendanceLogComponent, { role: 'admin' });
    expect((page.host.querySelector('#lat') as HTMLInputElement).value).toBe('13.0827');
    expect((page.host.querySelector('#lng') as HTMLInputElement).value).toBe('80.2707');
    expect((page.host.querySelector('#radius') as HTMLInputElement).value).toBe('100');
    expect(page.text()).toContain('Riya');
    expect(page.text()).toContain('Farah');
    expect(page.text()).toMatch(/9:02\sAM/);
    expect(page.text()).toMatch(/6:15\sPM/);
    expect(page.text()).toContain('9h 13m');
    expect(page.text()).toContain('shared tablet');
  });

  it('with no location yet: says staff cannot check in, and the radius starts at the default of 100 m', async () => {
    const page = await open(AttendanceLogComponent, { role: 'admin', empty: true });
    expect(page.text()).toContain('Not set yet');
    expect(page.text()).toContain('Staff cannot check in until you set this');
    expect((page.host.querySelector('#radius') as HTMLInputElement).value).toBe('100');
  });

  it('"Use my current location" fills both boxes from the device', async () => {
    useLocation({ accuracy: 8, latitude: 13.0912341, longitude: 80.2812349 });
    const page = await open(AttendanceLogComponent, { role: 'admin', empty: true });
    await page.click(/Use my current location/);
    await sleep(30);
    await page.settle();
    expect((page.host.querySelector('#lat') as HTMLInputElement).value).toBe('13.091234');
    expect((page.host.querySelector('#lng') as HTMLInputElement).value).toBe('80.281235');
    expect(page.text()).toContain('±8 m');
  });

  it('pasting "latitude, longitude" copied from a map fills both boxes', async () => {
    const page = await open(AttendanceLogComponent, { role: 'admin', empty: true });
    await page.type('#lat', '13.0827, 80.2707');
    expect((page.host.querySelector('#lat') as HTMLInputElement).value).toBe('13.0827');
    expect((page.host.querySelector('#lng') as HTMLInputElement).value).toBe('80.2707');
  });

  it('saving sends numbers, and a value out of range is stopped before it is sent', async () => {
    const page = await open(AttendanceLogComponent, { role: 'admin', empty: true });
    await page.type('#lat', '95');
    await page.type('#lng', '80.2707');
    await page.click(/Save location/);
    expect(page.text()).toContain('Must be 90 or less');
    page.http.verify();

    await page.type('#lat', '13.0827');
    await page.click(/Save location/);
    const req = await answer(page, 'PUT', '/attendance/settings',
      { data: { configured: true, latitude: 13.0827, longitude: 80.2707, radiusM: 100, maxAccuracyM: 50, updatedAt: '2026-10-29T04:00:00.000Z' } });
    expect(req.request.body).toEqual({ latitude: 13.0827, longitude: 80.2707, radiusM: 100, maxAccuracyM: 50 });
    expect(page.text()).toContain('Set ·');
  });
});
