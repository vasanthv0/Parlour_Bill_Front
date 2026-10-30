/** Small display helpers shared by the two attendance screens. */

/** "85 m" up close, "1.4 km" further out. Rounds up so a person 100.4 m away is never told "100 m, limit 100 m". */
export const formatDistance = (m: number): string => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.ceil(m)} m`);

/** A time of day in the parlour's own time zone, whatever zone this device is set to. */
export function formatTime(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
  } catch {
    // An unknown time zone name: fall back to the device's own rather than showing nothing.
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }
}

/** "8h 12m", or '' while the person is still checked in. */
export function formatWorked(checkInIso: string, checkOutIso: string | null | undefined): string {
  if (!checkOutIso) return '';
  const mins = Math.max(0, Math.round((Date.parse(checkOutIso) - Date.parse(checkInIso)) / 60_000));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** An OpenStreetMap link (free, no account or key) so an admin can see where a check-in happened. */
export const mapUrl = (lat: number, lng: number): string =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
