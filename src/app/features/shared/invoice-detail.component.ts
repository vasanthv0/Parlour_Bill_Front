import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InvoicesApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { parseError } from '../../core/errors';
import { Invoice } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { MoneyPipe } from '../../shared/money.pipe';

@Component({
  selector: 'app-invoice-detail',
  imports: [FormsModule, RouterLink, DatePipe, MoneyPipe, IconComponent, ModalComponent],
  template: `
    <div class="page narrow">
      <div class="page-head no-print">
        <a class="btn btn-ghost" [routerLink]="[base, 'invoices']"><app-icon name="arrow-left" /> {{ isAdmin ? 'All bills' : 'My bills' }}</a>
        @if (invoice(); as inv) {
          <div class="row">
            @if (isAdmin && inv.status === 'paid') { <button type="button" class="btn btn-danger" (click)="voiding.set(true)"><app-icon name="ban" /> Void bill</button> }
            @if (inv.status === 'paid' && auth.hasFeature('action.whatsapp.send')) {
              <button type="button" class="btn btn-secondary" [disabled]="sending()" (click)="sendWhatsApp()"><app-icon name="whatsapp" /> {{ sending() ? 'Opening…' : 'WhatsApp' }}</button>
            }
            <button type="button" class="btn btn-secondary" (click)="print()"><app-icon name="printer" /> Print</button>
            <a class="btn btn-primary" [routerLink]="[base, 'new-bill']"><app-icon name="plus" /> New bill</a>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 520px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not open this bill</h3><p>{{ error() }}</p><a class="btn btn-secondary" [routerLink]="[base, 'invoices']">Back to bills</a></div>
      } @else {
        @if (invoice(); as inv) {
        @if (justSaved) { <div class="saved no-print" role="status"><app-icon name="check" /> Bill saved. Print it{{ auth.hasFeature('action.whatsapp.send') ? ', send it on WhatsApp,' : '' }} or start the next bill.</div> }

        <div class="receipt" [class.is-void]="inv.status === 'void'">
          @if (inv.status === 'void') { <div class="stamp" aria-label="Void">VOID</div> }
          <div class="receipt-title">
            <h2>{{ inv.parlour.name }}</h2>
            @if (inv.parlour.address) { <div class="meta">{{ inv.parlour.address }}</div> }
            @if (inv.parlour.phone) { <div class="meta">Phone {{ inv.parlour.phone }}</div> }
            @if (inv.parlour.gstNumber) { <div class="meta">GSTIN {{ inv.parlour.gstNumber }}</div> }
          </div>

          <dl class="facts">
            <div><dt>Bill no.</dt><dd class="num">{{ inv.number }}</dd></div>
            <div><dt>Date</dt><dd>{{ inv.createdAt | date: 'd MMM y, h:mm a' }}</dd></div>
            <div><dt>Customer</dt><dd>{{ inv.customerName }}@if (inv.customerPhone) { <span class="muted"> · {{ inv.customerPhone }}</span> }</dd></div>
            <div><dt>Served by</dt><dd>{{ inv.createdByName || '—' }}</dd></div>
          </dl>

          <ul class="receipt-lines">
            @for (it of inv.items; track it.id) {
              <li class="receipt-line">
                <span class="name">{{ it.name }}</span><span class="amt">{{ it.lineTotal | money: true }}</span>
                <span class="sub">{{ it.quantity }} × {{ it.unitPrice | money: true }}</span>
                @if (it.description) { <span class="desc">{{ it.description }}</span> }
              </li>
            }
          </ul>

          <div class="receipt-sums">
            <div class="line"><span>Subtotal</span><span>{{ inv.subtotal | money: true }}</span></div>
            @if (inv.referralDiscount > 0) { <div class="line referral"><span>Referral discount ({{ inv.referrer?.name }}, {{ inv.referralPercent }}%)</span><span>− {{ inv.referralDiscount | money: true }}</span></div> }
            @if (inv.discount > 0) { <div class="line"><span>Discount</span><span>− {{ inv.discount | money: true }}</span></div> }
            @if (inv.tax > 0) { <div class="line"><span>GST {{ inv.taxPercent }}%</span><span>{{ inv.tax | money: true }}</span></div> }
          </div>
          <div class="receipt-total"><span class="label">Total</span><span class="amount">{{ inv.total | money: true }}</span></div>
          <p class="paid-by">Paid by {{ inv.paymentMethod === 'upi' ? 'UPI' : inv.paymentMethod }}</p>

          @if (inv.status === 'void') {
            <p class="void-note"><strong>Voided</strong> {{ inv.voidedAt | date: 'd MMM y, h:mm a' }}. Reason: {{ inv.voidReason }}</p>
          }
          <p class="thanks">Thank you for visiting.</p>
        </div>
        }
      }
    </div>

    @if (askPhone()) {
      <app-modal title="Send bill on WhatsApp" (closed)="askPhone.set(false)">
        <form id="wa-form" (ngSubmit)="submitPhone()" class="stack">
          <p>This customer has no saved number. Enter the WhatsApp number to send the bill to.</p>
          <div class="field" [class.invalid]="phoneError()">
            <label class="label" for="wa-phone">WhatsApp number</label>
            <input id="wa-phone" class="input" type="tel" inputmode="tel" name="phone" [(ngModel)]="phone" placeholder="98400 12345" autocomplete="off" />
            @if (phoneError(); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">Add the country code for numbers outside your own country.</span> }
          </div>
        </form>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="askPhone.set(false)">Cancel</button>
          <button type="submit" form="wa-form" class="btn btn-primary" [disabled]="sending()"><app-icon name="whatsapp" [size]="16" /> {{ sending() ? 'Opening…' : 'Open WhatsApp' }}</button>
        </ng-container>
      </app-modal>
    }

    @if (voiding()) {
      <app-modal title="Void this bill?" (closed)="voiding.set(false)">
        <form id="void-form" (ngSubmit)="confirmVoid()" class="stack">
          <p>Voiding removes this bill from your takings. It stays on record and cannot be undone.</p>
          <div class="field" [class.invalid]="reasonError()">
            <label class="label" for="reason">Reason</label>
            <input id="reason" class="input" name="reason" [(ngModel)]="reason" maxlength="200" placeholder="e.g. Entered twice" autocomplete="off" />
            @if (reasonError(); as m) { <span class="field-error">{{ m }}</span> }
          </div>
        </form>
        <ng-container modal-foot>
          <button type="button" class="btn btn-secondary" (click)="voiding.set(false)">Keep bill</button>
          <button type="submit" form="void-form" class="btn btn-danger" [disabled]="busy()">{{ busy() ? 'Voiding…' : 'Void bill' }}</button>
        </ng-container>
      </app-modal>
    }`,
  styles: [`
    .narrow { max-width: 560px; }
    .saved { display: flex; gap: 10px; align-items: center; padding: 12px 14px; margin-bottom: 20px; border-radius: 10px; background: var(--sage-tint); color: var(--sage); font-weight: 600; }
    .facts { margin: 0; padding: 14px 0; border-bottom: 1px dashed var(--line-strong); display: grid; gap: 6px; div { display: flex; justify-content: space-between; gap: 16px; } dt { color: var(--muted); } dd { margin: 0; text-align: right; font-weight: 550; } }
    .receipt-line .desc { grid-column: 1 / -1; color: var(--muted); font-size: 13px; }
    .referral { color: var(--sage); font-weight: 600; }
    .paid-by { margin-top: 10px; color: var(--muted); text-transform: capitalize; }
    .thanks { margin-top: 18px; text-align: center; color: var(--muted); font-size: 13px; }
    .void-note { margin-top: 12px; padding: 10px 12px; background: var(--brick-tint); color: var(--brick); border-radius: 8px; font-size: 14px; }
    .is-void .receipt-total .amount, .is-void .receipt-line .amt { text-decoration: line-through; color: var(--muted); }
    .stamp { position: absolute; top: 120px; right: 18px; transform: rotate(-12deg); border: 3px solid var(--brick); color: var(--brick); font-family: var(--font-display); font-weight: 800; font-size: 28px; letter-spacing: 0.08em; padding: 2px 14px; border-radius: 6px; opacity: 0.85; pointer-events: none; }
  `],
})
export class InvoiceDetailComponent {
  private readonly api = inject(InvoicesApi);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected readonly isAdmin = this.auth.role() === 'admin';
  protected readonly base = this.auth.basePath();
  protected readonly justSaved = this.route.snapshot.queryParamMap.get('new') === '1';
  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly voiding = signal(false);
  protected readonly busy = signal(false);
  protected readonly reasonError = signal('');
  protected reason = '';
  protected readonly sending = signal(false);
  protected readonly askPhone = signal(false);
  protected readonly phoneError = signal('');
  protected phone = '';

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.get(id).subscribe({
      next: (i) => { this.invoice.set(i); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected print() { window.print(); }

  /** Opens WhatsApp with this bill written and ready; a person still presses Send there. */
  protected sendWhatsApp() {
    const inv = this.invoice();
    if (!inv) return;
    if (!inv.customerPhone) { this.phoneError.set(''); this.askPhone.set(true); return; }
    this.openWhatsApp();
  }

  protected submitPhone() {
    if (!this.phone.trim()) { this.phoneError.set('Enter the customer’s WhatsApp number'); return; }
    this.openWhatsApp(this.phone.trim());
  }

  private openWhatsApp(phone?: string) {
    // The window is opened right now, inside the click, so pop-up blockers allow it; the link is filled in once the server replies.
    const w = window.open('', '_blank');
    this.sending.set(true);
    this.phoneError.set('');
    this.api.whatsapp(this.invoice()!.id, phone).subscribe({
      next: (r) => {
        this.sending.set(false);
        this.askPhone.set(false);
        if (w) { w.opener = null; w.location.href = r.url; } else { window.location.assign(r.url); }
      },
      error: (e) => {
        this.sending.set(false);
        w?.close();
        const info = parseError(e);
        if (info.code === 'PHONE_REQUIRED' || info.code === 'INVALID_PHONE') { this.phoneError.set(info.message); this.askPhone.set(true); }
        else this.toast.error(info.message);
      },
    });
  }

  protected confirmVoid() {
    const reason = this.reason.trim();
    if (reason.length < 3) { this.reasonError.set('Give a short reason'); return; }
    this.reasonError.set('');
    this.busy.set(true);
    this.api.void(this.invoice()!.id, reason).subscribe({
      next: (i) => { this.invoice.set(i); this.voiding.set(false); this.busy.set(false); this.toast.success(`Bill ${i.number} voided`); },
      error: (e) => { this.busy.set(false); this.reasonError.set(parseError(e).message); },
    });
  }
}
