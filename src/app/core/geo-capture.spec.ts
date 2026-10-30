import { GeoError, GeolocationLike, captureBestPosition } from './geo-capture';

/** A stand-in for navigator.geolocation that the test drives by hand. */
function fakeGeo() {
  let ok: (p: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }) => void = () => undefined;
  let fail: (e: { code: number }) => void = () => undefined;
  const clearWatch = jest.fn();
  const geo: GeolocationLike = {
    watchPosition: (success, failure) => { ok = success; fail = failure; return 7; },
    clearWatch,
  };
  return {
    geo,
    clearWatch,
    position: (accuracy: number, latitude = 13.08) => ok({ coords: { latitude, longitude: 80.27, accuracy }, timestamp: 1_000 + accuracy }),
    error: (code: number) => fail({ code }),
  };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const opts = { targetAccuracyM: 30, maxWaitMs: 60 };

describe('captureBestPosition', () => {
  it('stops at the first reading that is good enough, and stops listening', async () => {
    const f = fakeGeo();
    const p = captureBestPosition(f.geo, opts);
    f.position(12);
    await expect(p).resolves.toMatchObject({ accuracy: 12, latitude: 13.08, longitude: 80.27, capturedAt: 1012 });
    expect(f.clearWatch).toHaveBeenCalledTimes(1);
    expect(f.clearWatch).toHaveBeenCalledWith(7);
  });

  it('waits past a rough first answer for the real GPS fix', async () => {
    const f = fakeGeo();
    const p = captureBestPosition(f.geo, opts);
    f.position(1500); // Wi-Fi / mast guess
    f.position(400);
    f.position(25); // GPS has locked on
    await expect(p).resolves.toMatchObject({ accuracy: 25 });
  });

  it('if nothing good arrives in time, returns the best reading it saw (the server decides)', async () => {
    const f = fakeGeo();
    const p = captureBestPosition(f.geo, opts);
    f.position(900);
    f.position(140);
    f.position(300);
    await expect(p).resolves.toMatchObject({ accuracy: 140 });
    expect(f.clearWatch).toHaveBeenCalledTimes(1);
  });

  it('permission denied fails straight away, without waiting out the clock', async () => {
    const f = fakeGeo();
    const started = Date.now();
    const p = captureBestPosition(f.geo, { targetAccuracyM: 30, maxWaitMs: 5_000 });
    f.error(1);
    await expect(p).rejects.toMatchObject({ kind: 'denied' });
    expect(Date.now() - started).toBeLessThan(500);
    expect(f.clearWatch).toHaveBeenCalledTimes(1);
  });

  it('"position unavailable" with no reading at all fails as unavailable once the time is up', async () => {
    const f = fakeGeo();
    const p = captureBestPosition(f.geo, opts);
    f.error(2);
    await expect(p).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('a browser timeout with no reading fails as timeout', async () => {
    const f = fakeGeo();
    const p = captureBestPosition(f.geo, opts);
    f.error(3);
    await expect(p).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('no news at all within the time is a timeout', async () => {
    const f = fakeGeo();
    await expect(captureBestPosition(f.geo, opts)).rejects.toMatchObject({ kind: 'timeout' });
    expect(f.clearWatch).toHaveBeenCalledTimes(1);
  });

  it('a passing hiccup does not matter if a reading follows', async () => {
    const f = fakeGeo();
    const p = captureBestPosition(f.geo, opts);
    f.error(2);
    f.position(20);
    await expect(p).resolves.toMatchObject({ accuracy: 20 });
  });

  it('a reading that arrives before the time is up beats an earlier hiccup at the deadline', async () => {
    const f = fakeGeo();
    const p = captureBestPosition(f.geo, opts);
    f.error(2);
    f.position(200);
    await expect(p).resolves.toMatchObject({ accuracy: 200 });
  });

  it('is not fooled by late callbacks after it has finished', async () => {
    const f = fakeGeo();
    const p = captureBestPosition(f.geo, opts);
    f.position(10);
    const first = await p;
    f.position(5);
    f.error(1);
    await wait(80);
    expect(first.accuracy).toBe(10);
    expect(f.clearWatch).toHaveBeenCalledTimes(1);
  });

  it('works when the browser answers before watchPosition has even returned', async () => {
    const clearWatch = jest.fn();
    const geo: GeolocationLike = {
      watchPosition: (success) => { success({ coords: { latitude: 1, longitude: 2, accuracy: 5 }, timestamp: 9 }); return 3; },
      clearWatch,
    };
    await expect(captureBestPosition(geo, opts)).resolves.toMatchObject({ accuracy: 5 });
    expect(clearWatch).toHaveBeenCalledWith(3);
  });

  it('browsers with no Geolocation API: unsupported', async () => {
    await expect(captureBestPosition(undefined, opts)).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('pages not served over HTTPS: insecure (browsers refuse location there)', async () => {
    const f = fakeGeo();
    await expect(captureBestPosition(f.geo, { ...opts, secureContext: false })).rejects.toBeInstanceOf(GeoError);
    await expect(captureBestPosition(f.geo, { ...opts, secureContext: false })).rejects.toMatchObject({ kind: 'insecure' });
  });

  it('asks the browser for a fresh, high-accuracy reading, never a cached one', async () => {
    let seen: Record<string, unknown> = {};
    const geo: GeolocationLike = { watchPosition: (_ok, _fail, o) => { seen = o as Record<string, unknown>; return 1; }, clearWatch: () => undefined };
    await captureBestPosition(geo, { targetAccuracyM: 30, maxWaitMs: 20 }).catch(() => undefined);
    expect(seen['enableHighAccuracy']).toBe(true);
    expect(seen['maximumAge']).toBe(0);
  });
});
