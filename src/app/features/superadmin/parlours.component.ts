import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { PlatformApi } from '../../core/api';
import { parseError } from '../../core/errors';
import { FeatureDef, PageMeta, PlatformParlour, PlatformSummary } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { ParlourCreateComponent } from './parlour-create.component';

@Component({
  selector: 'app-parlours',
  imports: [FormsModule, RouterLink, DatePipe, IconComponent, ParlourCreateComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Parlours</h1><p class="sub">Every parlour on the platform. Create accounts, switch pages on or off, suspend or remove.</p></div>
        <button type="button" class="btn btn-primary" (click)="creating.set(true)"><app-icon name="plus" /> New parlour</button>
      </div>

      @if (summary(); as s) {
        <div class="ledger" style="margin-bottom: 24px">
          <div class="ledger-item"><div class="k">Parlours</div><div class="v">{{ s.parlours }}</div></div>
          <div class="ledger-item"><div class="k">Active</div><div class="v">{{ s.active }}</div></div>
          <div class="ledger-item"><div class="k">Suspended</div><div class="v">{{ s.suspended }}</div></div>
          <div class="ledger-item"><div class="k">Bills made</div><div class="v">{{ s.bills }}</div><div class="s">across all parlours</div></div>
        </div>
      }

      <div class="toolbar">
        <div class="search input-affix">
          <input class="input" type="search" placeholder="Search parlour, admin name or email" aria-label="Search parlours" [ngModel]="search()" (ngModelChange)="onSearch($event)" />
          <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
        </div>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 260px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load parlours</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else if (items().length === 0) {
        <div class="panel empty">
          @if (search()) { <h3>No parlour matches “{{ search() }}”</h3><p>Try part of the name or the admin’s email.</p> }
          @else { <h3>No parlours yet</h3><p>Create the first parlour account. Its admin signs in with the email and password you set.</p>
            <button class="btn btn-primary" (click)="creating.set(true)">Create a parlour</button> }
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Parlour</th><th>Admin</th><th>Status</th><th>Switched off</th><th>Last sign-in</th><th><span class="sr-only">Manage</span></th></tr></thead>
            <tbody>
              @for (p of items(); track p.id) {
                <tr class="row-link" tabindex="0" (click)="open(p)" (keydown.enter)="open(p)">
                  <td><strong>{{ p.name }}</strong><div class="muted small">Created {{ p.createdAt | date: 'd MMM y' }} · {{ p.counts.bills }} bill{{ p.counts.bills === 1 ? '' : 's' }}</div></td>
                  <td>@if (p.owner) { {{ p.owner.name }}<div class="muted small">{{ p.owner.email }}</div> } @else { <span class="muted">No admin</span> }</td>
                  <td><span class="badge" [class.badge-paid]="p.status === 'active'" [class.badge-void]="p.status === 'suspended'">{{ p.status === 'active' ? 'Active' : 'Suspended' }}</span></td>
                  <td>
                    @let off = offOf(p);
                    @if (off.length === 0) { <span class="muted small">Nothing, all on</span> }
                    @else { <span class="chips">@for (l of off.slice(0, 3); track l) { <span class="badge badge-warn">{{ l }}</span> } @if (off.length > 3) { <span class="muted small">+{{ off.length - 3 }} more</span> }</span> }
                  </td>
                  <td class="muted nowrap">{{ p.owner?.lastLoginAt ? (p.owner?.lastLoginAt | date: 'd MMM y, h:mm a') : 'Never' }}</td>
                  <td class="cell-actions"><a class="btn btn-secondary btn-sm" [routerLink]="[p.id]" (click)="$event.stopPropagation()">Manage</a></td>
                </tr>
              }
            </tbody>
          </table>
          <div class="table-foot">
            <span>{{ meta().total }} parlour{{ meta().total === 1 ? '' : 's' }}</span>
            <span class="row">
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page <= 1" (click)="go(meta().page - 1)"><app-icon name="chevron-left" [size]="16" /> Previous</button>
              <span>Page {{ meta().page }} of {{ meta().pages }}</span>
              <button class="btn btn-secondary btn-sm" [disabled]="meta().page >= meta().pages" (click)="go(meta().page + 1)">Next <app-icon name="chevron-right" [size]="16" /></button>
            </span>
          </div>
        </div>
      }
    </div>

    @if (creating()) {
      <app-parlour-create [defs]="defs()" (cancelled)="creating.set(false); load()" (created)="creating.set(false); open($event)" />
    }`,
  styles: [`.chips { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; }`],
})
export class ParloursComponent {
  private readonly api = inject(PlatformApi);
  private readonly router = inject(Router);
  private readonly typed$ = new Subject<string>();

  protected readonly summary = signal<PlatformSummary | null>(null);
  protected readonly defs = signal<FeatureDef[]>([]);
  protected readonly items = signal<PlatformParlour[]>([]);
  protected readonly meta = signal<PageMeta>({ page: 1, limit: 20, total: 0, pages: 1 });
  protected readonly search = signal('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly creating = signal(false);

  /** Labels of what is switched off for a parlour; a button whose page is already off is not listed twice. */
  protected readonly offOf = (p: PlatformParlour) =>
    this.defs().filter((d) => p.features[d.key] === false && !(d.requires && p.features[d.requires] === false)).map((d) => d.label);

  constructor() {
    this.typed$.pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed()).subscribe(() => this.go(1));
    this.api.features().subscribe({ next: (d) => this.defs.set(d), error: () => undefined });
    this.load();
  }

  protected onSearch(q: string) { this.search.set(q); this.typed$.next(q.trim()); }
  protected go(page: number) { this.meta.update((m) => ({ ...m, page })); this.load(); }
  protected open(p: PlatformParlour) { void this.router.navigate(['/superadmin/parlours', p.id]); }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.summary().subscribe({ next: (s) => this.summary.set(s), error: () => undefined });
    this.api.list({ search: this.search().trim(), page: this.meta().page, limit: 20 }).subscribe({
      next: (r) => { this.items.set(r.items); this.meta.set(r.meta); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }
}
