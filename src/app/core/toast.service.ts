import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'success' | 'error'; message: string }

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  success(message: string) { this.push('success', message, 4000); }
  error(message: string) { this.push('error', message, 7000); }

  dismiss(id: number) { this.toasts.update((list) => list.filter((t) => t.id !== id)); }

  private push(kind: Toast['kind'], message: string, ms: number) {
    const id = this.nextId++;
    this.toasts.update((list) => [...list.slice(-3), { id, kind, message }]);
    setTimeout(() => this.dismiss(id), ms);
  }
}
