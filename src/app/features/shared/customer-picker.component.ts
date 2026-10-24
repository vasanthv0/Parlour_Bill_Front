import { Component, ElementRef, HostListener, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap, catchError } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CustomersApi } from '../../core/api';
import { Customer } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { CustomerFormComponent } from './customer-form.component';

/** Search customers by name or phone at the counter, or add a new one without leaving the bill. */
@Component({
  selector: 'app-customer-picker',
  imports: [FormsModule, IconComponent, CustomerFormComponent],
  template: `
    <div class="picker">
      <div class="input-affix">
        <input class="input" type="search" placeholder="Search customer by name or phone" aria-label="Search customer"
               [ngModel]="query()" (ngModelChange)="onType($event)" (focus)="open.set(query().length > 0)" autocomplete="off" />
        <span class="affix-btn" aria-hidden="true"><app-icon name="search" /></span>
      </div>
      @if (open()) {
        <ul class="picker-list" role="listbox">
          @for (c of results(); track c.id) {
            <li><button type="button" role="option" (click)="choose(c)"><span>{{ c.name }}</span><span class="muted num">{{ c.phone }}</span></button></li>
          }
          <li><button type="button" (click)="adding.set(true); open.set(false)"><span><app-icon name="plus" [size]="16" /> New customer{{ query() ? ' “' + query() + '”' : '' }}</span></button></li>
        </ul>
      }
    </div>
    @if (adding()) {
      <app-customer-form [initialName]="initialName()" (saved)="choose($event); adding.set(false)" (cancelled)="adding.set(false)" />
    }`,
})
export class CustomerPickerComponent {
  private readonly api = inject(CustomersApi);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly typed$ = new Subject<string>();

  readonly picked = output<Customer>();
  protected readonly query = signal('');
  protected readonly results = signal<Customer[]>([]);
  protected readonly open = signal(false);
  protected readonly adding = signal(false);

  constructor() {
    this.typed$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => (q.trim().length < 2 ? of(null) : this.api.list({ search: q.trim(), limit: 6 }).pipe(catchError(() => of(null))))),
        takeUntilDestroyed(),
      )
      .subscribe((page) => { this.results.set(page?.items ?? []); this.open.set(this.query().trim().length >= 2); });
  }

  protected initialName() { return /^[^0-9]/.test(this.query().trim()) ? this.query().trim() : ''; }
  protected onType(q: string) { this.query.set(q); if (q.trim().length < 2) this.open.set(false); this.typed$.next(q); }
  protected choose(c: Customer) { this.picked.emit(c); this.query.set(''); this.results.set([]); this.open.set(false); }

  @HostListener('document:click', ['$event'])
  protected outside(e: Event) { if (!this.host.nativeElement.contains(e.target)) this.open.set(false); }
}
