# Verification — 2026-10-03

## Consolidated release candidate

Branch: `chatgpt/product-polish-01`. Review: [PR #2](https://github.com/nechemlatman/uman_web_app/pull/2), targeting `codex/production-web`.

The final trees of PR #1 (`840a0c1`) and PR #2 (`b9815be`) were compared. PR #2 remains the base, retaining its search, navigation, record alerts, no-op save protection, date validation and truthful print labels. Single-event automatic entry, iPhone WebKit coverage and a corrected system-font stack were integrated selectively from PR #1. PR #1 is superseded; the branches must not be merged independently.

## Completed verification

The consolidated code at `8affe2b7c2173c21562af803eec26c5b0f42fa43` passed [GitHub Actions run 37151174584](https://github.com/nechemlatman/uman_web_app/actions/runs/37151174584). Both quality and browser jobs completed successfully, including HMR. [Current HEAD checks](https://github.com/nechemlatman/uman_web_app/pull/2/checks) remain the source of truth after documentation-only updates.

The following commands also completed locally on Windows with Node 22.16.0:

| Gate                           | Result                                                   |
| ------------------------------ | -------------------------------------------------------- |
| `npm ci`                       | Pass                                                     |
| `npm audit --audit-level=high` | Pass; zero vulnerabilities                               |
| `npm run typecheck`            | Pass                                                     |
| `npm run lint`                 | Pass                                                     |
| `npm test`                     | 41 passed                                                |
| `npm run test:db`              | 58 passed                                                |
| `npm run format:check`         | Pass                                                     |
| `npm run build`                | Pass; largest chunk about 359 kB                         |
| `npm run test:e2e`             | 60 passed: 20 workflows × 3 projects                     |
| `npm run test:hmr`             | 1 passed; no page/console errors after source hot reload |

The production build still emits two non-fatal Rollup annotation warnings in dependency Zod comments. No application build errors occurred. LF checkout attributes keep formatting consistent between Windows and Linux.

## Browser coverage and isolation

- Chromium: Desktop Chrome profile.
- Firefox: Desktop Firefox profile.
- WebKit: iPhone 13 profile, with touch/mobile/device-scale emulation. This is **not a physical iPhone test**.
- English LTR and Hebrew RTL dashboard checks at 1440, 768 and 390 pixels; desktop English and iPhone-profile Hebrew screenshots were visually reviewed.
- Login; automatic entry with one event; event chooser with zero/two events; connected realtime status; incoming refresh with retained drafts; offline input retention; logout and unsaved-draft protection.
- Person create/edit and stale-version conflict review; task creation; accommodation warning acknowledgment; transport assignments; immutable exact-decimal payment entry; membership revocation.
- Mobile navigation and Escape closure; keyboard search; expanded transport/issue search; record-level alerts; WhatsApp/email links; current-page printing labels.
- Kyiv datetime input, DST gap rejection, explicit autumn-hour selection, UTC payloads, local display and unchanged-time edit preservation.

Playwright supplies fixture-only public configuration to its own strict-port Vite server on 5190. It never reuses the real app on 5173 or needs hosted credentials. HTTP and realtime traffic are intercepted; test records are not written to Supabase. HMR uses a copied app on port 5180 and a separate artifact directory. Only failed CI runs upload explicitly scoped screenshots/traces.

Earlier implementation review inspected a real signed-in event and its realtime indicator. This consolidation pass used isolated fixtures and left the user's active form alone; it does not claim fresh live-data mutation verification.

## Timezone and PWA status

Operational timestamps are entered, displayed and grouped by **Europe/Kyiv** while remaining UTC in storage. Unit coverage includes summer/winter offsets, midnight date rollover, spring gaps, repeated autumn hours and original timestamp precision. Accommodation civil-date and half-open interval behavior is unchanged and covered by the database checks.

Flights use the explicitly labeled Uman timezone too. Airport-local input/automatic airport timezone mapping needs a separate data-model decision. No historical timestamps were rewritten.

The existing SVG artwork now also supplies 192px/512px PNG manifest icons and a 180px Apple touch icon, verified in the build output. No authenticated service-worker caching or offline write queue was added. Physical installation and standalone behavior on an actual iPhone remain unverified.

## Database and deployment

**No database changes in this consolidation.** No migrations were created, rewritten or deployed, and no hosted rows or migration history were touched. Previously deployed `20261002080634_web_operations` remains unchanged in `rrgzalzaaprdsmwihqxa`.

The 58 disposable PGlite checks cover all 13 reference migrations plus the existing web migration: RLS/outsider denial, authorized RPCs, CAS, idempotency, immutable finance, reversal totals, audit, lifecycle transitions, availability and same-day turnover. They do not run against hosted data.

Historical post-deployment advisors from October 2 reported intentional authorized SECURITY DEFINER/private-table policy patterns, disabled leaked-password protection, four pre-existing flight-passenger FK index advisories and informational unused-index notices. These were not changed or re-audited in this pass.

**No public frontend deployment was performed or verified.** Static hosting configuration and build output are prepared; production-origin redirects and live hosting behavior still require verification.

## Remaining release boundaries

- Two distinct real manager accounts editing simultaneously: deferred by the user. CAS and realtime draft retention are automated with isolated database/browser fixtures.
- Physical iPhone/Safari, PWA installation, deployed HTTPS origin and complete live logistics/financial journeys.
- Flight-specific airport timezone semantics; managers must currently convert airport-local times to the labeled Uman timezone.
- Printing covers only the currently rendered page. Full manifests/exports are not implemented.
- Persistent alert acknowledgment/dismissal, required-contact policy editing and automatic lifecycle-transition alerts remain outside the implemented alert surface.
- Participant allocation/unpaid balances remain deferred by OPD-002/003. Self-service onboarding/recovery and membership editing are not exposed.

This is a consolidated release candidate for review, not a claim of public deployment or completed live rollout verification.
