import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling, RouterStateSnapshot } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { authInterceptor } from './core/auth.interceptor';

/** "Bills · ParlourBill" in the browser tab. */
@Injectable({ providedIn: 'root' })
class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  override updateTitle(snapshot: RouterStateSnapshot) {
    const t = this.buildTitle(snapshot);
    this.title.setTitle(t ? `${t} · ${environment.appName}` : environment.appName);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // Before the first screen renders, try to restore a session from the refresh cookie.
    provideAppInitializer(() => inject(AuthService).restore()),
  ],
};
