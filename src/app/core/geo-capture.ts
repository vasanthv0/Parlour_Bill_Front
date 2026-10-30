/**
 * Getting a usable GPS reading out of the browser, with no Angular in it so it can be tested on its own.
 *
 * Phones usually answer a location request twice: first a rough position from Wi-Fi or mobile masts (sometimes
 * a kilometre out), then a proper GPS fix a few seconds later. Taking only the first answer would make
 * "GPS too inaccurate" the most common failure. So we watch for readings, stop as soon as one is good enough,
 * and if none ever is, hand back the best one we saw and let the server judge it.
 */

export type GeoFailure = 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout';

export class GeoError extends Error {
  constructor(readonly kind: GeoFailure) {
    super(kind);
    this.name = 'GeoError';
  }
}

/** What the server is sent. capturedAt is the device's own timestamp for the reading (epoch ms). */
export interface GeoReading {
  latitude: number;
  longitude: number;
  /** Metres. The browser's estimate of how far off the position could be. */
  accuracy: number;
  capturedAt: number;
}

interface PositionLike { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }
interface ErrorLike { code: number }

/** The part of the browser's Geolocation API we use, so a test can stand in for it. */
export interface GeolocationLike {
  watchPosition(ok: (p: PositionLike) => void, fail: (e: ErrorLike) => void, options?: object): number;
  clearWatch(id: number): void;
}

export interface CaptureOptions {
  /** Stop as soon as a reading is this accurate or better (metres). */
  targetAccuracyM: number;
  /** Give up waiting for a better one after this long. */
  maxWaitMs: number;
  /** window.isSecureContext. Browsers only allow location on HTTPS (and localhost). */
  secureContext?: boolean;
}

// GeolocationPositionError.code values
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

export function captureBestPosition(geo: GeolocationLike | undefined, opts: CaptureOptions): Promise<GeoReading> {
  if (!geo) return Promise.reject(new GeoError('unsupported'));
  if (opts.secureContext === false) return Promise.reject(new GeoError('insecure'));

  return new Promise<GeoReading>((resolve, reject) => {
    let best: GeoReading | null = null;
    let lastFailure: GeoFailure | null = null; // a hiccup is only reported if no reading ever arrives
    let finished = false;
    let watchId: number | null = null;

    const finish = (settle: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (watchId !== null) geo.clearWatch(watchId);
      settle();
    };

    const timer = setTimeout(
      () => finish(() => (best ? resolve(best) : reject(new GeoError(lastFailure ?? 'timeout')))),
      opts.maxWaitMs,
    );

    watchId = geo.watchPosition(
      (p) => {
        if (finished) return;
        const reading: GeoReading = {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
          accuracy: p.coords.accuracy,
          capturedAt: p.timestamp,
        };
        if (!best || reading.accuracy < best.accuracy) best = reading;
        if (best.accuracy <= opts.targetAccuracyM) {
          const good = best;
          finish(() => resolve(good));
        }
      },
      (e) => {
        if (finished) return;
        if (e.code === PERMISSION_DENIED) finish(() => reject(new GeoError('denied'))); // no point waiting
        else lastFailure = e.code === TIMEOUT ? 'timeout' : 'unavailable';
      },
      // maximumAge 0: never accept a cached position from earlier.
      { enableHighAccuracy: true, maximumAge: 0, timeout: opts.maxWaitMs },
    );
    // A callback that fired before watchPosition returned could not clear the watch yet.
    if (finished) geo.clearWatch(watchId);
  });
}
