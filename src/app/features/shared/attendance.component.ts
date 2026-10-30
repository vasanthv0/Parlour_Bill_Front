import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AttendanceApi } from '../../core/api';
import {
  formatDistance,
  formatTime,
  formatWorked,
} from '../../core/attendance-format';
import { AuthService } from '../../core/auth.service';
import { DeviceModeService } from '../../core/device-mode.service';
import { parseError } from '../../core/errors';
import { GeoError, GeoFailure, GeoReading } from '../../core/geo-capture';
import { GeolocationService } from '../../core/geolocation.service';
import { LocationCheck, TodayAttendance } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';

/** Where the phone is, as far as this screen knows. The distance always comes from the server. */
type Where =
  | { kind: 'idle' }
  | { kind: 'locating' }
  | { kind: 'failed'; reason: GeoFailure }
  | { kind: 'measured'; check: LocationCheck }
  | { kind: 'unreachable'; message: string };

type Tone = 'ok' | 'warn' | 'bad' | 'info';
interface View {
  tone: Tone;
  icon: string;
  title: string;
  detail: string;
}

const FAILURES: Record<GeoFailure, Omit<View, 'tone'>> = {
  denied: {
    icon: 'ban',
    title: 'Location access is blocked',
    detail:
      'Allow location for this site: tap the lock icon next to the web address, choose Location → Allow, then press Refresh location. On an iPhone, also check Settings → Privacy → Location Services.',
  },
  unavailable: {
    icon: 'alert',
    title: 'Your device could not find its location',
    detail:
      'Turn on Location Services (GPS). Indoors, stand near a window. Then press Refresh location.',
  },
  timeout: {
    icon: 'alert',
    title: 'Finding your location took too long',
    detail:
      'Move near a window or outdoors, make sure GPS is on, and press Refresh location.',
  },
  insecure: {
    icon: 'shield',
    title: 'Location needs a secure connection',
    detail:
      'Open this app using its https:// address. Browsers do not share location on plain http pages.',
  },
  unsupported: {
    icon: 'alert',
    title: 'This browser cannot share its location',
    detail: 'Try the latest Chrome, Safari or Edge.',
  },
};

function measuredView(c: LocationCheck): View {
  if (c.verdict === 'ok') {
    return {
      tone: 'ok',
      icon: 'pin',
      title: 'You are at the salon',
      detail: `${formatDistance(c.distanceM)} from the salon, inside the ${c.radiusM} m limit. GPS accuracy ±${Math.round(c.accuracyM)} m.`,
    };
  }
  if (c.verdict === 'out_of_range') {
    return {
      tone: 'bad',
      icon: 'pin',
      title: 'You are too far from the salon',
      detail: `You are ${formatDistance(c.distanceM)} away. Check-in and check-out only work within ${c.radiusM} m. Move closer and press Refresh location.`,
    };
  }
  if (c.verdict === 'inaccurate') {
    return {
      tone: 'warn',
      icon: 'alert',
      title: 'Your GPS signal is too weak',
      detail: `Your device says its position could be off by ±${Math.round(c.accuracyM)} m, but ±${c.maxAccuracyM} m or better is needed. Step near a window or outdoors, turn on Wi-Fi and Location Services, then press Refresh location.`,
    };
  }
  return {
    tone: 'warn',
    icon: 'alert',
    title: 'Your device clock looks wrong',
    detail:
      'Set the date and time on your device to automatic, then press Refresh location.',
  };
}

function describe(w: Where, t: TodayAttendance): View {
  if (!t.configured) {
    return {
      tone: 'warn',
      icon: 'alert',
      title: 'The salon location has not been set',
      detail:
        'Ask your admin to set it under Staff attendance. Until then, attendance cannot be recorded.',
    };
  }
  if (w.kind === 'measured') return measuredView(w.check);
  if (w.kind === 'failed')
    return {
      tone: w.reason === 'denied' || w.reason === 'insecure' ? 'bad' : 'warn',
      ...FAILURES[w.reason],
    };
  if (w.kind === 'unreachable')
    return {
      tone: 'bad',
      icon: 'alert',
      title: 'Could not check your distance',
      detail: w.message,
    };
  return {
    tone: 'info',
    icon: 'locate',
    title: 'Finding your location…',
    detail:
      'Allow location access if your browser asks. This can take up to 15 seconds.',
  };
}

@Component({
  selector: 'app-attendance',
  imports: [ReactiveFormsModule, IconComponent],
  template: ` <div class="page narrow">
    <div class="page-head">
      <div>
        <h1>Attendance</h1>
        @if (today(); as t) {
          <p class="sub">{{ dayLabel(t.workDate) }}</p>
        } @else {
          <p class="sub">
            Check in when you arrive and check out when you leave.
          </p>
        }
      </div>
    </div>

    @if (loading()) {
      <div class="skeleton" style="height: 320px"></div>
    } @else if (loadError()) {
      <div class="panel empty">
        <h3>Could not load your attendance</h3>
        <p>{{ loadError() }}</p>
        <button type="button" class="btn btn-secondary" (click)="load()">
          Try again
        </button>
      </div>
    } @else {
      @if (today(); as t) {
        <!-- Where am I? -->
        <section
          class="panel where"
          [attr.data-tone]="view().tone"
          aria-labelledby="where-title"
        >
          <div class="panel-body where-body" role="status" aria-live="polite">
            <span class="where-icon" aria-hidden="true"
              ><app-icon [name]="view().icon" [size]="26"
            /></span>
            <div class="where-text">
              <h2 id="where-title">{{ view().title }}</h2>
              <p>{{ view().detail }}</p>
            </div>
          </div>
          @if (check(); as c) {
            <div class="panel-body stats">
              <div>
                <div class="muted small">Distance from salon</div>
                <div class="stat num">{{ distanceLabel(c.distanceM) }}</div>
              </div>
              <div>
                <div class="muted small">Allowed within</div>
                <div class="stat num">{{ c.radiusM }} m</div>
              </div>
              <div>
                <div class="muted small">GPS accuracy</div>
                <div class="stat num">±{{ roundM(c.accuracyM) }} m</div>
              </div>
            </div>
          }
          @if (t.configured) {
            <div class="panel-head foot">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                [disabled]="where().kind === 'locating' || !!busy()"
                (click)="manualRefresh()"
              >
                <app-icon name="locate" [size]="16" />
                {{
                  where().kind === 'locating' ? 'Locating…' : 'Refresh location'
                }}
              </button>
            </div>
          }
        </section>

        <!-- Which device is this? -->
        <section class="panel">
          <div class="panel-body stack">
            <div>
              <div class="label" id="device-label">This device is</div>
              <div
                class="segmented fill"
                role="group"
                aria-labelledby="device-label"
                style="margin-top: 8px"
              >
                <button
                  type="button"
                  [attr.aria-pressed]="device.mode() === 'personal'"
                  (click)="device.set('personal')"
                >
                  My phone
                </button>
                <button
                  type="button"
                  [attr.aria-pressed]="device.mode() === 'shared'"
                  (click)="device.set('shared')"
                >
                  Shared salon tablet
                </button>
              </div>
            </div>
            @if (device.mode() === 'shared') {
              <div class="field" [class.invalid]="passwordError()">
                <label class="label" for="att-pass">Your password</label>
                <input
                  id="att-pass"
                  class="input"
                  type="password"
                  autocomplete="current-password"
                  [formControl]="password"
                  (input)="passwordError.set('')"
                />
                @if (passwordError(); as m) {
                  <span class="field-error">{{ m }}</span>
                } @else {
                  <span class="hint"
                    >On a shared tablet, confirm it is you each time. You are
                    signed out afterwards so the next person can sign in.</span
                  >
                }
              </div>
            }
          </div>
        </section>

        <!-- Do it -->
        @if (actionError()) {
          <div class="form-alert" role="alert" style="margin-bottom: 16px">
            {{ actionError() }}
          </div>
        }
        <div class="actions">
          <button
            type="button"
            class="btn btn-primary btn-lg"
            [disabled]="!canCheckIn()"
            aria-describedby="why"
            (click)="act('in')"
          >
            <app-icon name="check" />
            {{ busy() === 'in' ? 'Checking in…' : 'Present / Check in' }}
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-lg"
            [disabled]="!canCheckOut()"
            aria-describedby="why"
            (click)="act('out')"
          >
            <app-icon name="logout" />
            {{ busy() === 'out' ? 'Checking out…' : 'Check out' }}
          </button>
        </div>
        @if (whyNot(); as why) {
          <p id="why" class="hint why">{{ why }}</p>
        }
        @if (signingOut()) {
          <p class="hint why" role="status">
            Done. Signing you out so the next person can use this device…
          </p>
        }

        <!-- Today -->
        <section class="panel today">
          <div class="panel-head">
            <h2>Today</h2>
            <span
              class="badge"
              [class.badge-paid]="record()?.status === 'checked_in'"
              >{{ statusLabel() }}</span
            >
          </div>
          <div class="panel-body times">
            @if (record(); as r) {
              <div>
                <div class="muted small">Checked in</div>
                <div class="stat">{{ time(r.checkIn.at) }}</div>
                <div class="muted small">
                  {{ distanceLabel(r.checkIn.distanceM) }} from salon ·
                  {{
                    r.checkIn.deviceType === 'shared'
                      ? 'shared tablet'
                      : 'own phone'
                  }}
                </div>
              </div>
              <div>
                <div class="muted small">Checked out</div>
                @if (r.checkOut; as o) {
                  <div class="stat">{{ time(o.at) }}</div>
                  <div class="muted small">
                    {{ distanceLabel(o.distanceM) }} from salon ·
                    {{
                      o.deviceType === 'shared' ? 'shared tablet' : 'own phone'
                    }}
                  </div>
                } @else {
                  <div class="stat muted">—</div>
                  <div class="muted small">Not yet</div>
                }
              </div>
              @if (worked(); as w) {
                <div>
                  <div class="muted small">Time worked</div>
                  <div class="stat">{{ w }}</div>
                </div>
              }
            } @else {
              <p class="muted" style="grid-column: 1 / -1">
                You have not checked in today.
              </p>
            }
          </div>
        </section>
      }
    }
  </div>`,
  styles: [
    `
      .narrow {
        max-width: 680px;
      }
      .panel {
        margin-bottom: 16px;
      }
      .where-body {
        display: flex;
        gap: 14px;
        align-items: flex-start;
      }
      .where-icon {
        flex: none;
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--sunken);
        color: var(--ink-2);
      }
      .where h2 {
        font-size: 18px;
        margin: 2px 0 4px;
      }
      .where p {
        color: var(--ink-2);
        margin: 0;
      }
      .where[data-tone='ok'] {
        border-color: var(--sage);
      }
      .where[data-tone='ok'] .where-icon {
        background: var(--sage-tint);
        color: var(--sage);
      }
      .where[data-tone='warn'] .where-icon {
        background: var(--amber-tint);
        color: var(--amber);
      }
      .where[data-tone='bad'] {
        border-color: var(--brick);
      }
      .where[data-tone='bad'] .where-icon {
        background: var(--brick-tint);
        color: var(--brick);
      }
      .stats,
      .times {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 16px;
        border-top: 1px solid var(--line);
      }
      .times {
        border-top: 0;
      }
      .stat {
        font-size: 20px;
        font-weight: 650;
        font-family: var(--font-display);
      }
      .foot {
        border-top: 1px solid var(--line);
        border-bottom: 0;
        justify-content: flex-end;
      }
      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .actions .btn {
        width: 100%;
        justify-content: center;
        min-height: 54px;
      }
      .why {
        margin: 10px 2px 20px;
      }
      @media (max-width: 520px) {
        .actions {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AttendanceComponent {
  private readonly api = inject(AttendanceApi);
  private readonly geolocation = inject(GeolocationService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  protected readonly device = inject(DeviceModeService);

  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly today = signal<TodayAttendance | null>(null);
  protected readonly where = signal<Where>({ kind: 'idle' });
  protected readonly busy = signal<'in' | 'out' | null>(null);
  protected readonly actionError = signal('');
  protected readonly passwordError = signal('');
  protected readonly signingOut = signal(false);
  protected readonly password = new FormControl('', { nonNullable: true });

  /** Only the newest location lookup may update the screen. */
  private lookup = 0;

  protected readonly record = computed(() => this.today()?.record ?? null);
  protected readonly check = computed(() => {
    const w = this.where();
    return w.kind === 'measured' ? w.check : null;
  });
  protected readonly inside = computed(() => this.check()?.verdict === 'ok');
  protected readonly view = computed<View>(() => {
    const t = this.today();
    return t
      ? describe(this.where(), t)
      : { tone: 'info', icon: 'locate', title: '', detail: '' };
  });

  protected readonly canCheckIn = computed(
    () =>
      !!this.today()?.configured &&
      !this.record() &&
      this.inside() &&
      !this.busy() &&
      !this.signingOut(),
  );
  protected readonly canCheckOut = computed(
    () =>
      this.record()?.status === 'checked_in' &&
      this.inside() &&
      !this.busy() &&
      !this.signingOut(),
  );

  /** Why neither button is available right now, in plain words. Empty when there is nothing to explain. */
  protected readonly whyNot = computed(() => {
    const t = this.today();
    if (
      !t?.configured ||
      this.busy() ||
      this.signingOut() ||
      this.record()?.status === 'checked_out' ||
      this.inside()
    )
      return '';
    return `Check in and check out become available when you are within ${t.radiusM} m of the salon with a clear GPS signal.`;
  });

  protected readonly statusLabel = computed(() => {
    const s = this.record()?.status;
    return s === 'checked_in'
      ? 'Checked in'
      : s === 'checked_out'
        ? 'Checked out'
        : 'Not checked in';
  });

  protected readonly worked = computed(() => {
    const r = this.record();
    return r ? formatWorked(r.checkIn.at, r.checkOut?.at) : '';
  });

  constructor() {
    this.load();
  }

  protected load() {
    this.loading.set(true);
    this.loadError.set('');
    this.api.today().subscribe({
      next: (t) => {
        this.today.set(t);
        this.loading.set(false);
        if (t.configured) void this.refreshLocation();
      },
      error: (e) => {
        this.loadError.set(parseError(e).message);
        this.loading.set(false);
      },
    });
  }

  /** The person pressed "Refresh location": whatever went wrong on their last attempt no longer applies. */
  protected manualRefresh() {
    this.actionError.set('');
    void this.refreshLocation();
  }

  /** Ask the phone where it is, then ask the server how far that is from the salon. */
  protected async refreshLocation() {
    const t = this.today();
    if (!t?.configured) return;
    const mine = ++this.lookup;
    this.where.set({ kind: 'locating' });
    try {
      const reading = await this.geolocation.getBestPosition(
        Math.min(t.maxAccuracyM, 30),
      );
      if (mine !== this.lookup) return;
      this.api.locationCheck(reading).subscribe({
        next: (check) => {
          if (mine === this.lookup) this.where.set({ kind: 'measured', check });
        },
        error: (e) => {
          if (mine === this.lookup)
            this.where.set({
              kind: 'unreachable',
              message: parseError(e).message,
            });
        },
      });
    } catch (e) {
      if (mine === this.lookup)
        this.where.set({
          kind: 'failed',
          reason: e instanceof GeoError ? e.kind : 'unavailable',
        });
    }
  }

  /**
   * Check in or out. A brand-new reading is taken at the moment of the tap (the one shown above may be minutes
   * old), and the server judges it again: the buttons are a convenience, not the security.
   */
  protected async act(kind: 'in' | 'out') {
    if (this.busy()) return;
    const t = this.today();
    if (!t) return;
    this.actionError.set('');

    const shared = this.device.mode() === 'shared';
    const password = this.password.value;
    if (shared && !password) {
      this.passwordError.set('Enter your password to confirm it is you');
      return;
    }

    this.busy.set(kind);
    let reading: GeoReading;
    try {
      reading = await this.geolocation.getBestPosition(
        Math.min(t.maxAccuracyM, 30),
      );
    } catch (e) {
      this.busy.set(null);
      this.where.set({
        kind: 'failed',
        reason: e instanceof GeoError ? e.kind : 'unavailable',
      });
      return;
    }

    const body = {
      ...reading,
      deviceType: this.device.mode(),
      ...(shared ? { password } : {}),
    };
    (kind === 'in'
      ? this.api.checkIn(body)
      : this.api.checkOut(body)
    ).subscribe({
      next: (fresh) => {
        this.busy.set(null);
        this.today.set(fresh);
        this.password.reset();
        this.toast.success(
          kind === 'in'
            ? 'You are checked in. Have a good day!'
            : 'You are checked out. See you next time!',
        );
        if (shared) this.signOutSoon();
      },
      error: (e) => {
        this.busy.set(null);
        const info = parseError(e);
        if (info.code === 'WRONG_PASSWORD' || info.fields['password']) {
          this.passwordError.set(info.fields['password'] ?? info.message);
          return;
        }
        this.actionError.set(info.message);
        // The picture on screen was out of date (moved away, GPS drifted, or someone else changed today's record): refresh it.
        if (
          info.code === 'OUT_OF_RANGE' ||
          info.code === 'LOCATION_INACCURATE' ||
          info.code === 'LOCATION_STALE'
        )
          void this.refreshLocation();
        else if (
          info.code &&
          [
            'ALREADY_CHECKED_IN',
            'ALREADY_CHECKED_OUT',
            'ATTENDANCE_COMPLETE',
            'NOT_CHECKED_IN',
          ].includes(info.code)
        )
          this.reloadToday();
      },
    });
  }

  /** On a shared tablet the next person must sign in as themselves. */
  private signOutSoon() {
    this.signingOut.set(true);
    setTimeout(() => this.auth.logout(), 2500);
  }

  private reloadToday() {
    this.api
      .today()
      .subscribe({ next: (t) => this.today.set(t), error: () => undefined });
  }

  // ── small display helpers ──
  protected distanceLabel(m: number) {
    return formatDistance(m);
  }
  protected roundM(m: number) {
    return Math.round(m);
  }

  protected dayLabel(workDate: string): string {
    const [y, m, d] = workDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  /** A time of day in the parlour's own time zone, whatever zone this phone is set to. */
  protected time(iso: string): string {
    return formatTime(iso, this.today()?.timezone);
  }
}
