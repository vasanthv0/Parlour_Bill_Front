# Parlour billing web app

Angular 19, standalone components and signals. No UI framework: the design system is in `src/styles/`.

```bash
npm install
npm start        # http://localhost:4200 (uses environment.development.ts)
npm run build    # production bundle in dist/parlourbill/browser
```

## Configure

- `src/environments/environment.development.ts`: API URL for local work (default `http://localhost:3000/api/v1`).
- `src/environments/environment.ts`: **set `apiUrl` to your deployed API** before a production build. `appName` is the product name shown in the UI, so change it in both files to rename it.

## Structure

```
src/styles/           tokens (colours, type, radii), base, components, print
src/app/core/         auth service, interceptor, guards, nav definitions, API clients, models
src/app/shared/       icon, modal, toast, money pipe
src/app/features/
  auth/               sign in (there is no sign-up)
  shell/              sidebar layout; navigation differs by role and by the parlour's switches
  superadmin/         parlour list, create parlour, per-parlour management and switchboard
  admin/              dashboard, services, combos, referrals (list, form, detail), team, settings
  shared/             new bill (services, combos, referral), bills (with Made by filter for admins), bill view/print/WhatsApp, customers, account
```

## How sign-in works

The access token lives in memory only. On page load the app silently calls `/auth/refresh` (the browser sends the `httpOnly` cookie) to restore the session. If a request returns "token expired", the interceptor refreshes once, even when several requests fail together, and replays them. If refreshing fails, the person is sent to sign in and returned to where they were.

Route guards send each role to its own area: the platform admin to `/superadmin/*`, parlour admins to `/admin/*`, staff to `/staff/*`. Opening another role's URL redirects you home. The API enforces the same rules independently.

## Page and button switches

The sign-in response carries what the parlour is allowed to use. `core/nav.ts` lists the sidebar items and which switch each needs; the shell filters it, `featureGuard` blocks the address, and buttons check `auth.hasFeature('action.team.add')`. If the platform admin switches something off while a page is open, the API refuses with `FEATURE_DISABLED` and the interceptor reloads the profile so the sidebar and buttons update. The list of switches itself lives on the API (`features.js`) and the superadmin screen reads it from there.

## Tests

```bash
npm test
```

Runs in a simulated browser (Jest with jsdom), so it needs no Chrome. `src/app/render.spec.ts` signs in as each kind of user with realistic API responses, opens **every page** (with data, and empty), clicks through the add forms, runs the billing maths (the ₹892.50 example), the WhatsApp button, the Made-by filter, and checks that each switch shows or hides the right button. It exists because some mistakes (for example calling `inject()` from a template) compile fine and only fail when a page renders. The Angular Jest builder is still marked experimental by Angular.

When you add a page, add it to the `PAGES` list in that file; sample API responses live in `src/app/testing/harness.ts`.

## Billing screen notes

The cart holds two kinds of line, keyed `s:<serviceId>` and `c:<comboId>`. Totals are worked out in whole paise in the same order as the API (subtotal, referral discount, extra discount, GST), so the total on screen is the total that is saved. The WhatsApp button opens a blank window inside the click (so pop-up blockers allow it) and points it at the link the API returns.

## Design notes

- Colours and type are CSS variables in `src/styles/_tokens.scss`. Change `--lacquer` to re-colour every action and accent.
- Fonts (Bricolage Grotesque, Figtree) load from Google Fonts in `index.html`. Self-host them if you need to work offline. Production builds inline the font CSS at build time, so they need internet access.
- The bill on the counter screen and the printable invoice share one receipt style (`.receipt`). Print styles are in `_print.scss` (80 mm receipt width).

## Deploying

`netlify.toml` is included (build command, publish folder, single-page-app redirect). On any host, serve `dist/parlourbill/browser` and send unknown paths to `index.html`. Read the cookie note in the API README before choosing domains.
