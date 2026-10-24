import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import { CustomersApi } from '../../core/api';
import { parseError } from '../../core/errors';
import { Customer, PageMeta } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { CustomerFormComponent } from './customer-form.component';

@Component({
  selector: 'app-customers',
  imports: [FormsModule, RouterLink, DatePipe, MoneyPipe, IconComponent, ModalComponent, CustomerFormComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Customers</h1><p class="sub">Everyone you have billed, with their visit history.</p></div>
        <button type="button" class="btn btn-primary" (click)="editing.set(null); formOpen.set(true)"><app-icon name="plus" /> Add customer</button>
      </div>

      <div class="toolbar">
        <div class="search input-affix">
          <input class="input" type="search" placeholder="Search by name or phone" aria-label="Search customers" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
          <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
        </div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 240px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load customers</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (items().length === 0) {
        <div class="panel empty">
          @if (search()) { <h3>No match for “{{ search() }}”</h3><p>Check the spelling or search by phone number.</p> }
          @else { <h3>No customers yet</h3><p>Add a customer here, or while you are making a bill.</p>
            <button class="btn btn-primary" (click)="formOpen.set(true)">Add the first customer</button> }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Name</th><th>Phone</th><th class="num">Visits</th><th class="num">Total spent</th><th>Last visit</th></tr></thead>
            <tbody>
              @for (c of items(); track c.id) {
                <tr class="row-link" tabindex="0" (click)="open(c)" (keydown.enter)="open(c)">
                  <td><strong>{{ c.name }}</strong></td>
                  <td class="num" style="text-align:left">{{ c.phone }}</td>
                  <td class="num">{{ c.visits }}</td>
                  <td class="num">{{ c.totalSpent | money }}</td>
                  <td class="muted">{{ c.lastVisit ? (c.lastVisit | date: 'd MMM y') : 'No visits yet' }}</td>
                </tr>
              }
            </tbody>
          </table>
          <div class="table-foot">
            <span>{{ meta().total }} customer{{ meta().total === 1 ? '' : 's' }}</span>
            <span class="row">
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page <= 1" (click)="go(meta().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
              <span>Page {{ meta().page }} of {{ meta().pages }}</span>
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page >= meta().pages" (click)="go(meta().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
            </span>
          </div>
        </div>
      }
    </div>

    @if (detail(); as d) {
      <app-modal [title]="d.name" [wide]="true" (closed)="detail.set(null)">
        <div class="stack">
          <div class="form-grid">
            <div><div class="muted small">Phone</div><div>{{ d.phone }}</div></div>
            <div><div class="muted small">Email</div><div>{{ d.email || '—' }}</div></div>
            <div><div class="muted small">Visits</div><div class="num">{{ d.visits }}</div></div>
            <div><div class="muted small">Total spent</div><div class="num">{{ d.totalSpent | money }}</div></div>
            @if (d.notes) { <div class="span-2"><div class="muted small">Notes</div><div>{{ d.notes }}</div></div> }
          </div>
          <div>
            <h3 style="margin-bottom: 8px">Recent bills</h3>
            @if (d.recentInvoices?.length) {
              <div class="table-wrap"><table class="table"><tbody>
                @for (i of d.recentInvoices; track i.id) {
                  <tr class="row-link" [routerLink]="[base(), 'invoices', i.id]" (click)="detail.set(null)">
                    <td>{{ i.number }}</td><td class="muted">{{ i.createdAt | date: 'd MMM y' }}</td>
                    <td class="num">{{ i.total | money }}</td>
                    <td class="right"><span class="badge" [class.badge-paid]="i.status === 'paid'" [class.badge-void]="i.status === 'void'">{{ i.status === 'paid' ? 'Paid' : 'Void' }}</span></td>
                  </tr>
                }
              </tbody></table></div>
            } @else { <p class="muted">No bills for this customer yet.</p> }
          </div>
        </div>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="edit(d)"><app-icon name="pencil" [size]="16" /> Edit details</button>
        </ng-container>
      </app-modal>
    }

    @if (formOpen()) {
      <app-customer-form [customer]="editing()" (saved)="formOpen.set(false); load()" (cancelled)="formOpen.set(false)" />
    }`,
})
export class CustomersComponent {
  private readonly api = inject(CustomersApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly typed$ = new Subject<string>();

  protected readonly base = () => this.auth.basePath();
  protected readonly items = signal<Customer[]>([]);
  protected readonly meta = signal<PageMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  protected readonly search = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly detail = signal<Customer | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Customer | null>(null);

  constructor() {
    this.typed$.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.go(1));
    this.load();
  }

  protected onSearch(q: string) { this.search.set(q); this.typed$.next(q.trim()); }
  protected go(page: number) { this.meta.update((m) => ({ ...m, page })); this.load(); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.list({ search: this.search().trim(), page: this.meta().page, limit: 20 }).subscribe({
      next: (r) => { this.items.set(r.items); this.meta.set(r.meta); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected open(c: Customer) {
    this.api.get(c.id).subscribe({ next: (d) => this.detail.set(d), error: (e) => this.toast.error(parseError(e).message) });
  }
  protected edit(c: Customer) { this.detail.set(null); this.editing.set(c); this.formOpen.set(true); }
}
