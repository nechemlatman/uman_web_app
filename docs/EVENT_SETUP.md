# Create Event and Initial Setup

Implemented on `codex/accommodation-board`, continuing from `5868bb456e38e77ffe83beb154c2bd6ac8baa46c`.

## Behavior

`/events` exposes Create event only after `web_can_create_event` confirms that the signed-in user has an existing administrator membership. This preserves the deployed provisioning model: a user with no membership cannot bootstrap themselves into management. Eligible managers with an empty visible event list receive creation guidance; unprovisioned users receive access guidance.

`/events/new` provides one focused bilingual form. Event name is required; Hebrew name, year, dates, description and manager notes remain optional. Currency defaults to USD and can be cleared while planning, consistent with the existing nullable contract. Currency choices mirror the existing database allowlist and a unit test checks that mapping. No calendar dates or year are inferred.

Native date inputs are grouped together. Both dates, when present, must form a strictly positive interval. The form explains their operational/accommodation scope. Names, metadata lengths, calendar dates and years are validated without silently changing input meaning. New events use the existing PLANNING default.

Creation uses one authenticated RPC that atomically inserts the event, creator's administrator membership, existing trigger-based audit entries and a private retry record. Authorization comes from server identity, not browser-supplied creator IDs. A stable UUID and saved original payload make retry safe even after later event edits. Changed payloads under the same UUID fail. During network uncertainty, submitted fields are frozen and the manager must retry the same request to confirm the result. Leaving unsaved/uncertain work prompts a warning; retry identity is retained while this form remains open, not persisted across browser restarts.

Only a confirmed server response triggers event-query invalidation and navigation to the new event dashboard. The new event then appears in the event selector.

Settings shares the same fields and validation, preserves CAS/compare behavior and allows optional values to be cleared. A date-change warning explains that existing assignments and other records are not rewritten. Existing financial currency protection remains in force. Legacy equal-date records are preserved in storage, but the new Web creation/edit rules require an end date after the start date when both are set.

## Deployment

Migration `20261004114023_web_event_setup.sql` was deployed on 2026-10-04 to project `rrgzalzaaprdsmwihqxa`, after the full local gates passed. The local filename matches hosted migration history. Deployment is necessary because the Web form depends on the new atomic metadata-aware operation.

Changes: private `web_private.event_creation_requests` table and two FK indexes; private shared validation helper; public `web_can_create_event` and `web_create_event`; bounded replacement of `edit_event_details` validation. No existing event/membership rows were modified, no tables were reset, and legacy `create_event` and lifecycle RPCs remain intact. No hosted test events or accounts were created.

Read-only hosted checks confirmed authenticated-only creation grants, anonymous denial, private-table SELECT/INSERT denial, retry-table RLS, pinned empty search paths, and false eligibility for a missing identity.

Security advisor changes were the expected two authenticated SECURITY DEFINER endpoints and one private RLS table without policies. The endpoints authorize membership internally; the table deliberately denies all client access. See [function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [private-table advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). The existing [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) finding remains unchanged.

## Verification

- Typecheck, lint (no findings), format check and production build passed.
- 49 unit tests passed (6 new event tests).
- 143 disposable DB checks passed (34 new checks), including atomic administrator membership, injected membership failure rollback, audit, anonymous/unprovisioned denial, cross-creator retry denial, same-request retry after editing, changed-payload rejection, date/currency validation, nullable fields, CAS and unchanged accommodation rows after event-date editing.
- 29 Chromium tests passed (9 new event workflows), including direct dashboard navigation, selector visibility, uncertain-response retry without duplicates, access/empty-state behavior and Settings conflict handling.
- 1 hot-reload regression passed.
- Screenshots visually inspected at desktop 1440px and mobile 390px in both English LTR and Hebrew RTL. All four flows passed horizontal-overflow checks.

All mutation testing used disposable DB/browser fixtures. Hosted verification was metadata-only; a live two-manager session was not performed. The production build retains existing third-party Zod annotation warnings. No public signup, invitations, membership administration, event cloning or automatic lifecycle transitions were added.

## File inventory

- `src/components/event-fields.tsx`
- `src/domain/event-setup.ts`
- `src/features/create-event.tsx`
- `src/features/auth.tsx`
- `src/features/settings.tsx`
- `src/data/repository.ts`
- `src/i18n/messages.ts`
- `src/main.tsx`
- `supabase/migrations/20261004114023_web_event_setup.sql`
- `tests/event-setup.test.ts`
- `tests/event-setup-db.mjs`
- `tests/database.mjs`
- `tests/e2e/event-setup.spec.ts`
- `tests/e2e/fixture.ts`
- `docs/EVENT_SETUP.md`
