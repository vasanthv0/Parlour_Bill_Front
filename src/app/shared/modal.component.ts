import { AfterViewInit, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Native <dialog>: focus is trapped, Esc closes, and the page behind is inert.
 * Render it with @if and it opens itself. Put action buttons in an element with the `modal-foot` attribute.
 */
@Component({
  selector: 'app-modal',
  imports: [IconComponent],
  template: `
    <dialog #dlg class="modal" [class.wide]="wide()" [attr.aria-label]="title()" (close)="closed.emit()" (click)="onBackdrop($event)">
      <div class="modal-head">
        <h2>{{ title() }}</h2>
        <button type="button" class="btn btn-ghost btn-icon" aria-label="Close" (click)="close()"><app-icon name="x" /></button>
      </div>
      <div class="modal-body"><ng-content /></div>
      <div class="modal-foot"><ng-content select="[modal-foot]" /></div>
    </dialog>`,
})
export class ModalComponent implements AfterViewInit {
  readonly title = input.required<string>();
  readonly wide = input(false);
  readonly closed = output<void>();
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  ngAfterViewInit() { this.dlg().nativeElement.showModal(); }
  close() { this.dlg().nativeElement.close(); }
  protected onBackdrop(e: MouseEvent) { if (e.target === this.dlg().nativeElement) this.close(); }
}
