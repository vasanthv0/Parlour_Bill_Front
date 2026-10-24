import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface Shape { d?: string; cx?: number; cy?: number; r?: number; x?: number; y?: number; w?: number; h?: number; rx?: number }
const p = (d: string): Shape => ({ d });
const c = (cx: number, cy: number, r: number): Shape => ({ cx, cy, r });
const r = (x: number, y: number, w: number, h: number, rx = 1): Shape => ({ x, y, w, h, rx });

const ICONS: Record<string, Shape[]> = {
  plus: [p('M12 5v14M5 12h14')],
  minus: [p('M5 12h14')],
  x: [p('M18 6 6 18M6 6l12 12')],
  check: [p('M20 6 9 17l-5-5')],
  search: [c(11, 11, 7), p('m21 21-4.3-4.3')],
  'chevron-down': [p('m6 9 6 6 6-6')],
  'chevron-left': [p('m15 18-6-6 6-6')],
  'chevron-right': [p('m9 18 6-6-6-6')],
  menu: [p('M4 6h16M4 12h16M4 18h16')],
  printer: [p('M6 9V2h12v7'), p('M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'), p('M6 14h12v8H6z')],
  eye: [p('M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z'), c(12, 12, 3)],
  'eye-off': [p('M9.9 4.2A10 10 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7M6.6 6.6A13 13 0 0 0 2 12s3 7 10 7a10 10 0 0 0 5.4-1.6'), p('M2 2l20 20'), p('M9.9 9.9a3 3 0 0 0 4.2 4.2')],
  logout: [p('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'), p('m16 17 5-5-5-5'), p('M21 12H9')],
  trash: [p('M3 6h18'), p('M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'), p('M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2')],
  pencil: [p('M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z')],
  users: [p('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), c(9, 7, 4), p('M22 21v-2a4 4 0 0 0-3-3.9'), p('M16 3.1a4 4 0 0 1 0 7.8')],
  user: [p('M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'), c(12, 7, 4)],
  receipt: [p('M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z'), p('M16 8H8M16 12H8M12 16H8')],
  list: [p('M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01')],
  dashboard: [r(3, 3, 7, 9), r(14, 3, 7, 5), r(14, 12, 7, 9), r(3, 16, 7, 5)],
  scissors: [c(6, 6, 3), c(6, 18, 3), p('M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12')],
  sliders: [p('M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6')],
  key: [c(7.5, 15.5, 5.5), p('m21 2-9.6 9.6'), p('m15.5 7.5 3 3L22 7l-3-3')],
  alert: [p('M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'), p('M12 9v4M12 17h.01')],
  archive: [p('M21 8v13H3V8'), r(1, 3, 22, 5), p('M10 12h4')],
  restore: [p('M3 12a9 9 0 1 0 3-6.7L3 8'), p('M3 3v5h5')],
  ban: [c(12, 12, 10), p('m4.9 4.9 14.2 14.2')],
  'arrow-left': [p('M19 12H5'), p('m12 19-7-7 7-7')],
  package: [p('M21 8 12 3 3 8v8l9 5 9-5z'), p('m3 8 9 5 9-5'), p('M12 13v8')],
  gift: [r(3, 8, 18, 4), p('M12 8v13'), p('M19 12v9H5v-9'), p('M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5')],
  whatsapp: [p('M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z')],
  building: [r(4, 3, 16, 18, 2), p('M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01')],
  shield: [p('M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6z')],
  copy: [r(9, 9, 13, 13, 2), p('M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1')],
};

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      @for (s of shapes(); track $index) {
        @if (s.d) { <path [attr.d]="s.d" /> }
        @else if (s.r) { <circle [attr.cx]="s.cx" [attr.cy]="s.cy" [attr.r]="s.r" /> }
        @else { <rect [attr.x]="s.x" [attr.y]="s.y" [attr.width]="s.w" [attr.height]="s.h" [attr.rx]="s.rx" /> }
      }
    </svg>`,
  styles: [':host { display: inline-flex; flex: none; line-height: 0; }'],
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input(18);
  protected readonly shapes = computed(() => ICONS[this.name()] ?? []);
}
