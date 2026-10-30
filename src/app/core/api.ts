import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { GeoReading } from './geo-capture';
import { AttendanceRecord, AttendanceSettings, Combo, Customer, DeviceType, FeatureDef, Invoice, InvoiceRow, LocationCheck, Paged, PaymentMethod, Parlour, PlatformParlour, PlatformSummary, Referrer, ReferrerLookup, Role, Service, Summary, TeamMember, TodayAttendance } from './models';

const API = environment.apiUrl;

/** Builds query params, skipping empty values. */
export const params = (obj: Record<string, string | number | boolean | null | undefined>): HttpParams => {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  return p;
};

type One<T> = { data: T };
type Many<T> = { data: T[]; meta: Paged<T>['meta'] };
const unwrap = <T>() => map((r: One<T>) => r.data);
const unwrapPage = <T>() => map((r: Many<T>): Paged<T> => ({ items: r.data, meta: r.meta }));

@Injectable({ providedIn: 'root' })
export class ParlourApi {
  private readonly http = inject(HttpClient);
  get(): Observable<Parlour> { return this.http.get<One<Parlour>>(`${API}/parlour`).pipe(unwrap()); }
  update(body: Partial<Pick<Parlour, 'name' | 'phone' | 'address' | 'gstNumber' | 'taxPercent' | 'invoicePrefix'>>): Observable<Parlour> {
    return this.http.patch<One<Parlour>>(`${API}/parlour`, body).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class ServicesApi {
  private readonly http = inject(HttpClient);
  list(includeInactive = false): Observable<Service[]> {
    return this.http.get<One<Service[]>>(`${API}/services`, { params: params({ includeInactive }) }).pipe(unwrap());
  }
  create(body: { name: string; category: string; price: number; durationMin: number }): Observable<Service> {
    return this.http.post<One<Service>>(`${API}/services`, body).pipe(unwrap());
  }
  update(id: string, body: Partial<Omit<Service, 'id'>>): Observable<Service> {
    return this.http.patch<One<Service>>(`${API}/services/${id}`, body).pipe(unwrap());
  }
}

@Injectable({ providedIn: 'root' })
export class CustomersApi {
  private readonly http = inject(HttpClient);
  list(q: { search?: string; page?: number; limit?: number }): Observable<Paged<Customer>> {
    return this.http.get<Many<Customer>>(`${API}/customers`, { params: params(q) }).pipe(unwrapPage());
  }
  get(id: string): Observable<Customer> { return this.http.get<One<Customer>>(`${API}/customers/${id}`).pipe(unwrap()); }
  create(body: { name: string; phone: string; email?: string | null; notes?: string | null }): Observable<Customer> {
    return this.http.post<One<Customer>>(`${API}/customers`, body).pipe(unwrap());
  }
  update(id: string, body: { name?: string; phone?: string; email?: string | null; notes?: string | null }): Observable<Customer> {
    return this.http.patch<One<Customer>>(`${API}/customers/${id}`, body).pipe(unwrap());
  }
}

export interface NewInvoice {
  customerId?: string | null;
  walkInName?: string;
  /** Each line is one service or one combo. */
  items: { serviceId?: string; comboId?: string; quantity: number }[];
  referrerId?: string | null;
  discount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

@Injectable({ providedIn: 'root' })
export class InvoicesApi {
  private readonly http = inject(HttpClient);
  create(body: NewInvoice): Observable<Invoice> { return this.http.post<One<Invoice>>(`${API}/invoices`, body).pipe(unwrap()); }
  list(q: { page?: number; limit?: number; from?: string; to?: string; status?: string; search?: string; createdBy?: string }): Observable<Paged<InvoiceRow>> {
    return this.http.get<Many<InvoiceRow>>(`${API}/invoices`, { params: params(q) }).pipe(unwrapPage());
  }
  get(id: string): Observable<Invoice> { return this.http.get<One<Invoice>>(`${API}/invoices/${id}`).pipe(unwrap()); }
  /** A ready-to-open WhatsApp link for this bill. Pass a number for walk-ins, who have none saved. */
  whatsapp(id: string, phone?: string): Observable<{ url: string; message: string; phone: string }> {
    return this.http.get<One<{ url: string; message: string; phone: string }>>(`${API}/invoices/${id}/whatsapp`, { params: params({ phone }) }).pipe(unwrap());
  }
  /** Admin only: everyone who has made at least one bill, for the "made by" filter. */
  makers(): Observable<{ id: string; name: string }[]> { return this.http.get<One<{ id: string; name: string }[]>>(`${API}/invoices/makers`).pipe(unwrap()); }
  void(id: string, reason: string): Observable<Invoice> { return this.http.post<One<Invoice>>(`${API}/invoices/${id}/void`, { reason }).pipe(unwrap()); }
}

@Injectable({ providedIn: 'root' })
export class StaffApi {
  private readonly http = inject(HttpClient);
  list(): Observable<TeamMember[]> { return this.http.get<One<TeamMember[]>>(`${API}/staff`).pipe(unwrap()); }
  create(body: { name: string; email: string; mobile: string; password: string; role: Role }): Observable<TeamMember> {
    return this.http.post<One<TeamMember>>(`${API}/staff`, body).pipe(unwrap());
  }
  update(id: string, body: { name?: string; mobile?: string; role?: Role; isActive?: boolean }): Observable<TeamMember> {
    return this.http.patch<One<TeamMember>>(`${API}/staff/${id}`, body).pipe(unwrap());
  }
  resetPassword(id: string, password: string): Observable<void> { return this.http.post<void>(`${API}/staff/${id}/reset-password`, { password }); }
}

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);
  summary(from?: string, to?: string): Observable<Summary> { return this.http.get<One<Summary>>(`${API}/reports/summary`, { params: params({ from, to }) }).pipe(unwrap()); }
  myDay(): Observable<{ invoices: number; revenue: number }> { return this.http.get<One<{ invoices: number; revenue: number }>>(`${API}/reports/my-day`).pipe(unwrap()); }
}

/** Platform admin only. */
@Injectable({ providedIn: 'root' })
export class PlatformApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API}/platform`;

  features(): Observable<FeatureDef[]> { return this.http.get<One<FeatureDef[]>>(`${this.url}/features`).pipe(unwrap()); }
  summary(): Observable<PlatformSummary> { return this.http.get<One<PlatformSummary>>(`${this.url}/summary`).pipe(unwrap()); }
  list(q: { search?: string; page?: number; limit?: number }): Observable<Paged<PlatformParlour>> {
    return this.http.get<Many<PlatformParlour>>(`${this.url}/parlours`, { params: params(q) }).pipe(unwrapPage());
  }
  get(id: string): Observable<PlatformParlour> { return this.http.get<One<PlatformParlour>>(`${this.url}/parlours/${id}`).pipe(unwrap()); }
  create(body: { parlourName: string; adminName: string; email: string; password: string; features?: Record<string, boolean> }): Observable<PlatformParlour> {
    return this.http.post<One<PlatformParlour>>(`${this.url}/parlours`, body).pipe(unwrap());
  }
  update(id: string, body: { name?: string; status?: 'active' | 'suspended'; features?: Record<string, boolean> }): Observable<PlatformParlour> {
    return this.http.patch<One<PlatformParlour>>(`${this.url}/parlours/${id}`, body).pipe(unwrap());
  }
  updateOwner(id: string, body: { name?: string; email?: string }): Observable<PlatformParlour> {
    return this.http.patch<One<PlatformParlour>>(`${this.url}/parlours/${id}/owner`, body).pipe(unwrap());
  }
  resetOwnerPassword(id: string, password: string): Observable<void> { return this.http.post<void>(`${this.url}/parlours/${id}/owner/reset-password`, { password }); }
  remove(id: string, confirmName: string): Observable<void> { return this.http.delete<void>(`${this.url}/parlours/${id}`, { body: { confirmName } }); }
}

@Injectable({ providedIn: 'root' })
export class CombosApi {
  private readonly http = inject(HttpClient);
  list(includeInactive = false): Observable<Combo[]> { return this.http.get<One<Combo[]>>(`${API}/combos`, { params: params({ includeInactive }) }).pipe(unwrap()); }
  create(body: { name: string; price: number; items: { serviceId: string; quantity: number }[] }): Observable<Combo> {
    return this.http.post<One<Combo>>(`${API}/combos`, body).pipe(unwrap());
  }
  update(id: string, body: { name?: string; price?: number; items?: { serviceId: string; quantity: number }[]; isActive?: boolean }): Observable<Combo> {
    return this.http.patch<One<Combo>>(`${API}/combos/${id}`, body).pipe(unwrap());
  }
  remove(id: string): Observable<void> { return this.http.delete<void>(`${API}/combos/${id}`); }
}

@Injectable({ providedIn: 'root' })
export class ReferrersApi {
  private readonly http = inject(HttpClient);
  list(q: { search?: string; page?: number; limit?: number }): Observable<Paged<Referrer>> {
    return this.http.get<Many<Referrer>>(`${API}/referrers`, { params: params(q) }).pipe(unwrapPage());
  }
  /** For the billing counter: active referrers matching a name or ID. */
  lookup(q: string): Observable<ReferrerLookup[]> { return this.http.get<One<ReferrerLookup[]>>(`${API}/referrers/lookup`, { params: params({ q }) }).pipe(unwrap()); }
  get(id: string): Observable<Referrer> { return this.http.get<One<Referrer>>(`${API}/referrers/${id}`).pipe(unwrap()); }
  create(body: { name: string; contact: string; percent: number }): Observable<Referrer> { return this.http.post<One<Referrer>>(`${API}/referrers`, body).pipe(unwrap()); }
  update(id: string, body: { name?: string; contact?: string; percent?: number; isActive?: boolean }): Observable<Referrer> {
    return this.http.patch<One<Referrer>>(`${API}/referrers/${id}`, body).pipe(unwrap());
  }
  remove(id: string): Observable<void> { return this.http.delete<void>(`${API}/referrers/${id}`); }
}

/** What a check-in or check-out sends: the GPS reading, which kind of device, and (on a shared one) the person's password. */
export interface AttendanceAction extends GeoReading { deviceType: DeviceType; password?: string }

@Injectable({ providedIn: 'root' })
export class AttendanceApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${API}/attendance`;

  today(): Observable<TodayAttendance> { return this.http.get<One<TodayAttendance>>(`${this.url}/today`).pipe(unwrap()); }
  /** The server measures the distance (Haversine) and says whether this reading would be accepted. Records nothing. */
  locationCheck(reading: GeoReading): Observable<LocationCheck> { return this.http.post<One<LocationCheck>>(`${this.url}/location-check`, reading).pipe(unwrap()); }
  checkIn(body: AttendanceAction): Observable<TodayAttendance> { return this.http.post<One<TodayAttendance>>(`${this.url}/check-in`, body).pipe(unwrap()); }
  checkOut(body: AttendanceAction): Observable<TodayAttendance> { return this.http.post<One<TodayAttendance>>(`${this.url}/check-out`, body).pipe(unwrap()); }

  /** Admin only. */
  settings(): Observable<AttendanceSettings> { return this.http.get<One<AttendanceSettings>>(`${this.url}/settings`).pipe(unwrap()); }
  saveSettings(body: { latitude: number; longitude: number; radiusM?: number; maxAccuracyM?: number }): Observable<AttendanceSettings> {
    return this.http.put<One<AttendanceSettings>>(`${this.url}/settings`, body).pipe(unwrap());
  }
  records(q: { from?: string; to?: string; userId?: string; page?: number; limit?: number }): Observable<Paged<AttendanceRecord>> {
    return this.http.get<Many<AttendanceRecord>>(`${this.url}/records`, { params: params(q) }).pipe(unwrapPage());
  }
}
