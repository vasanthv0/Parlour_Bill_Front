import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { StaffApi } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { applyFieldErrors, controlError, parseError } from '../../core/errors';
import { Role, TeamMember } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';

type Dialog = { kind: 'add' } | { kind: 'edit'; member: TeamMember } | { kind: 'password'; member: TeamMember } | null;
const mobileRule = Validators.pattern(/^[0-9+\-\s()]{7,20}$/);
const passwordRules = [Validators.required, Validators.minLength(8), Validators.maxLength(72), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)];

@Component({
  selector: 'app-team',
  imports: [DatePipe, ReactiveFormsModule, IconComponent, ModalComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Team</h1><p class="sub">Staff can bill and manage customers. Admins can also see reports and change settings.</p></div>
        @if (canAdd()) { <button type="button" class="btn btn-primary" (click)="open({ kind: 'add' })"><app-icon name="plus" /> Add team member</button> }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height: 240px"></div>
      } @else if (error()) {
        <div class="panel empty"><h3>Could not load your team</h3><p>{{ error() }}</p><button class="btn btn-secondary" (click)="load()">Try again</button></div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Name</th><th>Role</th><th>Last sign-in</th><th>Status</th><th><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              @for (m of members(); track m.id) {
                <tr [class.off]="!m.isActive">
                  <td><strong>{{ m.name }}</strong> @if (m.id === me()?.id) { <span class="badge">You</span> }<div class="muted small">{{ m.email }}</div><div class="muted small num">{{ m.mobile || 'No mobile number' }}</div></td>
                  <td><span class="badge" [class.badge-admin]="m.role === 'admin'">{{ m.role === 'admin' ? 'Admin' : 'Staff' }}</span></td>
                  <td class="muted">{{ m.lastLoginAt ? (m.lastLoginAt | date: 'd MMM y, h:mm a') : 'Never' }}</td>
                  <td><span class="badge" [class.badge-paid]="m.isActive" [class.badge-void]="!m.isActive">{{ m.isActive ? 'Active' : 'Deactivated' }}</span></td>
                  <td class="cell-actions">
                    @if (canEdit()) { <button type="button" class="btn btn-ghost btn-sm" (click)="open({ kind: 'edit', member: m })"><app-icon name="pencil" [size]="16" /> Edit</button> }
                    @if (canReset()) { <button type="button" class="btn btn-ghost btn-sm" (click)="open({ kind: 'password', member: m })"><app-icon name="key" [size]="16" /> Reset password</button> }
                    @if (m.id !== me()?.id && canDeactivate()) {
                      <button type="button" class="btn btn-ghost btn-sm" (click)="setActive(m, !m.isActive)">{{ m.isActive ? 'Deactivate' : 'Reactivate' }}</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="hint" style="margin-top: 12px">Deactivating someone signs them out and blocks sign-in. Their past bills stay on record.</p>
      }
    </div>

    @if (dialog(); as d) {
      @switch (d.kind) {
        @case ('add') {
          <app-modal title="Add team member" (closed)="close()">
            <form id="team-form" [formGroup]="addForm" (ngSubmit)="add()" class="stack" novalidate>
              @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
              <div class="field" [class.invalid]="err(addForm, 'name')"><label class="label" for="a-name">Name</label><input id="a-name" class="input" formControlName="name" autocomplete="off" />@if (err(addForm, 'name'); as m) { <span class="field-error">{{ m }}</span> }</div>
              <div class="field" [class.invalid]="err(addForm, 'email')"><label class="label" for="a-email">Email</label><input id="a-email" class="input" type="email" formControlName="email" autocomplete="off" />@if (err(addForm, 'email'); as m) { <span class="field-error">{{ m }}</span> }</div>
              <div class="field" [class.invalid]="err(addForm, 'mobile')"><label class="label" for="a-mobile">Mobile number</label><input id="a-mobile" class="input" type="tel" inputmode="tel" formControlName="mobile" autocomplete="off" />@if (err(addForm, 'mobile'); as m) { <span class="field-error">{{ m }}</span> }</div>
              <div class="field" [class.invalid]="err(addForm, 'password')"><label class="label" for="a-pass">Temporary password</label><input id="a-pass" class="input" type="text" formControlName="password" autocomplete="off" />@if (err(addForm, 'password'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">Share it with them; they can change it from their Account page.</span> }</div>
              <div class="field"><label class="label" for="a-role">Role</label><select id="a-role" class="select" formControlName="role"><option value="staff">Staff: billing and customers</option><option value="admin">Admin: everything</option></select></div>
            </form>
            <ng-container modal-foot><button type="button" class="btn btn-secondary" (click)="close()">Cancel</button><button type="submit" form="team-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Adding…' : 'Add member' }}</button></ng-container>
          </app-modal>
        }
        @case ('edit') {
          <app-modal title="Edit team member" (closed)="close()">
            <form id="team-form" [formGroup]="editForm" (ngSubmit)="saveEdit(d.member)" class="stack" novalidate>
              @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
              <div class="field" [class.invalid]="err(editForm, 'name')"><label class="label" for="e-name">Name</label><input id="e-name" class="input" formControlName="name" />@if (err(editForm, 'name'); as m) { <span class="field-error">{{ m }}</span> }</div>
              <div class="field" [class.invalid]="err(editForm, 'mobile')"><label class="label" for="e-mobile">Mobile number</label><input id="e-mobile" class="input" type="tel" inputmode="tel" formControlName="mobile" autocomplete="off" />@if (err(editForm, 'mobile'); as m) { <span class="field-error">{{ m }}</span> }</div>
              <div class="field">
                <label class="label" for="e-role">Role</label>
                <select id="e-role" class="select" formControlName="role"><option value="staff">Staff</option><option value="admin">Admin</option></select>
                @if (d.member.id === me()?.id) { <span class="hint">You cannot change your own role.</span> }
              </div>
            </form>
            <ng-container modal-foot><button type="button" class="btn btn-secondary" (click)="close()">Cancel</button><button type="submit" form="team-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save changes' }}</button></ng-container>
          </app-modal>
        }
        @case ('password') {
          <app-modal [title]="'Reset password for ' + d.member.name" (closed)="close()">
            <form id="team-form" [formGroup]="passForm" (ngSubmit)="resetPassword(d.member)" class="stack" novalidate>
              @if (formError()) { <div class="form-alert" role="alert">{{ formError() }}</div> }
              <p>They will be signed out everywhere and must use the new password next time.</p>
              <div class="field" [class.invalid]="err(passForm, 'password')"><label class="label" for="p-pass">New temporary password</label><input id="p-pass" class="input" type="text" formControlName="password" autocomplete="off" />@if (err(passForm, 'password'); as m) { <span class="field-error">{{ m }}</span> } @else { <span class="hint">At least 8 characters, with a letter and a number.</span> }</div>
            </form>
            <ng-container modal-foot><button type="button" class="btn btn-secondary" (click)="close()">Cancel</button><button type="submit" form="team-form" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Resetting…' : 'Reset password' }}</button></ng-container>
          </app-modal>
        }
      }
    }`,
  styles: [`.off td { color: var(--muted); }`],
})
export class TeamComponent {
  private readonly api = inject(StaffApi);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  protected readonly me = this.auth.user;
  protected readonly canAdd = () => this.auth.hasFeature('action.team.add');
  protected readonly canEdit = () => this.auth.hasFeature('action.team.edit');
  protected readonly canReset = () => this.auth.hasFeature('action.team.reset');
  protected readonly canDeactivate = () => this.auth.hasFeature('action.team.deactivate');

  protected readonly members = signal<TeamMember[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly dialog = signal<Dialog>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');

  protected readonly addForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    email: ['', [Validators.required, Validators.email]],
    mobile: ['', [Validators.required, mobileRule]],
    password: ['', passwordRules],
    role: ['staff' as Role],
  });
  // Editing: older members have no number yet, so it is optional here (it is required when adding).
  protected readonly editForm = this.fb.group({ name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]], mobile: ['', mobileRule], role: ['staff' as Role] });
  protected readonly passForm = this.fb.group({ password: ['', passwordRules] });

  constructor() { this.load(); }

  protected err(form: { get(n: string): AbstractControl | null }, name: string) {
    return controlError(form.get(name), { required: name === 'mobile' ? 'Enter a mobile number' : 'Required', pattern: name === 'mobile' ? 'Enter a valid mobile number' : 'Include at least one letter and one number' });
  }

  protected load() {
    this.loading.set(true);
    this.error.set('');
    this.api.list().subscribe({
      next: (l) => { this.members.set(l); this.loading.set(false); },
      error: (e) => { this.error.set(parseError(e).message); this.loading.set(false); },
    });
  }

  protected open(d: Dialog) {
    this.formError.set('');
    if (d?.kind === 'add') this.addForm.reset({ name: '', email: '', mobile: '', password: '', role: 'staff' });
    if (d?.kind === 'edit') {
      this.editForm.reset({ name: d.member.name, mobile: d.member.mobile ?? '', role: d.member.role });
      if (d.member.id === this.me()?.id) this.editForm.controls.role.disable(); else this.editForm.controls.role.enable();
    }
    if (d?.kind === 'password') this.passForm.reset({ password: '' });
    this.dialog.set(d);
  }
  protected close() { this.dialog.set(null); }

  private run(obs: Observable<unknown>, form: FormGroup, done: string) {
    this.busy.set(true);
    this.formError.set('');
    obs.subscribe({
      next: () => { this.busy.set(false); this.close(); this.toast.success(done); this.load(); },
      error: (e) => { this.busy.set(false); const info = parseError(e); if (!applyFieldErrors(form, info)) this.formError.set(info.message); },
    });
  }

  protected add() {
    if (this.addForm.invalid) { this.addForm.markAllAsTouched(); return; }
    const v = this.addForm.getRawValue();
    this.run(this.api.create({ name: v.name.trim(), email: v.email.trim(), mobile: v.mobile.trim(), password: v.password, role: v.role }), this.addForm, `${v.name.trim()} added to your team`);
  }

  protected saveEdit(m: TeamMember) {
    if (this.editForm.invalid) { this.editForm.markAllAsTouched(); return; }
    const v = this.editForm.getRawValue();
    this.run(this.api.update(m.id, { name: v.name.trim(), ...(v.mobile.trim() ? { mobile: v.mobile.trim() } : {}), ...(m.id === this.me()?.id ? {} : { role: v.role }) }), this.editForm, 'Changes saved');
  }

  protected resetPassword(m: TeamMember) {
    if (this.passForm.invalid) { this.passForm.markAllAsTouched(); return; }
    this.run(this.api.resetPassword(m.id, this.passForm.getRawValue().password), this.passForm, `Password reset for ${m.name}`);
  }

  protected setActive(m: TeamMember, isActive: boolean) {
    this.api.update(m.id, { isActive }).subscribe({
      next: () => { this.toast.success(isActive ? `${m.name} reactivated` : `${m.name} deactivated`); this.load(); },
      error: (e) => this.toast.error(parseError(e).message),
    });
  }
}
