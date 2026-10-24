import { Routes } from '@angular/router';
import { authGuard, featureGuard, guestGuard, roleGuard, rootGuard } from './core/guards';

const shell = () => import('./features/shell/shell.component').then((m) => m.ShellComponent);

/** Screens both roles use. The API limits what each role can see (staff only see their own bills). */
const shared: Routes = [
  { path: 'new-bill', title: 'New bill', loadComponent: () => import('./features/shared/new-bill.component').then((m) => m.NewBillComponent) },
  { path: 'invoices', title: 'Bills', loadComponent: () => import('./features/shared/invoices.component').then((m) => m.InvoicesComponent) },
  { path: 'invoices/:id', title: 'Bill', loadComponent: () => import('./features/shared/invoice-detail.component').then((m) => m.InvoiceDetailComponent) },
  { path: 'customers', title: 'Customers', canActivate: [featureGuard('page.customers')], loadComponent: () => import('./features/shared/customers.component').then((m) => m.CustomersComponent) },
  { path: 'account', title: 'Account', loadComponent: () => import('./features/shared/account.component').then((m) => m.AccountComponent) },
];

export const routes: Routes = [
  { path: '', pathMatch: 'full', canActivate: [rootGuard], children: [] },

  { path: 'login', title: 'Sign in', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },

  // Platform admin (the developer): creates and manages parlours.
  {
    path: 'superadmin',
    canActivate: [authGuard, roleGuard('super_admin')],
    loadComponent: shell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'parlours' },
      { path: 'parlours', title: 'Parlours', loadComponent: () => import('./features/superadmin/parlours.component').then((m) => m.ParloursComponent) },
      { path: 'parlours/:id', title: 'Parlour', loadComponent: () => import('./features/superadmin/parlour-detail.component').then((m) => m.ParlourDetailComponent) },
      { path: 'account', title: 'Account', loadComponent: () => import('./features/shared/account.component').then((m) => m.AccountComponent) },
    ],
  },

  // Parlour owner / manager workspace. Staff and the platform admin are redirected to their own area.
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('admin')],
    loadComponent: shell,
    children: [
      { path: '', pathMatch: 'full', canActivate: [rootGuard], children: [] },
      { path: 'dashboard', title: 'Dashboard', canActivate: [featureGuard('page.dashboard')], loadComponent: () => import('./features/admin/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'combos', title: 'Combos', canActivate: [featureGuard('page.combos')], loadComponent: () => import('./features/admin/combos.component').then((m) => m.CombosComponent) },
      { path: 'referrals', title: 'Referrals', canActivate: [featureGuard('page.referrals')], loadComponent: () => import('./features/admin/referrals.component').then((m) => m.ReferralsComponent) },
      { path: 'referrals/:id', title: 'Referrer', canActivate: [featureGuard('page.referrals')], loadComponent: () => import('./features/admin/referral-detail.component').then((m) => m.ReferralDetailComponent) },
      { path: 'services', title: 'Services', canActivate: [featureGuard('page.services')], loadComponent: () => import('./features/admin/services.component').then((m) => m.ServicesComponent) },
      { path: 'team', title: 'Team', canActivate: [featureGuard('page.team')], loadComponent: () => import('./features/admin/team.component').then((m) => m.TeamComponent) },
      { path: 'settings', title: 'Settings', canActivate: [featureGuard('page.settings')], loadComponent: () => import('./features/admin/settings.component').then((m) => m.SettingsComponent) },
      ...shared,
    ],
  },

  // Counter workspace for staff.
  {
    path: 'staff',
    canActivate: [authGuard, roleGuard('staff')],
    loadComponent: shell,
    children: [{ path: '', pathMatch: 'full', redirectTo: 'new-bill' }, ...shared],
  },

  { path: '**', redirectTo: '' },
];
