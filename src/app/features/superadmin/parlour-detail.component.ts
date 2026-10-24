import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { concat, forkJoin, last } from 'rxjs';
import { PlatformApi } from '../../core/api';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { ADMIN_NAV, STAFF_NAV } from '../../core/nav';
import { FeatureDef, PlatformParlour } from '../../core/models';
import { generatePassword } from '../../core/password';
import { ToastService } from '../../core/toast.service';
import { FeatureTogglesComponent } from '../../shared/feature-toggles.component';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';

const sameSwitches = (a: Record<string, boolean>, b: Record<string, boolean>) => Object.keys({ ...a, ...b }).every((k) => (a[k] !== false) === (b[k] !== false));

@Component({
  selector: 'app-parlour-detail',
  imports: [ReactiveFormsModule, DatePipe, RouterLink, IconComponent, ModalComponent, FeatureTogglesComponent],
  template: `
    <div class="page">
      <div class="page-head no-print">
        <a class="btn btn-ghost" routerLink="/superadmin/parlours"><app-icon name="arrow-left" /> All parlours</a>
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 420px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not open this parlour</h3><p>{{ error() }}</p><a class="btn btn-secondary" routerLink="/superadmin/parlours">Back to parlours</a></div>
      } @else {
        @if (parlour(); as p) {
        <div class="head">
          <h1>{{ p.name }}</h1>
          <span class="badge" [class.badge-paid]="p.status === 'active'" [class.badge-void]="p.status === 'suspended'">{{ p.status === 'active' ? 'Active' : 'Suspended' }}</span>
          <span class="muted">Created {{ p.createdAt | date: 'd MMM y' }}</span>
        </div>

        <div class="ledger" style="margin-bottom: 24px">
          <div class="ledger-item"><div class="k">Team members</div><div class="v">{{ p.counts.team }}</div></div>
          <div class="ledger-item"><div class="k">Bills</div><div class="v">{{ p.counts.bills }}</div></div>
          <div class="ledger-item"><div class="k">Customers</div><div class="v">{{ p.counts.customers }}</div></div>
          <div class="ledger-item"><div class="k">Services</div><div class="v">{{ p.counts.services }}</div></div>
        </div>

        <div class="cols">
          <div class="stack">
            <!-- Account -->
            <form class="panel" [formGroup]="account" (ngSubmit)="saveAccount()" novalidate>
              <div class="panel-head"><h2>Parlour and admin</h2></div>
              <div class="panel-body stack">
                @if (accountError()) { <div class="form-alert" role="alert">{{ accountError() }}</div> }
                <div class="field" [class.invalid]="err(account, 'name')"><label class="label" for="d-name">Parlour name</label><input id="d-name" class="input" formControlName="name" />@if (err(account, 'name'); as m) { <span class="field-error">{{ m }}</span> }</div>
                @if (p.owner) {
                  <div class="form-grid">
                    <div class="field" [class.invalid]="err(account, 'ownerName')"><label class="label" for="d-oname">Admin name</label><input id="d-oname" class="input" formControlName="ownerName" />@if (err(account, 'ownerName'); as m) { <span class="field-error">{{ m }}</span> }</div>
                    <div class="field" [class.invalid]="err(account, 'ownerEmail')"><label class="label" for="d-oemail">Admin email (sign-in)</label><input id="d-oemail" class="input" type="email" formControlName="ownerEmail" />@if (err(account, 'ownerEmail'); as m) { <span class="field-error">{{ m }}</span> }</div>
                  </div>
                  <p class="hint">Last signed in: {{ p.owner.lastLoginAt ? (p.owner.lastLoginAt | date: 'd MMM y, h:mm a') : 'never' }}</p>
                }
              </div>
              <div class="panel-foot"><button type="submit" class="btn btn-primary" [disabled]="busy() === 'account' || account.pristine">{{ busy() === 'account' ? 'Saving…' : 'Save details' }}</button></div>
            </form>

            <!-- Access -->
            <section class="panel">
              <div class="panel-head"><h2>Pages and buttons</h2><button type="button" class="btn btn-ghost btn-sm" (click)="allOn()" [disabled]="allAreOn()">Turn everything on</button></div>
              <div class="panel-body">
                <p class="muted" style="margin-bottom: 14px">Switch off what this parlour should not see. It applies to this parlour only and is enforced by the server, not just hidden.</p>
                <app-feature-toggles [defs]="defs()" [(values)]="draft" />
              </div>
              <div class="panel-foot">
                <span class="muted small grow">{{ dirty() ? 'You have unsaved changes.' : 'Saved. Takes effect immediately.' }}</span>
                <button type="button" class="btn btn-secondary" [disabled]="!dirty()" (click)="resetDraft()">Undo</button>
                <button type="button" class="btn btn-primary" [disabled]="!dirty() || busy() === 'features'" (click)="saveFeatures()">{{ busy() === 'features' ? 'Saving…' : 'Save access' }}</button>
              </div>
            </section>
          </div>

          <div class="stack">
            <!-- Preview -->
            <section class="panel">
              <div class="panel-head"><h2>What they will see</h2></div>
              <div class="panel-body stack-sm">
                <div><div class="label">Admin sidebar</div><div class="chipline">@for (i of adminSidebar(); track i.path) { <span class="badge">{{ i.label }}</span> }</div></div>
                <div><div class="label">Staff sidebar</div><div class="chipline">@for (i of staffSidebar(); track i.path) { <span class="badge">{{ i.label }}</span> }</div></div>
                <p class="hint">Reflects the switches above, including unsaved changes.</p>
              </div>
            </section>

            <!-- Password -->
            <form class="panel" [formGroup]="reset" (ngSubmit)="resetPassword()" novalidate>
              <div class="panel-head"><h2>Reset admin password</h2></div>
              <div class="panel-body stack-sm">
                @if (resetError()) { <div class="form-alert" role="alert">{{ resetError() }}</div> }
                <div class="field" [class.invalid]="err(reset, 'password')">
                  <label class="label" for="d-pass">New temporary password</label>
                  <div class="row"><input id="d-pass" class="input grow" type="text" formControlName="password" autocomplete="off" spellcheck="false" /><button type="button" class="btn btn-secondary" (click)="reset.controls.password.setValue(newPassword()); reset.markAsDirty()">Generate</button></div>
                  @if (err(reset, 'password'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">They are signed out everywhere and an account lock is cleared.</span> }
                </div>
              </div>
              <div class="panel-foot"><button type="submit" class="btn btn-secondary" [disabled]="busy() === 'reset'">{{ busy() === 'reset' ? 'Resetting…' : 'Reset password' }}</button></div>
            </form>

            <!-- Danger -->
            <section class="panel danger">
              <div class="panel-head"><h2>Suspend or delete</h2></div>
              <div class="panel-body stack">
                <div class="drow">
                  <div class="grow"><strong>{{ p.status === 'active' ? 'Suspend parlour' : 'Reactivate parlour' }}</strong><p class="muted small">{{ p.status === 'active' ? 'Everyone is signed out and cannot sign in until you reactivate. Nothing is deleted.' : 'Lets everyone sign in again.' }}</p></div>
                  @if (p.status === 'active') { <button type="button" class="btn btn-danger" (click)="confirmSuspend.set(true)">Suspend</button> }
                  @else { <button type="button" class="btn btn-secondary" [disabled]="busy() === 'status'" (click)="setStatus('active')">Reactivate</button> }
                </div>
                <div class="drow">
                  <div class="grow"><strong>Delete parlour</strong><p class="muted small">Permanently removes the parlour, its team, customers, services and all bills. This cannot be undone.</p></div>
                  <button type="button" class="btn btn-danger" (click)="openDelete()"><app-icon name="trash" [size]="16" /> Delete</button>
                </div>
              </div>
            </section>
          </div>
        </div>

        @if (confirmSuspend()) {
          <app-modal title="Suspend this parlour?" (closed)="confirmSuspend.set(false)">
            <p>Everyone at <strong>{{ p.name }}</strong> will be signed out and blocked from signing in until you reactivate it. Their data is kept. Anyone already signed in can keep working for up to 15 minutes.</p>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="confirmSuspend.set(false)">Cancel</button>
              <button type="button" class="btn btn-danger" [disabled]="busy() === 'status'" (click)="setStatus('suspended')">Suspend parlour</button>
            </ng-container>
          </app-modal>
        }

        @if (deleting()) {
          <app-modal title="Delete this parlour?" (closed)="deleting.set(false)">
            <form id="delete-form" (submit)="$event.preventDefault(); remove()" class="stack">
              <div class="form-alert">This permanently deletes <strong>{{ p.name }}</strong> with {{ p.counts.team }} team member{{ p.counts.team === 1 ? '' : 's' }}, {{ p.counts.customers }} customer{{ p.counts.customers === 1 ? '' : 's' }} and {{ p.counts.bills }} bill{{ p.counts.bills === 1 ? '' : 's' }}. It cannot be undone. If you only want to stop access, suspend it instead.</div>
              @if (deleteError()) { <div class="form-alert" role="alert">{{ deleteError() }}</div> }
              <div class="field">
                <label class="label" for="d-confirm">Type <strong>{{ p.name }}</strong> to confirm</label>
                <input id="d-confirm" class="input" name="confirm" autocomplete="off" [value]="confirmText()" (input)="confirmText.set($any($event.target).value)" />
              </div>
            </form>
            <ng-container modal-foot>
              <button type="button" class="btn btn-secondary" (click)="deleting.set(false)">Cancel</button>
              <button type="submit" form="delete-form" class="btn btn-danger" [disabled]="!nameMatches() || busy() === 'delete'">{{ busy() === 'delete' ? 'Deleting…' : 'Delete permanently' }}</button>
            </ng-container>
          </app-modal>
        }
        }
      }
    </div>`,
  styles: [`
    .head { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 20px; }
    .cols { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 24px; align-items: start; }
    .panel-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 12px 20px; border-top: 1px solid var(--line); background: var(--sunken); border-radius: 0 0 var(--r-panel) var(--r-panel); }
    .chipline { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .danger { border-color: #e9c3bf; }
    .drow { display: flex; align-items: center; gap: 16px; }
    .drow + .drow { padding-top: 16px; border-top: 1px solid var(--line); }
    @media (max-width: 999px) { .cols { grid-template-columns: minmax(0, 1fr); } }
  `],
})
export class ParlourDetailComponent {
  private readonly api = inject(PlatformApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  protected readonly parlour = signal<PlatformParlour | null>(null);
  protected readonly defs = signal<FeatureDef[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal<'' | 'account' | 'features' | 'reset' | 'status' | 'delete'>('');

  protected readonly draft = signal<Record<string, boolean>>({});
  protected readonly dirty = computed(() => !!this.parlour() && !sameSwitches(this.draft(), this.parlour()!.features));
  protected readonly allAreOn = computed(() => Object.values(this.draft()).every((v) => v !== false));
  protected readonly adminSidebar = computed(() => ADMIN_NAV.filter((i) => !i.feature || this.draft()[i.feature] !== false));
  protected readonly staffSidebar = computed(() => STAFF_NAV.filter((i) => !i.feature || this.draft()[i.feature] !== false));

  protected readonly accountError = signal('');
  protected readonly resetError = signal('');
  protected readonly deleteError = signal('');
  protected readonly confirmSuspend = signal(false);
  protected readonly deleting = signal(false);
  protected readonly confirmText = signal('');
  protected readonly nameMatches = computed(() => this.confirmText().trim().toLowerCase() === (this.parlour()?.name ?? '\u0000').trim().toLowerCase());

  protected readonly account = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    ownerName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    ownerEmail: ['', [Validators.required, Validators.email]],
  });
  protected readonly reset = this.fb.group({
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
  });

  constructor() {
    forkJoin({ p: this.api.get(this.id), d: this.api.features() }).subscribe({
      next: ({ p, d }) => { this.defs.set(d); this.show(p); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected err(form: { get(n: string): AbstractControl | null }, name: string) {
    return controlError(form.get(name), { required: 'Required', pattern: 'Include at least one letter and one number' });
  }
  protected newPassword() { return generatePassword(); }

  /** Put a freshly loaded parlour on screen. */
  private show(p: PlatformParlour) {
    this.parlour.set(p);
    this.draft.set({ ...p.features });
    this.account.reset({ name: p.name, ownerName: p.owner?.name ?? '', ownerEmail: p.owner?.email ?? '' });
  }

  protected saveAccount() {
    this.accountError.set('');
    const p = this.parlour();
    if (!p) return;
    if (this.account.invalid) { this.account.markAllAsTouched(); return; }
    const v = this.account.getRawValue();
    const calls = [];
    if (v.name.trim() !== p.name) calls.push(this.api.update(p.id, { name: v.name.trim() }));
    if (p.owner && (v.ownerName.trim() !== p.owner.name || v.ownerEmail.trim().toLowerCase() !== p.owner.email)) {
      calls.push(this.api.updateOwner(p.id, { name: v.ownerName.trim(), email: v.ownerEmail.trim() }));
    }
    if (!calls.length) { this.account.markAsPristine(); return; }
    this.busy.set('account');
    concat(...calls).pipe(last()).subscribe({
      next: (updated) => {
        this.busy.set('');
        this.parlour.set(updated); // the switches the person is editing (draft) are left alone
        this.account.reset({ name: updated.name, ownerName: updated.owner?.name ?? '', ownerEmail: updated.owner?.email ?? '' });
        this.toast.success('Details saved');
      },
      error: (e) => {
        this.busy.set('');
        const info = parseError(e);
        if (info.code === 'EMAIL_TAKEN') { this.account.controls.ownerEmail.setErrors({ server: info.message }); this.account.controls.ownerEmail.markAsTouched(); }
        else if (!applyFieldErrors(this.account, info)) this.accountError.set(info.message);
      },
    });
  }
  protected resetDraft() { this.draft.set({ ...this.parlour()!.features }); }
  protected allOn() { this.draft.update((d) => Object.fromEntries(Object.keys(d).map((k) => [k, true]))); }

  protected saveFeatures() {
    this.busy.set('features');
    this.api.update(this.id, { features: this.draft() }).subscribe({
      next: (p) => { this.busy.set(''); this.parlour.set(p); this.draft.set({ ...p.features }); this.toast.success('Access updated. It applies right away.'); },
      error: (e) => { this.busy.set(''); this.toast.error(parseError(e).message); },
    });
  }

  protected resetPassword() {
    this.resetError.set('');
    if (this.reset.invalid) { this.reset.markAllAsTouched(); return; }
    this.busy.set('reset');
    const password = this.reset.getRawValue().password;
    this.api.resetOwnerPassword(this.id, password).subscribe({
      next: () => { this.busy.set(''); this.reset.reset({ password: '' }); this.toast.success('Password reset. The admin has been signed out.'); },
      error: (e) => { this.busy.set(''); const info = parseError(e); if (!applyFieldErrors(this.reset, info)) this.resetError.set(info.message); },
    });
  }

  protected setStatus(status: 'active' | 'suspended') {
    this.busy.set('status');
    this.api.update(this.id, { status }).subscribe({
      next: (p) => { this.busy.set(''); this.confirmSuspend.set(false); this.parlour.update((cur) => (cur ? { ...cur, status: p.status } : cur)); this.toast.success(status === 'active' ? 'Parlour reactivated' : 'Parlour suspended'); },
      error: (e) => { this.busy.set(''); this.toast.error(parseError(e).message); },
    });
  }

  protected openDelete() { this.confirmText.set(''); this.deleteError.set(''); this.deleting.set(true); }
  protected remove() {
    if (!this.nameMatches()) return;
    this.busy.set('delete');
    const name = this.parlour()!.name;
    this.api.remove(this.id, this.confirmText()).subscribe({
      next: () => { this.toast.success(`${name} deleted`); void this.router.navigate(['/superadmin/parlours']); },
      error: (e) => { this.busy.set(''); this.deleteError.set(parseError(e).message); },
    });
  }
}
