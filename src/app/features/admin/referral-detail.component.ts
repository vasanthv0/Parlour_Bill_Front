import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReferrersApi } from '../../core/api';
import { parseError } from '../../core/errors';
import { Referrer } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { ReferrerFormComponent } from './referrer-form.component';

@Component({
  selector: 'app-referral-detail',
  imports: [DatePipe, RouterLink, MoneyPipe, IconComponent, ReferrerFormComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <a class="btn btn-ghost" routerLink="/admin/referrals"><app-icon name="arrow-left" /> All referrers</a>
        @if (referrer()) { <button type="button" class="btn btn-secondary" (click)="editing.set(true)"><app-icon name="pencil" [size]="16" /> Edit</button> }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 360px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not open this referrer</h3><p>{{ error() }}</p><a class="btn btn-secondary" routerLink="/admin/referrals">Back to referrers</a></div>
      } @else {
        @if (referrer(); as r) {
          <div class="head">
            <h1>{{ r.name }}</h1>
            <span class="badge badge-admin num">{{ r.code }}</span>
            <span class="badge">{{ r.percent }}% off</span>
            <span class="badge" [class.badge-paid]="r.isActive" [class.badge-warn]="!r.isActive">{{ r.isActive ? 'Active' : 'Inactive' }}</span>
          </div>

          <div class="ledger" style="margin-bottom: 24px">
            <div class="ledger-item"><div class="k">Bills</div><div class="v">{{ r.bills }}</div><div class="s">voided bills not counted</div></div>
            <div class="ledger-item"><div class="k">Discount given</div><div class="v">{{ r.totalDiscount | money }}</div><div class="s">added to their record on every bill</div></div>
            <div class="ledger-item"><div class="k">Last used</div><div class="v small">{{ r.lastUsedAt ? (r.lastUsedAt | date: 'd MMM y') : 'Never' }}</div></div>
            <div class="ledger-item"><div class="k">Contact</div><div class="v small num">{{ r.contact }}</div></div>
          </div>

          <section class="panel">
            <div class="panel-head"><h2>Bills with this referral</h2></div>
            @if (r.history?.length) {
              <div class="table-wrap" style="border: 0; border-radius: 0">
                <table class="table">
                  <thead><tr><th>Bill</th><th>Date</th><th>Customer</th><th class="num">Percentage</th><th class="num">Discount</th><th class="num">Bill total</th><th>Status</th></tr></thead>
                  <tbody>
                    @for (h of r.history; track h.id) {
                      <tr [class.void]="h.status === 'void'">
                        <td><a [routerLink]="['/admin/invoices', h.id]" class="num">{{ h.number }}</a></td>
                        <td class="muted nowrap">{{ h.createdAt | date: 'd MMM y, h:mm a' }}</td>
                        <td>{{ h.customerName }}</td>
                        <td class="num">{{ h.percent }}%</td>
                        <td class="num"><strong>{{ h.discount | money }}</strong></td>
                        <td class="num">{{ h.total | money }}</td>
                        <td><span class="badge" [class.badge-paid]="h.status === 'paid'" [class.badge-void]="h.status === 'void'">{{ h.status === 'paid' ? 'Counted' : 'Void' }}</span></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else { <div class="empty"><h3>Not used yet</h3><p>Bills appear here when a customer names {{ r.name }} or {{ r.code }}.</p></div> }
          </section>
        }
      }
    </div>

    @if (editing() && referrer()) {
      <app-referrer-form [referrer]="referrer()" (saved)="editing.set(false); load()" (cancelled)="editing.set(false)" />
    }`,
  styles: [`
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 20px; }
    .v.small { font-size: 20px; }
    tr.void td { color: var(--muted); }
    tr.void td.num { text-decoration: line-through; }
  `],
})
export class ReferralDetailComponent {
  private readonly api = inject(ReferrersApi);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly referrer = signal<Referrer | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly editing = signal(false);

  constructor() { this.load(); }

  protected load() {
    this.api.get(this.id).subscribe({
      next: (r) => { this.referrer.set(r); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }
}
