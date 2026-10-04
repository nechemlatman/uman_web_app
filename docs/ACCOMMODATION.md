# Accommodation bed board

Implemented on `codex/accommodation-board`, from production Web commit `e57709e`.

## Manager workflow

Availability now shows an event-scoped apartment / room / bed board. Apartment and room details embed the same board. Search covers bed code, descriptive label and assigned person; filters cover apartment and derived state. Counts and exact pricing totals describe the complete selected scope, independent of search/state filters.

New Web assignments default to both event dates; manual date inputs are hidden. Existing historical intervals remain unchanged when edited. The backend interval API and half-open semantics remain intact. Arrival dates and elapsed assignment dates do not automatically release beds on this operational board.

Non-archived beds derive inactive first, then occupied for ACTIVE/TEMPORARY, reserved for DRAFT, otherwise available. Cancelled/archived assignments do not occupy beds. Multiple live assignments remain visible, but the bed count is never duplicated. Inactive beds can retain assignments and agreed prices.

Optional physical bed codes are separate from descriptive labels. Codes are case-insensitively unique after trimming within a room for non-archived beds; existing null codes are unaffected. Restoring a bed whose code was reused requires resolving that collision.

Listed bed and agreed assignment prices are independent nullable numeric(20,4) values. The repository reads them as decimal strings; totals use scaled BigInt. Blank remains unknown rather than zero. Currency is the current event currency. Accommodation prices neither create payments nor calculate debt; Finance stays independent.

Managers can add rooms/beds, edit beds and agreements, select people manually, cancel assignments, and activate/deactivate beds. Moves cancel the original and create a replacement in one transaction, preserving person, price, notes and status with current event dates. Existing warning review and manager override remain in use. Archived-parent records remain accessible through generic CRUD rather than the live board.

Bulk creation accepts 1–100 beds, a starting code and optional common price. Multiple beds require a trailing numeric suffix of up to nine digits (A01 becomes A01, A02, ...); a single bed accepts arbitrary text. The operation is atomic, audited, authorization-checked and retry-idempotent. Duplicate codes roll back the entire batch. Unsaved bulk drafts survive board filtering.

## Database and compatibility

Migration `20261004060755_accommodation_bed_board.sql` was applied to project `rrgzalzaaprdsmwihqxa` on 2026-10-04 after disposable and browser checks passed. Its local filename matches hosted migration history. No existing business records were rewritten and no hosted test records or users were created.

The migration adds three nullable columns, a partial code index, updated existing save/read functions, and `web_create_beds` / `web_move_stay`. Legacy saves that omit new fields preserve them. CAS, audit, event authorization, same-event foreign keys and existing RLS remain enforced. The private retry table has RLS with no client grants or policies. Public mutation functions are executable only by authenticated users and authorize event membership internally.

Hosted metadata verification confirmed numeric precision/scale, nullable columns, mutation grants, private-table denial and RLS. Security advisors flag the intentional authenticated SECURITY DEFINER RPC pattern and private-table RLS without client policies; these were reviewed against the authorization tests. They also report leaked-password protection disabled, which this feature does not change. See [RPC advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [private-table advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Verification

- 43 unit tests passed.
- 109 disposable database checks passed, including all original 58 checks, exact/null prices, legacy saves, atomic batches, request retries, CAS, audit, foreign-event rejection, move rollback, price preservation, access denial and unchanged Finance.
- 20 Chromium tests passed, including 7 new accommodation tests and all 13 existing workflows (the assignment test now verifies hidden date inputs and event-date payloads).
- 1 hot-reload test passed.
- Typecheck, lint, format check and production build passed. Build emits third-party Zod annotation warnings only.
- English LTR / Hebrew RTL at widths 1440, 768 and 390 passed overflow checks. Desktop English and mobile Hebrew screenshots were visually reviewed.

Browser checks use an isolated port 5190 fixture server with fixture public configuration. They do not write hosted records. Realtime was verified with simulated server notifications; no live two-manager session was performed. The board reuses the existing full-event read contract; very large event payloads remain a scaling consideration. No public guest picker, debt, automatic assignment or intra-event turnover was introduced.

## Changed files

- Board/domain/actions: `src/domain/stay.ts`, `src/features/stay-board.tsx`, `src/features/stay-actions.tsx`, `src/features/availability.tsx`.
- Existing integration: `src/data/repository.ts`, `src/domain/catalog.ts`, `src/domain/model.ts`, `src/domain/validation.ts`, `src/features/editor.tsx`, `src/features/record-details.tsx`, `src/design-system/styles.css`, `src/i18n/messages.ts`.
- Migration: `supabase/migrations/20261004060755_accommodation_bed_board.sql`.
- Verification: `tests/stay.test.ts`, `tests/accommodation-db.mjs`, `tests/database.mjs`, `tests/e2e/stay.spec.ts`, `tests/e2e/fixture.ts`, `tests/e2e/workflows.spec.ts`, `playwright.config.ts`.
- Documentation: this file and `README.md`.
