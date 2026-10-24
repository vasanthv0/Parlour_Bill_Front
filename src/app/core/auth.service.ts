import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { Role, User } from './models';
import { ToastService } from './toast.service';

interface Session { accessToken: string; user: User }

/**
 * Session state. The access token lives in memory only (never localStorage), so injected scripts cannot
 * read it. The longer-lived refresh token sits in an httpOnly cookie the browser sends to /auth/* only.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly api = `${environment.apiUrl}/auth`;

  private token: string | null = null;
  private refreshing$: Observable<string> | null = null;

  private readonly _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();
  readonly role = computed<Role | null>(() => this._user()?.role ?? null);

  get accessToken(): string | null { return this.token; }

  /** The URL prefix of each role's area, and where they land after signing in. */
  basePath(): '/superadmin' | '/admin' | '/staff' {
    const role = this.role();
    return role === 'super_admin' ? '/superadmin' : role === 'admin' ? '/admin' : '/staff';
  }
  homePath(): string {
    switch (this.role()) {
      case 'super_admin': return '/superadmin/parlours';
      case 'admin': return this.hasFeature('page.dashboard') ? '/admin/dashboard' : '/admin/new-bill';
      default: return '/staff/new-bill';
    }
  }

  /** Is this page or button switched on for the signed-in person's parlour? (The API enforces it too.) */
  hasFeature(key: string): boolean {
    const features = this._user()?.features;
    return features ? features[key] !== false : true;
  }

  /** Pull the latest parlour name and switches, e.g. after the API refused something that was switched off. */
  reloadProfile(): void {
    this.http.get<{ data: User }>(`${this.api}/me`).subscribe({ next: (r) => this._user.set(r.data), error: () => undefined });
  }

  /** Runs once at startup: if a refresh cookie exists, quietly sign the person back in. */
  restore(): Promise<void> {
    return firstValueFrom(this.refresh().pipe(map(() => undefined), catchError(() => of(undefined))));
  }

  login(email: string, password: string): Observable<User> {
    return this.http.post<{ data: Session }>(`${this.api}/login`, { email, password }).pipe(map((r) => this.start(r.data)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<User> {
    return this.http
      .post<{ data: Session }>(`${this.api}/change-password`, { currentPassword, newPassword })
      .pipe(map((r) => this.start(r.data)));
  }

  /** One refresh at a time: parallel 401s all wait on the same request. */
  refresh(): Observable<string> {
    if (!this.refreshing$) {
      this.refreshing$ = this.http.post<{ data: Session }>(`${this.api}/refresh`, {}).pipe(
        map((r) => {
          this.start(r.data);
          return r.data.accessToken;
        }),
        finalize(() => (this.refreshing$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshing$;
  }

  logout(): void {
    this.http.post(`${this.api}/logout`, {}).pipe(catchError(() => of(null))).subscribe();
    this.clear();
    void this.router.navigate(['/login']);
  }

  /** The session can no longer be renewed (expired, revoked, or the account was disabled). */
  expire(): void {
    if (!this._user()) return;
    this.clear();
    this.toast.error('Your session ended. Please sign in again.');
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  private start(session: Session): User {
    this.token = session.accessToken;
    this._user.set(session.user);
    return session.user;
  }

  private clear() {
    this.token = null;
    this._user.set(null);
  }
}
