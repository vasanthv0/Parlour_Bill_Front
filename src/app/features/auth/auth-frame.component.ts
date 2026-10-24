import { Component } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Shared two-panel layout for sign in / sign up: the brand and a sample bill on one side, the form on the other. */
@Component({
  selector: 'app-auth-frame',
  template: `
    <div class="frame">
      <section class="brand-panel" aria-hidden="true">
        <div class="brand">
          <svg width="34" height="34" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#B0245C" /><path d="M7 5h10v14l-2-1.5-1.5 1.5L12 17.5 10.5 19 9 17.5 7 19z" fill="#fff" /></svg>
          {{ appName }}
        </div>
        <p class="pitch">Bills, customers and daily takings for your parlour, in one place.</p>

        <div class="sample">
          <div class="receipt">
            <div class="receipt-title"><h2>Lake View Parlour</h2><div class="meta">Bill LV-00128</div></div>
            <ul class="receipt-lines">
              <li class="receipt-line"><span class="name">Haircut – Women</span><span class="amt">₹450</span></li>
              <li class="receipt-line"><span class="name">Classic Facial</span><span class="amt">₹900</span></li>
              <li class="receipt-line"><span class="name">Threading – Eyebrows</span><span class="amt">₹60</span></li>
            </ul>
            <div class="receipt-sums"><div class="line"><span>GST 5%</span><span>₹71</span></div></div>
            <div class="receipt-total"><span class="label">Total</span><span class="amount">₹1,481</span></div>
          </div>
        </div>
      </section>

      <section class="form-panel"><div class="form-inner"><ng-content /></div></section>
    </div>`,
  styles: [`
    .frame { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); min-height: 100dvh; }
    .brand-panel { background: var(--plum); color: var(--plum-text); padding: 40px 48px; display: flex; flex-direction: column; gap: 28px; overflow: hidden; }
    .brand { display: flex; align-items: center; gap: 10px; font-family: var(--font-display); font-weight: 700; font-size: 22px; color: #fff; }
    .pitch { font-family: var(--font-display); font-size: 30px; line-height: 1.2; font-weight: 600; color: #fff; max-width: 15em; letter-spacing: -0.015em; }
    .sample { margin: auto 0; display: flex; justify-content: center; padding: 8px 0 16px; }
    .sample .receipt { width: min(320px, 100%); transform: rotate(-2.5deg); --bg: var(--plum); color: var(--ink); }
    .form-panel { display: grid; place-items: center; padding: 32px 24px; }
    .form-inner { width: min(420px, 100%); }
    @media (max-width: 899px) {
      .frame { grid-template-columns: minmax(0, 1fr); }
      .brand-panel { padding: 20px 24px; gap: 0; .pitch, .sample { display: none; } }
    }
  `],
})
export class AuthFrameComponent {
  protected readonly appName = environment.appName;
}
