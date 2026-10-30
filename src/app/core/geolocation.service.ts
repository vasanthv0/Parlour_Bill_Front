import { Injectable } from '@angular/core';
import { GeoReading, GeolocationLike, captureBestPosition } from './geo-capture';

/**
 * The browser's own Geolocation API: free, and needs no map or location service. It only works on HTTPS
 * (or localhost) and only after the person allows it.
 */
@Injectable({ providedIn: 'root' })
export class GeolocationService {
  /**
   * A fresh reading, as accurate as the device can manage within `maxWaitMs`. Rejects with a GeoError whose
   * `kind` says why: unsupported, insecure, denied, unavailable or timeout.
   */
  getBestPosition(targetAccuracyM: number, maxWaitMs = 15_000): Promise<GeoReading> {
    return captureBestPosition(typeof navigator === 'undefined' ? undefined : (navigator.geolocation as GeolocationLike | undefined), {
      targetAccuracyM,
      maxWaitMs,
      secureContext: typeof window === 'undefined' ? undefined : window.isSecureContext,
    });
  }
}
