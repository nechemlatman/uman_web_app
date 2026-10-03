# UMAN Event Manager — Web

A bilingual, event-scoped management app for participants, flights, ground transport, accommodation, tasks, apartment issues and financial source records. It uses the existing Supabase backend; no demo records or browser-only operational database ship with the app.

## Run locally

Requires Node.js 22.12+ and npm. Development was verified with Node 22.16.0.

```powershell
Set-Location C:\Users\Nechem\Documents\uman_web_app
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Fill these build-time variables in .env.local, then start:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

```powershell
npm run dev
```

Open http://localhost:5173. An existing .env.local is already configured on the implementation machine; do not overwrite it. Only the publishable/anon key belongs in frontend configuration. The client rejects service-role configuration.

For temporary testing from a phone on the same trusted Wi-Fi/LAN, start the explicit LAN server:

```powershell
npm run dev:lan
```

Then open the computer's LAN IPv4 address with port 5173 from the phone, for example `http://192.168.x.x:5173`. Windows Firewall may prompt for private-network access. Do not expose the Vite development server directly to the public internet; use the HTTPS production deployment flow below for remote access.

## Stack and structure

React 19, TypeScript, Vite 7, React Router, TanStack Query, Supabase JS and Zod. Dependencies are pinned in package-lock.json.

- src/app: identity, event scope, realtime reconciliation and navigation.
- src/domain: field definitions, validation, civil-date rules and typed boundaries.
- src/data: all database queries, RPCs, safe relation lookups and pagination.
- src/features: operational workflows, details, dashboard, availability and settings.
- src/components: shared accessible UI.
- src/i18n and src/design-system: Hebrew/English, RTL/LTR, tokens and responsive styles.
- supabase/migrations: forward web migrations only.
- tests: domain/repository tests, isolated PostgreSQL checks and intercepted browser fixtures.

See [architecture and backend decisions](docs/IMPLEMENTATION.md) and [verification and release limits](docs/VERIFICATION.md).

## Existing backend

Project: rrgzalzaaprdsmwihqxa. Reuse it; do not create a disconnected backend.

Migration **20261002080634_web_operations.sql** is deployed. It adds tasks, apartment issues, immutable payments/expenses with explicit reversal, audited CAS mutations, command-center reads, assignment review, request confirmation and date-range bed availability. It does not rewrite existing people, flights, trips or accommodation data.

The migration was authored through the CLI under timestamp 20261001193648; the MCP deployment assigned 20261002080634. The local filename now matches hosted history. SQL contents were not changed after deployment.

The pre-existing hosted history includes 20260928214807_legacy_draft_forms, newer than the read-only Flutter checkout. Test copies of all 13 baseline migrations are isolated under tests/reference-migrations. Do not execute the test harness against a hosted database.

For future CLI migration work, fetch the hosted migration history before using db push; this repository initially contains only its own forward migration:

```powershell
supabase migration fetch --project-ref rrgzalzaaprdsmwihqxa
```

Authenticate the CLI through the normal operator flow. Review fetched files and a dry run before any later deployment. Never reset hosted data or repair migration history just to suppress a mismatch.

## Manager accounts

Use separately provisioned Supabase Auth accounts with an established password. Public signup and membership administration are not exposed by this app. An operator must grant each account an event_members row for the intended event, role administrator, with created_by set to the authorizing operator's Auth UUID. Creating an Auth account alone does not grant event access.

The requested extra manager account was cancelled by the user and was not created. Add it later through your established provisioning flow. Configure Auth Site URL/allowed redirect URLs for the deployed origin if using an invitation or recovery flow; password onboarding/recovery UI is not included in this release.

## Checks

```powershell
npm ci
npm audit --audit-level=high
npm run typecheck
npm run lint
npm test
npm run test:db
npx playwright install chromium firefox webkit
npm run test:e2e
npm run test:hmr
npm run format:check
npm run build
```

Browser coverage is Chromium desktop, Firefox desktop and WebKit with the iPhone 13 device profile: 20 workflows per project, 60 tests total, plus one isolated Chromium HMR regression. This is automated iPhone emulation, not physical iPhone verification. On Linux use `npx playwright install --with-deps chromium firefox webkit`.

Playwright starts a dedicated Vite server on port 5190 with fixture-only public Supabase configuration; it never reuses the normal app on port 5173 and requires no hosted credentials. HMR uses a copied app on port 5180 with separate output. Browser tests intercept Supabase HTTP/WebSocket traffic and use isolated fixtures. They do not write test people or money into the hosted project. PostgreSQL checks run inside a disposable PGlite database. Test screenshots/traces and build output are ignored by Git.

CI runs on pull-request updates and pushes to `codex/production-web`, avoiding duplicate feature-branch push runs. Quality gates and all browser/HMR gates passed for the consolidated code. See [verification evidence](docs/VERIFICATION.md) and [current PR checks](https://github.com/nechemlatman/uman_web_app/pull/2/checks). Only failed runs upload traces/screenshots, retained for seven days.

## Operational time

Inputs, timestamp displays and schedule date grouping use **Europe/Kyiv (Uman time)**; the database continues to store UTC timestamptz values. Spring DST gaps are rejected and repeated autumn hours require selecting the intended UTC occurrence. Unchanged timestamps preserve the original instant and precision. Accommodation dates remain civil dates with `[start_date, end_date)` and same-day turnover.

Flights also use the clearly labeled Uman timezone. Convert an origin-airport local time before entering it; the model does not supply airport-specific timezones and the app does not infer them. Historical records are not rewritten.

## Production build and deployment

```powershell
Set-Location C:\Users\Nechem\Documents\uman_web_app
npm ci
npm run build
npm run preview
```

Deploy the **dist** directory to static hosting. Set the two VITE\_\* variables in the hosting provider before building. These values are included in the browser bundle; they must never contain privileged credentials.

- Vercel: framework Vite, build npm run build, output dist. vercel.json includes SPA rewrites and security headers.
- Netlify / Cloudflare Pages: build npm run build, output dist. public/\_redirects and public/\_headers are copied into dist.
- Other static servers: return index.html for application routes, serve assets normally, configure equivalent security headers and HTTPS. Avoid caching index.html indefinitely.

No website was published to a hosting provider during this task. The web database migration was deployed in the earlier implementation pass; this consolidation makes no database changes. The frontend remains local, with no public deployment verified. Before broad rollout, verify the deployed origin with two separate manager accounts and the devices your team uses.

The manifest supports standalone display and includes SVG plus 192px/512px PNG icons. A 180px PNG Apple touch icon is linked in the page. Installation across browsers is not yet verified. There is no offline write queue or service worker caching authenticated records.

## Product boundaries

Master Spec 2.6 explicitly defers participant expense allocation/shares and unpaid balances under OPD-002/003. This app shows original payment/expense records, recorded conversions and event totals. It never invents debt or an unpaid alert.

Derived alerts are read-time checks with deterministic identities; manager acknowledgment/dismissal persistence and required-contact policy editing are not included. The schedule and alert summaries are bounded to 100 entries and state this limit. Full source lists paginate at 40 rows. Browser printing is labeled **Print current page** and prints the currently rendered page, not the full paginated dataset. Full manifests/exports, self-service account recovery, public signup and event membership editing remain outside this release.
