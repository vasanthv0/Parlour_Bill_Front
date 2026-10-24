import { Component, ElementRef, HostListener, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';
import { ReferrersApi } from '../../core/api';
import { ReferrerLookup } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';

/** At the counter: type the name or ID a customer mentions, and pick the matching referrer. */
@Component({
  selector: 'app-referrer-picker',
  imports: [FormsModule, IconComponent],
  template: `
    <div class="picker">
      <div class="input-affix">
        <input class="input" type="search" placeholder="Referral: name or ID (optional)" aria-label="Referral name or ID" autocomplete="off"
               [ngModel]="query()" (ngModelChange)="onType($event)" (focus)="open.set(query().trim().length >= 2)" />
        <span class="affix-btn" aria-hidden="true"><app-icon name="gift" /></span>
      </div>
      @if (open()) {
        <ul class="picker-list" role="listbox">
          @for (r of results(); track r.id) {
            <li><button type="button" role="option" (click)="choose(r)"><span>{{ r.name }} <span class="muted">· {{ r.code }}</span></span><span class="num">{{ r.percent }}% off</span></button></li>
          } @empty {
            <li class="none muted small">No active referrer matches “{{ query().trim() }}”.</li>
          }
        </ul>
      }
    </div>`,
  styles: [`.none { padding: 10px 12px; }`],
})
export class ReferrerPickerComponent {
  private readonly api = inject(ReferrersApi);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly typed$ = new Subject<string>();

  readonly picked = output<ReferrerLookup>();
  protected readonly query = signal('');
  protected readonly results = signal<ReferrerLookup[]>([]);
  protected readonly open = signal(false);

  constructor() {
    this.typed$
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => (q.trim().length < 2 ? of(null) : this.api.lookup(q.trim()).pipe(catchError(() => of([] as ReferrerLookup[]))))),
        takeUntilDestroyed(),
      )
      .subscribe((list) => { this.results.set(list ?? []); this.open.set(this.query().trim().length >= 2); });
  }

  protected onType(q: string) { this.query.set(q); if (q.trim().length < 2) this.open.set(false); this.typed$.next(q); }
  protected choose(r: ReferrerLookup) { this.picked.emit(r); this.query.set(''); this.results.set([]); this.open.set(false); }

  @HostListener('document:click', ['$event'])
  protected outside(e: Event) { if (!this.host.nativeElement.contains(e.target)) this.open.set(false); }
}
