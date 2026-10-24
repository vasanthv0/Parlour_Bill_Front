import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReportsApi } from '../../core/api';
import { parseError } from '../../core/errors';
import { PaymentMethod, Summary } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';

type Preset = 'today' | '7d' | '30d' | 'month';
const PRESETS: { id: Preset; label: string }[] = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'month', label: 'This month' }];
const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' };
const METHOD_COLOR: Record<PaymentMethod, string> = { cash: '#276b4d', upi: '#b0245c', card: '#3b2741' };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const short = (n: number) => (n >= 100000 ? `₹${+(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${+(n / 1000).toFixed(1)}k` : `₹${Math.round(n)}`);
/** Round a maximum up to a tidy axis value (1, 2, 2.5, 5, 10 × a power of ten). */
const niceMax = (v: number) => { const p = 10 ** Math.floor(Math.log10(v)); return ([1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v) ?? 10 * p); };

@Component({
  selector: 'app-dashboard',
  imports: [DecimalPipe, RouterLink, MoneyPipe],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Dashboard</h1><p class="sub">{{ rangeLabel() }}</p></div>
        <div class="segmented" role="group" aria-label="Date range">
          @for (p of presets; track p.id) { <button type="button" [attr.aria-pressed]="preset() === p.id" (click)="pick(p.id)">{{ p.label }}</button> }
        </div>
      </div>

      @if (error()) {
        <div class="panel empty"><h3>Could not load the dashboard</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (!data()) {
        <div class="skeleton" style="height: 92px; margin-bottom: 24px"></div><div class="skeleton" style="height: 320px"></div>
      } @else {
        @if (data(); as s) {
        <div class="ledger">
          <div class="ledger-item"><div class="k">Takings</div><div class="v">{{ s.totals.revenue | money }}</div><div class="s">after discounts{{ s.totals.tax > 0 ? ', incl. GST ' + (s.totals.tax | money) : '' }}</div></div>
          <div class="ledger-item"><div class="k">Bills</div><div class="v">{{ s.totals.invoices }}</div><div class="s">voided bills excluded</div></div>
          <div class="ledger-item"><div class="k">Average bill</div><div class="v">{{ s.totals.averageBill | money }}</div></div>
          <div class="ledger-item"><div class="k">Discounts given</div><div class="v">{{ s.totals.discounts | money }}</div>@if (s.totals.referralDiscounts > 0) { <div class="s">{{ s.totals.referralDiscounts | money }} from referrals</div> }</div>
        </div>

        @if (s.totals.invoices === 0) {
          <div class="panel empty" style="margin-top: 24px">
            <h3>No bills in this period</h3><p>Takings and trends appear here as soon as bills are made.</p>
            <a class="btn btn-primary" routerLink="/admin/new-bill">Make a bill</a>
          </div>
        } @else {
          <section class="panel" style="margin-top: 24px">
            <div class="panel-head"><h2>Daily takings</h2></div>
            <div class="panel-body chart-body">
              @if (chart(); as c) {
                <svg [attr.viewBox]="'0 0 ' + c.w + ' ' + c.h" class="chart" role="img" [attr.aria-label]="'Bar chart of daily takings, ' + c.bars.length + ' days'">
                  @for (t of c.ticks; track t.y) {
                    <line [attr.x1]="c.padL" [attr.x2]="c.w" [attr.y1]="t.y" [attr.y2]="t.y" class="grid" />
                    <text [attr.x]="c.padL - 8" [attr.y]="t.y + 4" class="axis end">{{ t.label }}</text>
                  }
                  @for (b of c.bars; track b.day) {
                    <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="2" class="bar"><title>{{ b.title }}</title></rect>
                  }
                  @for (l of c.labels; track l.x) { <text [attr.x]="l.x" [attr.y]="c.h - 8" class="axis mid">{{ l.text }}</text> }
                </svg>
              }
            </div>
          </section>

          <div class="two">
            <section class="panel">
              <div class="panel-head"><h2>Top services</h2></div>
              <div class="panel-body">
                @for (t of s.topServices; track t.name) {
                  <div class="bar-row">
                    <span>{{ t.name }} <span class="muted small">× {{ t.quantity }}</span></span><strong class="num">{{ t.revenue | money }}</strong>
                    <div class="meter"><span [style.width.%]="(t.revenue / topMax()) * 100"></span></div>
                  </div>
                }
              </div>
            </section>

            <section class="panel">
              <div class="panel-head"><h2>How customers paid</h2></div>
              <div class="panel-body">
                <div class="split" role="img" aria-label="Share of takings by payment method">
                  @for (p of s.byPayment; track p.method) { <span [style.width.%]="share(p.revenue)" [style.background]="color(p.method)"></span> }
                </div>
                <ul class="legend">
                  @for (p of s.byPayment; track p.method) {
                    <li><span class="dot" [style.background]="color(p.method)"></span><span class="grow">{{ label(p.method) }} <span class="muted small">{{ p.invoices }} bill{{ p.invoices === 1 ? '' : 's' }}</span></span><span class="num">{{ p.revenue | money }}</span><span class="muted num pct">{{ share(p.revenue) | number: '1.0-0' }}%</span></li>
                  }
                </ul>
              </div>
            </section>
          </div>

          <section class="panel" style="margin-top: 24px">
            <div class="panel-head"><h2>By team member</h2></div>
            <div class="table-wrap" style="border: 0; border-radius: 0">
              <table class="table"><thead><tr><th>Name</th><th class="num">Bills</th><th class="num">Takings</th></tr></thead>
                <tbody>@for (m of s.byStaff; track m.name) { <tr><td>{{ m.name }}</td><td class="num">{{ m.invoices }}</td><td class="num">{{ m.revenue | money }}</td></tr> }</tbody>
              </table>
            </div>
          </section>
        }
        }
      }
    </div>`,
  styles: [`
    .chart-body { padding: 12px 16px 8px; }
    .chart { width: 100%; height: auto; }
    .chart .grid { stroke: var(--line); stroke-width: 1; }
    .chart .axis { fill: var(--muted); font-size: 11px; font-family: var(--font-body); }
    .chart .end { text-anchor: end; } .chart .mid { text-anchor: middle; }
    .chart .bar { fill: var(--lacquer); &:hover { fill: var(--lacquer-hover); } }
    .two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 24px; }
    .split { display: flex; height: 14px; border-radius: 999px; overflow: hidden; background: #eee9f1; gap: 2px; }
    .legend { list-style: none; margin: 16px 0 0; padding: 0; li { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); } .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; } .pct { width: 44px; text-align: right; } }
    @media (max-width: 899px) { .two { grid-template-columns: minmax(0, 1fr); } }
  `],
})
export class DashboardComponent {
  private readonly api = inject(ReportsApi);
  protected readonly presets = PRESETS;
  protected readonly preset = signal<Preset>('7d');
  protected readonly data = signal<Summary | null>(null);
  protected readonly error = signal('');

  protected readonly topMax = computed(() => Math.max(1, ...(this.data()?.topServices.map((t) => t.revenue) ?? [1])));
  protected readonly rangeLabel = computed(() => {
    const r = this.data()?.range;
    if (!r) return 'Takings, bills and what sells.';
    const f = (s: string) => new DatePipe('en-US').transform(s, 'd MMM y');
    return r.from === r.to ? `${f(r.from)}` : `${f(r.from)} to ${f(r.to)}`;
  });

  protected readonly chart = computed(() => {
    const s = this.data();
    if (!s) return null;
    const w = 720, h = 250, padL = 52, padR = 6, padT = 10, padB = 30;
    const days = s.daily;
    const max = niceMax(Math.max(1, ...days.map((d) => d.revenue)));
    const slot = (w - padL - padR) / days.length;
    const bw = Math.max(2, Math.min(44, slot * 0.7));
    const y = (v: number) => padT + (h - padT - padB) * (1 - v / max);
    const step = Math.ceil(days.length / 8);
    const fmt = new DatePipe('en-US');
    return {
      w, h, padL,
      ticks: [0, 1, 2, 3, 4].map((i) => ({ y: y((max * i) / 4), label: short((max * i) / 4) })),
      bars: days.map((d, i) => {
        const top = y(d.revenue);
        return { day: d.day, x: padL + slot * i + (slot - bw) / 2, y: top, w: bw, h: Math.max(d.revenue > 0 ? 2 : 0, h - padB - top), title: `${fmt.transform(d.day, 'EEE d MMM')}: ${short(d.revenue)} from ${d.invoices} bill${d.invoices === 1 ? '' : 's'}` };
      }),
      labels: days.flatMap((d, i) => (i % step === 0 ? [{ x: padL + slot * i + slot / 2, text: days.length <= 7 ? fmt.transform(d.day, 'EEE d') ?? '' : fmt.transform(d.day, 'd MMM') ?? '' }] : [])),
    };
  });

  constructor() { this.load(); }

  protected pick(p: Preset) { this.preset.set(p); this.load(); }
  protected label(m: PaymentMethod) { return METHOD_LABEL[m]; }
  protected color(m: PaymentMethod) { return METHOD_COLOR[m]; }
  protected share(revenue: number) { const t = this.data()?.totals.revenue || 1; return (revenue / t) * 100; }

  protected load() {
    this.error.set('');
    this.data.set(null);
    const now = new Date();
    const start = new Date(now);
    if (this.preset() === '7d') start.setDate(now.getDate() - 6);
    else if (this.preset() === '30d') start.setDate(now.getDate() - 29);
    else if (this.preset() === 'month') start.setDate(1);
    this.api.summary(ymd(start), ymd(now)).subscribe({ next: (s) => this.data.set(s), error: (e) => this.error.set(parseError(e).message) });
  }
}
