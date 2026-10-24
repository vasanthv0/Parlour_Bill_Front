import { Component, computed, input, model } from '@angular/core';
import { FeatureDef } from '../core/models';

/**
 * The page-and-button switchboard for one parlour. Pages are sidebar items; buttons live on a page,
 * so a button is unavailable (and shown as off) whenever its page is off. Turning the page back on
 * brings the button back to whatever it was set to.
 */
@Component({
  selector: 'app-feature-toggles',
  template: `
    @for (g of groups(); track g.title) {
      <h3 class="group">{{ g.title }}</h3>
      <ul class="rows">
        @for (f of g.items; track f.key) {
          <li class="frow" [class.dim]="blocked(f)">
            <button type="button" class="switch" role="switch" [attr.aria-checked]="isOn(f)" [attr.aria-labelledby]="'ft-' + f.key"
                    [disabled]="blocked(f) || disabled()" (click)="toggle(f)"></button>
            <div class="grow">
              <div class="name" [id]="'ft-' + f.key">{{ f.label }}</div>
              <div class="muted small">{{ f.description }}</div>
              @if (blocked(f)) { <div class="note small">Unavailable while the {{ parentLabel(f) }} page is off.</div> }
            </div>
            <span class="state" [class.on]="isOn(f)">{{ isOn(f) ? 'On' : 'Off' }}</span>
          </li>
        }
      </ul>
    }`,
  styles: [`
    .group { font-size: 14px; color: var(--ink-2); margin: 18px 0 4px; &:first-child { margin-top: 0; } }
    .rows { list-style: none; margin: 0; padding: 0; }
    .frow { display: flex; align-items: flex-start; gap: 14px; padding: 12px 0; border-top: 1px solid var(--line); &:first-child { border-top: 0; } }
    .frow .switch { margin-top: 2px; }
    .frow.dim .name { color: var(--muted); }
    .name { font-weight: 600; }
    .note { color: var(--amber); margin-top: 2px; }
    .state { min-width: 28px; text-align: right; font-weight: 600; font-size: 13px; color: var(--muted); margin-top: 3px; &.on { color: var(--sage); } }
  `],
})
export class FeatureTogglesComponent {
  readonly defs = input.required<FeatureDef[]>();
  /** Two-way: key → on/off. A missing key counts as on. */
  readonly values = model.required<Record<string, boolean>>();
  readonly disabled = input(false);

  protected readonly groups = computed(() => [
    { title: 'Sidebar pages', items: this.defs().filter((d) => d.group === 'page') },
    { title: 'Buttons inside pages', items: this.defs().filter((d) => d.group === 'action') },
  ].filter((g) => g.items.length));

  private on(key: string) { return this.values()[key] !== false; }
  protected blocked(f: FeatureDef) { return !!f.requires && !this.on(f.requires); }
  protected isOn(f: FeatureDef) { return this.on(f.key) && !this.blocked(f); }
  protected parentLabel(f: FeatureDef) { return this.defs().find((d) => d.key === f.requires)?.label ?? ''; }
  protected toggle(f: FeatureDef) { this.values.update((v) => ({ ...v, [f.key]: !this.on(f.key) })); }
}
