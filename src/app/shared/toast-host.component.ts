import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-toast-host',
  imports: [IconComponent],
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class.error]="t.kind === 'error'">
          <span class="grow">{{ t.message }}</span>
          <button type="button" class="t-close" aria-label="Dismiss" (click)="toasts.dismiss(t.id)"><app-icon name="x" [size]="16" /></button>
        </div>
      }
    </div>`,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}
