import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ReferrersApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { PageMeta, Referrer } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { ReferrerFormComponent } from './referrer-form.component';

@Component({
  selector: 'app-referrals',
  imports: [FormsModule, DatePipe, MoneyPipe, IconComponent, ModalComponent, ReferrerFormComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Referrals</h1><p class="sub">People who send you customers. Their percentage comes off the bill when a customer names them.</p></div>
        @if (canAdd()) { <button type="button" class="btn btn-primary" (click)="openForm(null)"><app-icon name="plus" /> New referrer</button> }
      </div>

      <div class="toolbar">
        <div class="search input-affix">
          <input class="input" type="search" placeholder="Search by name, ID or phone" aria-label="Search referrers" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
          <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
        </div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 260px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load referrers</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (items().length === 0) {
        <div class="panel empty">
          @if (search()) { <h3>No match for “{{ search() }}”</h3><p>Try the name, the referral ID (like REF-0001) or the phone number.</p> }
          @else {
            <h3>No referrers yet</h3>
            @if (canAdd()) { <p>Add someone who refers customers. They get a referral ID, and you choose the percentage.</p><button class="btn btn-primary" (click)="openForm(null)">Add the first referrer</button> }
            @else { <p>Referrers are set up for your parlour by the team that manages your account.</p> }
          }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Referral ID</th><th>Name</th><th class="num">Percentage</th><th class="num">Bills</th><th class="num">Discount given</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (r of items(); track r.id) {
                <tr class="row-link" [class.off]="!r.isActive" tabindex="0" (click)="open(r)" (keydown.enter)="open(r)">
                  <td><strong class="num">{{ r.code }}</strong></td>
                  <td>{{ r.name }}<div class="muted small num">{{ r.contact }}</div></td>
                  <td class="num">{{ r.percent }}%</td>
                  <td class="num">{{ r.bills }}</td>
                  <td class="num"><strong>{{ r.totalDiscount | money }}</strong>@if (r.lastUsedAt) { <div class="muted small">Last used {{ r.lastUsedAt | date: 'd MMM' }}</div> }</td>
                  <td><span class="badge" [class.badge-paid]="r.isActive" [class.badge-warn]="!r.isActive">{{ r.isActive ? 'Active' : 'Inactive' }}</span></td>
                  <td class="cell-actions" (click)="$event.stopPropagation()">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openForm(r)"><app-icon name="pencil" [size]="16" /> Edit</button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="setActive(r, !r.isActive)">{{ r.isActive ? 'Deactivate' : 'Reactivate' }}</button>
                    @if (r.canDelete) { <button type="button" class="btn btn-ghost btn-sm danger" (click)="deleting.set(r)"><app-icon name="trash" [size]="16" /> Delete</button> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <div class="table-foot">
            <span>{{ meta().total }} referrer{{ meta().total === 1 ? '' : 's' }}</span>
            <span class="row">
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page <= 1" (click)="go(meta().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
              <span>Page {{ meta().page }} of {{ meta().pages }}</span>
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page >= meta().pages" (click)="go(meta().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
            </span>
          </div>
        </div>
        <p class="hint" style="margin-top: 12px">A referrer who has been on a bill can be deactivated but not deleted, so your records stay complete. Voided bills are not counted.</p>
      }
    </div>

    @if (formOpen()) {
      <app-referrer-form [referrer]="editing()" (saved)="formOpen.set(false); load()" (cancelled)="formOpen.set(false); load()" />
    }

    @if (deleting(); as d) {
      <app-modal title="Delete this referrer?" (closed)="deleting.set(null)">
        <p>Delete <strong>{{ d.name }}</strong> ({{ d.code }})? They have not been on any bill. This cannot be undone.</p>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="deleting.set(null)">Keep</button>
          <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="remove(d)">{{ busy() ? 'Deleting…' : 'Delete referrer' }}</button>
        </ng-container>
      </app-modal>
    }`,
  styles: [`.off td { color: var(--muted); } .danger { color: var(--brick); }`],
})
export class ReferralsComponent {
  private readonly api = inject(ReferrersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly typed$ = new Subject<string>();
  private readonly auth = inject(AuthService);
  protected readonly canAdd = () => this.auth.hasFeature('action.referrals.add');

  protected readonly items = signal<Referrer[]>([]);
  protected readonly meta = signal<PageMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  protected readonly search = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Referrer | null>(null);
  protected readonly deleting = signal<Referrer | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    this.typed$.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.go(1));
    this.load();
  }

  protected onSearch(q: string) { this.search.set(q); this.typed$.next(q.trim()); }
  protected go(page: number) { this.meta.update((m) => ({ ...m, page })); this.load(); }
  protected open(r: Referrer) { void this.router.navigate(['/admin/referrals', r.id]); }
  protected openForm(r: Referrer | null) { this.editing.set(r); this.formOpen.set(true); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.list({ search: this.search().trim(), page: this.meta().page, limit: 20 }).subscribe({
      next: (r) => { this.items.set(r.items); this.meta.set(r.meta); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected setActive(r: Referrer, isActive: boolean) {
    this.api.update(r.id, { isActive }).subscribe({
      next: () => { this.toast.success(isActive ? `${r.name} is active again` : `${r.name} deactivated. They can no longer be applied to bills.`); this.load(); },
      error: (e) => this.toast.error(parseError(e).message),
    });
  }

  protected remove(r: Referrer) {
    this.busy.set(true);
    this.api.remove(r.id).subscribe({
      next: () => { this.busy.set(false); this.deleting.set(null); this.toast.success(`${r.name} deleted`); this.load(); },
      error: (e) => { this.busy.set(false); this.deleting.set(null); this.toast.error(parseError(e).message); this.load(); },
    });
  }
}
