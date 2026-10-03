# Verification — 2026-10-03

## Verified automatically

- 35 Vitest domain/repository checks: scoped rows, public-key configuration, civil dates, overlap, activation rules, money strings, UTC mapping, timestamp precision, localization and RPC arguments.
- 58 disposable PostgreSQL checks: all 13 baseline migrations plus the web migration; anonymous/outsider denial; no client DML; CAS; create idempotency; immutable financial values; rate/currency checks; reversals and totals; audit atomicity on successful writes; task terminal/restored state; issue resolution/reopening; bed availability; same-day turnover; immutable assignment identity; full-event accommodation gaps; deterministic alert output; creator-scoped request confirmation.
- 13 Chromium browser tests: person creation/conflict merge, task creation, accommodation warning acknowledgment, transport assignment, exact payment entry, revoked membership, logout/session restoration, realtime invalidation and retained drafts, offline form retention, English/Hebrew at 1440/768/390 pixels, and mobile menu keyboard closure.
- One additional isolated hot-reload browser test passes with no console/page errors after an event-context source update. It runs a copied app on port 5180 and does not alter the active app.
- TypeScript, ESLint and production build pass.
- npm audit reported zero vulnerabilities for the installed lockfile.
- Production bundles are split; no chunk exceeds 500 kB.
- The build reports two harmless Rollup annotation warnings from Zod comments.

Fixtures are isolated test-only records and requests. They are never loaded by production routes or written to hosted data.

## Browser review

Inspected the real signed-in event selector and command center in the in-app Chromium browser. Verified live data, event metadata, existing audit entries and the connected realtime indicator. Restored temporary viewport overrides afterward. The live development console exposed duplicate-root/context errors during source hot updates; stable development roots/contexts were added and verified separately. Earlier console entries remain historical; they are not presented as a clean-console run. The user was actively using the real accommodation forms; no automation created a fake person, payment or assignment in that event.

Reviewed automated desktop English and mobile Hebrew full-page screenshots. The review identified a transient closed-sidebar overlay during RTL switching; the fix and keyboard regression test pass. Responsive browser checks cover tablet as well.

## Database deployment

Applied 20261002080634_web_operations via the Supabase migration tool to rrgzalzaaprdsmwihqxa. Hosted history confirms it. Existing source rows were not reset, rewritten or removed.

Supabase advisors were run after deployment:

- No missing RLS on the new tables.
- Authenticated SECURITY DEFINER RPC warnings are expected for the existing authorized-RPC architecture; each new entry point delegates to explicit event authorization with a pinned search path.
- Private passport table has RLS without a public policy intentionally: access is through its authorized read RPC.
- Leaked-password protection is disabled at the hosted Auth level. This is an existing operator setting; it was not changed. [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Four pre-existing flight_passengers foreign-key index advisories remain. No new-table foreign-key-index gaps were reported. [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- Newly created/rarely queried indexes show informational unused-index notices; none were removed.

[Security-definer advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Not verified / release boundaries

- Real simultaneous edits using two different hosted manager accounts. The user will add another manager later. Separate-manager CAS is tested in PostgreSQL, and incoming realtime refresh/draft preservation is tested in Chromium with protocol fixtures.
- Public hosting, production-origin Auth redirects, Firefox, Safari/iOS and cross-browser PWA installation.
- Every logistics mutation against live hosted data; local PostgreSQL and intercepted browser tests cover the critical paths without introducing production test records.
- Alert acknowledgment/dismissal persistence, event-required-contact policy editing and automatic lifecycle-transition alerts are outside the implemented read-time alert surface.
- Participant shares/unpaid balances remain explicitly unavailable per OPD-002/003.

This is an implemented and locally verified release candidate, not a claim that the full production rollout gate has been independently verified.

## Final operator checks

1. Deploy dist using README instructions and confirm a deep link survives reload.
2. Provision two separate Auth users and grant only their intended event memberships.
3. Edit a test record from both accounts: one update should appear live; a stale editor should retain its draft and show conflict review.
4. Disconnect/reconnect one device, confirm the status changes, and confirm pending input remains local.
5. Verify a complete test itinerary/room assignment/financial correction using your own designated test event.
6. Check mobile Safari/Chrome, invitation configuration and the intended HTTPS hosting origin before broad rollout.
