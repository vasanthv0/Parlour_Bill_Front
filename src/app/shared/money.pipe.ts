import { Pipe, PipeTransform } from '@angular/core';

const whole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const exact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,250 for whole amounts, ₹1,250.50 when there are paise. Pass `fixed` to always show 2 decimals. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, fixed = false): string {
    const n = Number(value ?? 0);
    return fixed || !Number.isInteger(n) ? exact.format(n) : whole.format(n);
  }
}
