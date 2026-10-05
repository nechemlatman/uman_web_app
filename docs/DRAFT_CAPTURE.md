# Draft-first quick capture

## Integration and deployment

Work is on `codex/draft-first-quick-capture`, based on production `c4f44a456e93189cf382c3cc0fe24d75d628eae3`. Event Setup was cherry-picked from preserved `8ddae24dda93d0a3ac6226d8f600bf182da42bcd` as `782d366`; Accommodation was not duplicated. No force-push or historical migration edits. Baseline verification passed before draft work.

Forward migration `20261004183700_draft_quick_capture.sql` was tested against the disposable database, then deployed to `rrgzalzaaprdsmwihqxa` on 2026-10-04. Its local timestamp matches hosted history. No hosted business rows were inserted, updated, deleted, or rewritten for this task. Frontend hosting was not changed.

## Capture and operational rules

| Entity                   | Minimum capture                                                                   | Operational completeness                                                             |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Person                   | One meaningful name, Hebrew name, phone, WhatsApp, email, passport name, or notes | Existing ACTIVE/INACTIVE lifecycle retained; no invented identity                    |
| Flight                   | Existing DRAFT capture with incomplete fields                                     | SCHEDULED/DELAYED/DIVERTED/LANDED require airline, number, airports, scheduled times |
| Driver                   | Name, phone, WhatsApp, license, or notes; new forms default UNAVAILABLE           | AVAILABLE/BUSY require full name                                                     |
| Vehicle                  | Name, registration, or notes; new forms default UNAVAILABLE                       | AVAILABLE/IN_USE require name and positive capacity                                  |
| Trip                     | Existing PLANNED capture with incomplete fields                                   | CONFIRMED/IN_PROGRESS/COMPLETED require route and scheduled times                    |
| Apartment                | Unnamed structural record allowed                                                 | Existing type, range, currency and monetary validation preserved                     |
| Room                     | Unnamed/unparented structural draft allowed                                       | Parent is shown as missing; same-event references remain enforced                    |
| Sleeping place           | Existing inactive draft with missing room/type allowed                            | Activation requires room/type and custom type name when applicable                   |
| Accommodation assignment | Existing DRAFT may omit person, bed and dates                                     | ACTIVE/TEMPORARY require person, bed and valid date range                            |
| Task                     | Title, description, or notes                                                      | Existing lifecycle/field validation retained                                         |
| Apartment issue          | Title, description, or notes; OPEN may omit apartment                             | Any non-OPEN state requires apartment                                                |

Centralized frontend rules separate capture identity from operational requirements. Server checks remain authoritative. No automatic lifecycle transitions are introduced. Localized display fallbacks are not persisted. People first_name retains its older non-null text contract using an empty string when absent; other newly optional names use null. Vehicle capacity has no fabricated default.

Generic lists, details, relation pickers and forms use localized safe titles. Incomplete badges identify actionable missing operational fields. The Bed Board handles unnamed apartments, rooms and beds. People search includes partial private identity/contact fields through event-authorized `web_list_people`; raw private columns are not returned by that list API. An email/passport-name fallback may be returned as its display label. Notes-only people display a localized unnamed label. Other entity search includes relevant capture text.

## Database and compatibility

The migration relaxes only eight nullable columns and the person first-name minimum; adds seven meaningful-content/operational checks; updates person validation/save/duplicate detection, driver/vehicle saves and accommodation labels; adds one bounded people search RPC. Driver creation retry comparison also checks notes and WhatsApp. Existing authorization, CAS, audit, request idempotency, same-event references, soft-delete and restore paths remain in place. Finance routines, Event Setup migration and Accommodation Bed Board migration are unchanged.

New checks use NOT VALID to preserve existing rows without scanning or rewriting them; they still enforce future inserts/updates. Older records remain readable, but a subsequent update must satisfy the applicable checks. Older clients may need display/model updates for newly nullable names/capacity and will not gain the Web capture UX automatically. Legacy RPC signatures are preserved; Flutter runtime behavior was not separately tested. The Bed Board retains public person labels, so email-only/notes-only identities use an unnamed fallback there.

Hosted verification confirmed all eight nullable columns, all seven checks, pinned empty search_path, authenticated execute and denied anonymous execute for the new RPC. Security advisors report 76 authenticated security-definer RPC notices (including this intentionally authorized RPC), three private RLS/no-policy notices, and disabled leaked-password protection. Performance advisors report four unindexed foreign keys and 51 unused indexes; no indexes or FKs were changed in this slice.

Advisory references: [definer RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [private RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [FK indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Verification

- Typecheck, lint, format check and production build passed.
- 65 unit tests passed (49 existing + 16 draft tests).
- 189 disposable database checks passed (143 existing + 46 draft checks).
- 39 Chromium checks passed (38 in the complete run plus the subsequently added partial-person realtime regression run independently).
- One hot-reload regression passed.
- English LTR and Hebrew RTL checked at 1440, 768 and 390 pixels; no horizontal overflow. Screenshots self-reviewed, including corrected unnamed apartment labels and incomplete vehicle forms.
- Existing Event Setup, Accommodation and Finance checks remain passing. Live two-manager verification was not performed; realtime tests use the browser fixture. No fake hosted test records.
- Build emits non-failing upstream Zod annotation warnings.

## Files changed for draft capture

- `src/components/draft-indicator.tsx`
- `src/components/record-value.tsx`
- `src/components/relation-picker.tsx`
- `src/data/repository.ts`
- `src/domain/catalog.ts`
- `src/domain/drafts.ts`
- `src/domain/model.ts`
- `src/domain/validation.ts`
- `src/features/editor.tsx`
- `src/features/entity.tsx`
- `src/features/operations.tsx`
- `src/features/record-details.tsx`
- `src/features/stay-board.tsx`
- `src/i18n/messages.ts`
- `tests/database.mjs`
- `tests/drafts-db.mjs`
- `tests/drafts.test.ts`
- `tests/e2e/fixture.ts`
- `tests/e2e/drafts.spec.ts` (new browser regressions)
- `docs/DRAFT_CAPTURE.md` (release notes)
