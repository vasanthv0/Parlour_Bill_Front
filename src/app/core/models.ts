export type Role = 'super_admin' | 'admin' | 'staff';
export type PaymentMethod = 'cash' | 'upi' | 'card';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  parlourId: string | null;
  parlourName?: string | null;
  /** What this parlour may use, set by the platform admin. Null for the platform admin themself. */
  features?: Record<string, boolean> | null;
}

export interface Parlour {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  gstNumber: string | null;
  currency: string;
  timezone: string;
  taxPercent: number;
  invoicePrefix: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  price: number;
  durationMin: number;
  isActive: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  createdAt: string;
  visits?: number;
  totalSpent?: number;
  lastVisit?: string | null;
  recentInvoices?: { id: string; number: string; total: number; status: InvoiceStatus; paymentMethod: PaymentMethod; createdAt: string }[];
}

export type InvoiceStatus = 'paid' | 'void';

export interface InvoiceRow {
  id: string;
  number: string;
  customerId: string | null;
  customerName: string;
  createdBy: string | null;
  createdByName: string | null;
  subtotal: number;
  discount: number;
  referrerId: string | null;
  referralPercent: number;
  referralDiscount: number;
  taxPercent: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  notes: string | null;
  status: InvoiceStatus;
  voidReason: string | null;
  voidedAt: string | null;
  createdAt: string;
}

export interface Invoice extends InvoiceRow {
  customerPhone: string | null;
  referrer: { id: string; code: string; name: string } | null;
  parlour: { name: string; phone: string | null; address: string | null; gstNumber: string | null };
  items: { id: string; comboId: string | null; description: string | null; name: string; unitPrice: number; quantity: number; lineTotal: number }[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  /** Collected when the member is added. Accounts made before that show none. */
  mobile: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Summary {
  range: { from: string; to: string };
  totals: { invoices: number; revenue: number; discounts: number; referralDiscounts: number; tax: number; averageBill: number };
  byPayment: { method: PaymentMethod; invoices: number; revenue: number }[];
  daily: { day: string; revenue: number; invoices: number }[];
  topServices: { name: string; quantity: number; revenue: number }[];
  byStaff: { name: string; invoices: number; revenue: number }[];
}

export interface PageMeta { page: number; limit: number; total: number; pages: number }
export interface Paged<T> { items: T[]; meta: PageMeta }

// ── Platform (super admin) ─────────────────────────────────────────
export interface FeatureDef {
  key: string;
  group: 'page' | 'action';
  requires?: string;
  label: string;
  description: string;
}

export interface PlatformParlour {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  createdAt: string;
  /** What the platform admin has set. A button can read "on" here yet be unavailable because its page is off. */
  features: Record<string, boolean>;
  owner: { id: string; name: string; email: string; isActive: boolean; lastLoginAt: string | null } | null;
  counts: { team: number; bills: number; customers: number; services: number };
}

export interface PlatformSummary { parlours: number; active: number; suspended: number; bills: number }

// ── Combos and referrals ───────────────────────────────────────────
export interface ComboItem { serviceId: string; name: string; quantity: number; price: number; isActive: boolean }

export interface Combo {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  createdAt: string;
  items: ComboItem[];
  /** What the same services cost separately, and what the customer saves with the combo. */
  regularPrice: number;
  savings: number;
  /** On, and every service inside is still on the menu. */
  available: boolean;
}

export interface ReferralHistoryRow {
  id: string;
  number: string;
  customerName: string;
  percent: number;
  discount: number;
  total: number;
  status: InvoiceStatus;
  createdAt: string;
}

export interface Referrer {
  id: string;
  code: string;
  name: string;
  contact: string;
  percent: number;
  isActive: boolean;
  createdAt: string;
  bills?: number;
  totalDiscount?: number;
  lastUsedAt?: string | null;
  canDelete?: boolean;
  history?: ReferralHistoryRow[];
}

/** What the billing counter sees when it looks a referrer up. */
export interface ReferrerLookup { id: string; code: string; name: string; percent: number }
