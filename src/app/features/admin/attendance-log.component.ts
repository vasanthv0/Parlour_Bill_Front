import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AttendanceApi } from '../../core/api';
import { formatDistance, formatTime, formatWorked, mapUrl } from '../../core/attendance-format';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { GeoError, GeoFailure } from '../../core/geo-capture';
import { GeolocationService } from '../../core/geolocation.service';
import { AttendancePunch, AttendanceRecord, AttendanceSettings, TodayAttendance } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';

/** A latitude or longitude typed or pasted as plain decimal degrees, e.g. 13.082700. */
const coordinate = (min: number, max: number): ValidatorFn => (c: AbstractControl): ValidationErrors | null => {
  const raw = String(c.value ?? '').trim();
  if (!raw) return null; // `required` reports the empty case
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return { pattern: true };
  const n = Number(raw);
  if (n < min) return { min: { min, actual: n } };
  if (n > max) return { max: { max, actual: n } };
  return null;
};

/** Google Maps, Apple Maps and most map sites copy a place as "13.0827, 80.2707". */
const PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;

const LOCATE_PROBLEMS: Record<GeoFailure, string> = {
  denied: 'Location access is blocked for this site. Allow it in your browser settings, or paste the coordinates from a map instead.',
  unavailable: 'This device could not find its location. Turn on Location Services, or paste the coordinates from a map instead.',
  timeout: 'Finding the location took too long. Try again near a window, or paste the coordinates from a map instead.',
  insecure: 'Browsers only share location on https:// pages. Open this app using its https address.',
  unsupported: 'This browser cannot share its location. Paste the coordinates from a map instead.',
};

@Component({
  selector: 'app-attendance-log',
  imports: [DatePipe, ReactiveFormsModule, IconComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Staff attendance</h1><p class="sub">Tell the app where your salon is, then see who has checked in and out.</p></div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 360px"></div>
      } @else if (loadError()) {
        <div class="panel empty"><h3>Could not load attendance</h3><p>{{ loadError() }}</p><button type="button" class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else {

        <!-- Salon location -->
        <form class="panel" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="panel-head">
            <h2>Salon location</h2>
            @if (settings()?.configured) {
              <span class="badge badge-paid">Set · updated {{ settings()?.updatedAt | date: 'd MMM y, h:mm a' }}</span>
            } @else { <span class="badge badge-warn">Not set yet</span> }
          </div>
          <div class="panel-body stack">
            @if (!settings()?.configured) {
              <p class="muted">Staff cannot check in until you set this. The easiest way: stand at the salon entrance with your phone, open this page and press <strong>Use my current location</strong>.</p>
            }
            @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }

            <div>
              <button type="button" class="btn btn-secondary" [disabled]="locating()" (click)="useMyLocation()"><app-icon name="locate" /> {{ locating() ? 'Finding your location…' : 'Use my current location' }}</button>
              @if (fix() !== null) {
                <p class="hint" role="status" style="margin-top: 8px">
                  Location captured, accurate to about ±{{ fix() }} m.
                  @if ((fix() ?? 0) > 30) { <strong>That is rather vague</strong> – try again outdoors or near a window, or paste coordinates from a map. }
                </p>
              }
              @if (locateError()) { <p class="field-error" role="alert" style="margin-top: 8px">{{ locateError() }}</p> }
            </div>

            <div class="form-grid">
              <div class="field" [class.invalid]="err('latitude')">
                <label class="label" for="lat">Latitude</label>
                <input id="lat" class="input" inputmode="decimal" formControlName="latitude" autocomplete="off" placeholder="13.082700" />
                @if (err('latitude'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">Between -90 and 90.</span> }
              </div>
              <div class="field" [class.invalid]="err('longitude')">
                <label class="label" for="lng">Longitude</label>
                <input id="lng" class="input" inputmode="decimal" formControlName="longitude" autocomplete="off" placeholder="80.270700" />
                @if (err('longitude'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">Between -180 and 180.</span> }
              </div>
            </div>
            <p class="hint">Working from a computer? Find your salon on any map, right-click it, click the coordinates to copy them, and paste them into the Latitude box: both boxes fill in.</p>

            <div class="form-grid">
              <div class="field" [class.invalid]="err('radiusM')">
                <label class="label" for="radius">Allowed distance (metres)</label>
                <input id="radius" class="input" type="number" inputmode="numeric" min="20" max="500" formControlName="radiusM" />
                @if (err('radiusM'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">Staff must be this close to check in or out. Default 100.</span> }
              </div>
              <div class="field" [class.invalid]="err('maxAccuracyM')">
                <label class="label" for="acc">Weakest GPS accepted (± metres)</label>
                <input id="acc" class="input" type="number" inputmode="numeric" min="10" max="100" formControlName="maxAccuracyM" />
                @if (err('maxAccuracyM'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">Default 50. Raise it (up to 100) if staff are often told their signal is too weak indoors.</span> }
              </div>
            </div>
          </div>
          <div class="panel-head" style="border-top: 1px solid var(--line); border-bottom: 0; justify-content: flex-end">
            <button type="submit" class="btn btn-primary" [disabled]="busy() || form.pristine">{{ busy() ? 'Saving…' : 'Save location' }}</button>
          </div>
        </form>

        <!-- Who came in -->
        <section class="panel" style="margin-top: 24px">
          <div class="panel-head">
            <h2>Who checked in</h2>
            <div class="date-pick">
              <label class="label" for="day">Date</label>
              <input id="day" #day type="date" class="input" [value]="date()" [max]="today()?.workDate ?? ''" (change)="setDate(day.value)" />
            </div>
          </div>
          @if (rowsError()) {
            <div class="panel-body"><div class="form-alert" role="alert">{{ rowsError() }}</div></div>
          } @else if (rowsLoading()) {
            <div class="panel-body"><div class="skeleton" style="height: 120px"></div></div>
          } @else if (!rows().length) {
            <div class="empty"><h3>No one checked in on this date</h3><p>People who check in will appear here with their times and how far from the salon they were.</p></div>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Staff</th><th>Checked in</th><th>Checked out</th><th>Time worked</th><th>Status</th></tr></thead>
                <tbody>
                  @for (r of rows(); track r.id) {
                    <tr>
                      <td><strong>{{ r.userName }}</strong></td>
                      <td>{{ time(r.checkIn.at) }}<div class="muted small">{{ detail(r.checkIn) }} · <a [href]="map(r.checkIn)" target="_blank" rel="noopener">map</a></div></td>
                      <td>
                        @if (r.checkOut; as o) { <span>{{ time(o.at) }}</span><div class="muted small">{{ detail(o) }} · <a [href]="map(o)" target="_blank" rel="noopener">map</a></div> }
                        @else { <span class="muted">—</span> }
                      </td>
                      <td class="num">{{ worked(r) || '—' }}</td>
                      <td><span class="badge" [class.badge-paid]="r.status === 'checked_in'">{{ r.status === 'checked_in' ? 'In' : 'Done' }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (total() > rows().length) { <p class="hint" style="padding: 12px 20px">Showing the first {{ rows().length }} of {{ total() }}.</p> }
          }
        </section>
      }
    </div>`,
  styles: [`
    .date-pick { display: flex; align-items: center; gap: 10px; }
    .date-pick .input { width: auto; }
  `],
})
export class AttendanceLogComponent {
  private readonly api = inject(AttendanceApi);
  private readonly geolocation = inject(GeolocationService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly today = signal<TodayAttendance | null>(null);
  protected readonly settings = signal<AttendanceSettings | null>(null);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly locating = signal(false);
  protected readonly locateError = signal('');
  /** Accuracy (± metres) of the last "use my location" capture. */
  protected readonly fix = signal<number | null>(null);

  protected readonly date = signal('');
  protected readonly rows = signal<AttendanceRecord[]>([]);
  protected readonly total = signal(0);
  protected readonly rowsLoading = signal(false);
  protected readonly rowsError = signal('');

  protected readonly form = this.fb.group({
    latitude: ['', [Validators.required, coordinate(-90, 90)]],
    longitude: ['', [Validators.required, coordinate(-180, 180)]],
    radiusM: [100, [Validators.required, Validators.min(20), Validators.max(500)]],
    maxAccuracyM: [50, [Validators.required, Validators.min(10), Validators.max(100)]],
  });

  constructor() {
    // Pasting "13.0827, 80.2707" into the latitude box fills both boxes.
    this.form.controls.latitude.valueChanges.pipe(takeUntilDestroyed()).subscribe((v: string) => {
      const m = PAIR.exec(v);
      if (m && /[,;\s]/.test(v.trim())) this.form.patchValue({ latitude: m[1], longitude: m[2] }, { emitEvent: false });
    });
    this.load();
  }

  protected err(name: string) {
    return controlError(this.form.get(name), { required: 'Required', pattern: 'Enter a number such as 13.082700' });
  }

  protected load() {
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({ today: this.api.today(), settings: this.api.settings() }).subscribe({
      next: ({ today, settings }) => {
        this.today.set(today);
        this.settings.set(settings);
        this.fill(settings);
        this.date.set(today.workDate);
        this.loading.set(false);
        this.loadRecords();
      },
      error: (e) => { this.loadError.set(parseError(e).message); this.loading.set(false); },
    });
  }

  private fill(s: AttendanceSettings) {
    this.form.reset({
      latitude: s.latitude === null ? '' : String(s.latitude),
      longitude: s.longitude === null ? '' : String(s.longitude),
      radiusM: s.radiusM,
      maxAccuracyM: s.maxAccuracyM,
    });
  }

  protected async useMyLocation() {
    this.locating.set(true);
    this.locateError.set('');
    this.fix.set(null);
    try {
      const r = await this.geolocation.getBestPosition(15, 20_000);
      this.form.patchValue({ latitude: r.latitude.toFixed(6), longitude: r.longitude.toFixed(6) });
      this.form.markAsDirty();
      this.fix.set(Math.round(r.accuracy));
    } catch (e) {
      this.locateError.set(LOCATE_PROBLEMS[e instanceof GeoError ? e.kind : 'unavailable']);
    }
    this.locating.set(false);
  }

  protected save() {
    this.error.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.api.saveSettings({ latitude: Number(v.latitude), longitude: Number(v.longitude), radiusM: Number(v.radiusM), maxAccuracyM: Number(v.maxAccuracyM) }).subscribe({
      next: (s) => { this.busy.set(false); this.settings.set(s); this.fill(s); this.fix.set(null); this.toast.success('Salon location saved'); },
      error: (e) => { this.busy.set(false); const info = parseError(e); if (!applyFieldErrors(this.form, info)) this.error.set(info.message); },
    });
  }

  protected setDate(value: string) {
    if (!value) return; // cleared with the date picker's own button: keep what is showing
    this.date.set(value);
    this.loadRecords();
  }

  private loadRecords() {
    const day = this.date();
    this.rowsLoading.set(true);
    this.rowsError.set('');
    this.api.records({ from: day, to: day, limit: 100 }).subscribe({
      next: (page) => { this.rows.set(page.items); this.total.set(page.meta.total); this.rowsLoading.set(false); },
      error: (e) => { this.rowsError.set(parseError(e).message); this.rowsLoading.set(false); },
    });
  }

  // ── display helpers ──
  protected time(iso: string) { return formatTime(iso, this.today()?.timezone); }
  protected worked(r: AttendanceRecord) { return formatWorked(r.checkIn.at, r.checkOut?.at); }
  protected map(p: AttendancePunch) { return mapUrl(p.latitude, p.longitude); }
  protected detail(p: AttendancePunch) { return `${formatDistance(p.distanceM)} away · ${p.deviceType === 'shared' ? 'shared tablet' : 'own phone'}`; }
}
