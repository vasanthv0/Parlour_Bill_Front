import { Role } from './models';

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** If set, the item only appears when this feature is on for the parlour. */
  feature?: string;
}

// Three workspaces: the platform admin runs the business of selling this, parlour admins run a parlour,
// staff run the counter.
export const SUPER_NAV: NavItem[] = [{ path: 'parlours', label: 'Parlours', icon: 'building' }];

export const ADMIN_NAV: NavItem[] = [
  { path: 'dashboard', label: 'Dashboard', icon: 'dashboard', feature: 'page.dashboard' },
  { path: 'new-bill', label: 'New bill', icon: 'receipt' },
  { path: 'invoices', label: 'All bills', icon: 'list' },
  { path: 'customers', label: 'Customers', icon: 'users', feature: 'page.customers' },
  { path: 'services', label: 'Services', icon: 'scissors', feature: 'page.services' },
  { path: 'combos', label: 'Combos', icon: 'package', feature: 'page.combos' },
  { path: 'referrals', label: 'Referrals', icon: 'gift', feature: 'page.referrals' },
  { path: 'team', label: 'Team', icon: 'user', feature: 'page.team' },
  { path: 'attendance', label: 'My attendance', icon: 'pin', feature: 'page.attendance' },
  { path: 'attendance-log', label: 'Staff attendance', icon: 'clock', feature: 'page.attendance' },
  { path: 'settings', label: 'Settings', icon: 'sliders', feature: 'page.settings' },
];

export const STAFF_NAV: NavItem[] = [
  { path: 'new-bill', label: 'New bill', icon: 'receipt' },
  { path: 'invoices', label: 'My bills', icon: 'list' },
  { path: 'attendance', label: 'Attendance', icon: 'pin', feature: 'page.attendance' },
  { path: 'customers', label: 'Customers', icon: 'users', feature: 'page.customers' },
];

export const navFor = (role: Role | null): NavItem[] => (role === 'super_admin' ? SUPER_NAV : role === 'admin' ? ADMIN_NAV : STAFF_NAV);
