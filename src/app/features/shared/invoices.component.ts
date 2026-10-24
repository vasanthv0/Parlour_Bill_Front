import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { InvoicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { InvoiceRow, PageMeta } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { MoneyPipe } from '../../shared/money.pipe';

/** Admin sees every bill in the parlour; staff see only the bills they made (the API enforces this). */
@Component({
  selector: 'app-invoices',
  imports: [FormsModule, RouterLink, DatePipe, MoneyPipe, IconComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>{{ isAdmin ? 'All bills' : 'My bills' }}</h1>
          <p class="sub">{{ isAdmin ? 'Every bill made in your parlour.' : 'Bills you have made.' }}</p>
        </div>
        <a class="btn btn-primary" [routerLink]="[base, 'new-bill']"><app-icon name="plus" /> New bill</a>
      </div>

      <div class="toolbar">
        <div class="search input-affix">
          <input class="input" type="search" placeholder="Bill number or customer" aria-label="Search bills" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
          <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
        </div>
        <label class="row small muted">From <input class="input date" type="date" [ngModel]="from()" (ngModelChange)="from.set($event); go(1)" [max]="to() || ''" /></label>
        <label class="row small muted">To <input class="input date" type="date" [ngModel]="to()" (ngModelChange)="to.set($event); go(1)" [min]="from() || ''" /></label>
        @if (isAdmin) {
          <label class="row small muted">Made by
            <select class="select status" [ngModel]="madeBy()" (ngModelChange)="madeBy.set($event); go(1)">
              <option value="">Everyone</option>
              @for (m of makers(); track m.id) { <option [value]="m.id">{{ m.name }}</option> }
            </select>
          </label>
        }
        <select class="select status" aria-label="Status" [ngModel]="status()" (ngModelChange)="status.set($event); go(1)">
          <option value="">All statuses</option><option value="paid">Paid</option><option value="void">Void</option>
        </select>
        @if (from() || to() || status() || search() || madeBy()) { <button type="button" class="btn btn-ghost btn-sm" (click)="reset()">Clear filters</button> }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 280px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load bills</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (items().length === 0) {
        <div class="panel empty">
          @if (filtered()) { <h3>No bills match these filters</h3><p>Try a wider date range or clear the filters.</p> }
          @else { <h3>No bills yet</h3><p>Bills appear here as soon as you make the first one.</p><a class="btn btn-primary" [routerLink]="[base, 'new-bill']">Make a bill</a> }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Bill</th><th>Date</th><th>Customer</th>@if (isAdmin) { <th>Made by</th> }<th>Payment</th><th class="num">Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              @for (i of items(); track i.id) {
                <tr class="row-link" tabindex="0" (click)="open(i)" (keydown.enter)="open(i)">
                  <td><strong class="num">{{ i.number }}</strong></td>
                  <td class="muted nowrap">{{ i.createdAt | date: 'd MMM y, h:mm a' }}</td>
                  <td>{{ i.customerName }}</td>
                  @if (isAdmin) { <td class="muted">{{ i.createdByName || '—' }}</td> }
                  <td class="muted">{{ methodLabel(i.paymentMethod) }}</td>
                  <td class="num" [style.text-decoration]="i.status === 'void' ? 'line-through' : 'none'">{{ i.total | money }}</td>
                  <td><span class="badge" [class.badge-paid]="i.status === 'paid'" [class.badge-void]="i.status === 'void'">{{ i.status === 'paid' ? 'Paid' : 'Void' }}</span></td>
                </tr>
              }
            </tbody>
          </table>
          <div class="table-foot">
            <span>{{ meta().total }} bill{{ meta().total === 1 ? '' : 's' }}</span>
            <span class="row">
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page <= 1" (click)="go(meta().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
              <span>Page {{ meta().page }} of {{ meta().pages }}</span>
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page >= meta().pages" (click)="go(meta().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
            </span>
          </div>
        </div>
      }
    </div>`,
  styles: [`.date { width: 150px; min-height: 38px; padding: 6px 10px; } .status { width: 150px; min-height: 38px; padding: 6px 10px; }`],
})
export class InvoicesComponent {
  private readonly api = inject(InvoicesApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly typed$ = new Subject<string>();

  protected readonly isAdmin = this.auth.role() === 'admin';
  protected readonly base = this.auth.basePath();
  protected readonly items = signal<InvoiceRow[]>([]);
  protected readonly meta = signal<PageMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly search = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly status = signal('');
  protected readonly madeBy = signal('');
  protected readonly makers = signal<{ id: string; name: string }[]>([]);

  constructor() {
    this.typed$.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.go(1));
    if (this.isAdmin) this.api.makers().subscribe({ next: (m) => this.makers.set(m), error: () => undefined });
    this.load();
  }

  protected filtered() { return !!(this.search() || this.from() || this.to() || this.status() || this.madeBy()); }
  protected methodLabel(m: string) { return m === 'upi' ? 'UPI' : m[0].toUpperCase() + m.slice(1); }
  protected onSearch(q: string) { this.search.set(q); this.typed$.next(q.trim()); }
  protected go(page: number) { this.meta.update((m) => ({ ...m, page })); this.load(); }
  protected reset() { this.search.set(''); this.from.set(''); this.to.set(''); this.status.set(''); this.madeBy.set(''); this.go(1); }
  protected open(i: InvoiceRow) { void this.router.navigate([this.base, 'invoices', i.id]); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.list({ page: this.meta().page, limit: 20, search: this.search().trim(), from: this.from(), to: this.to(), status: this.status(), createdBy: this.isAdmin ? this.madeBy() : '' }).subscribe({
      next: (r) => { this.items.set(r.items); this.meta.set(r.meta); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }
}
