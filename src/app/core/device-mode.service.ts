import { Injectable, signal } from '@angular/core';
import { DeviceType } from './models';

const KEY = 'parlourbill.deviceType';

/**
 * Is this browser someone's own phone, or the shared salon tablet? Remembered on the device (not the account),
 * so the tablet stays "shared" for everyone who signs in on it. It is only a label plus a prompt for the
 * password: the server decides what a shared device must prove.
 */
@Injectable({ providedIn: 'root' })
export class DeviceModeService {
  readonly mode = signal<DeviceType>(this.read());

  set(mode: DeviceType): void {
    this.mode.set(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* private browsing: the choice just lasts until the page closes */ }
  }

  private read(): DeviceType {
    try { return localStorage.getItem(KEY) === 'shared' ? 'shared' : 'personal'; } catch { return 'personal'; }
  }
}
