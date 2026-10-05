# Operational workspace expansion

## Baseline audit and integration

Branch `codex/operational-ui-expansion` starts exactly at production `d44742a8102c8796cfe0776bf35187b0546762e7`. Existing 39 browser checks passed before module implementation. No old feature branch was continued and no production merge was performed.

The audit inspected the baseline route tree, shared records/details/editor components, dashboard, navigation, domain catalog, existing read contracts, and browser-rendered desktop/mobile dashboard. People, Tasks and Issues had generic records views; Travel spread six entities across list tabs. Person details required scanning five separate related-record tables. Mobile inherited those tables and generic navigation. Existing paginated APIs and the command-center/Accommodation reads were sufficient, so no schema/RPC work was needed.

## Delivered screens

| Route under `/e/:eventId` | Operational behavior                                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/people`                 | Participant cards with contact links, lifecycle, actual flight/trip statuses, active/temporary stay status, unreversed payment-record counts, missing-name indicator; all/active/incomplete/no-flight/no-transport/no-active-stay filters and contact/name search |
| `/person/:id`             | Existing identity and archive/edit/history controls plus Participant 360: flight/trip context, apartment/room/bed chain, exact agreed price, payment sources, assigned tasks and notes; context-preserving assignment/payment actions                             |
| `/travel`                 | Flights and Ground transport tabs sorted by scheduled departure, direction filters, passenger counts, delay, driver/vehicle/capacity, existing server alerts; compact resource status tab and creation/passenger actions                                          |
| `/tasks`                  | Board aligned to NEW/IN_PROGRESS/WAITING/COMPLETED/CANCELLED; open/overdue/status/priority/assignee filters, priority-first ordering, deadlines and direct editor/status shortcut                                                                                 |
| `/issues`                 | OPEN/IN_PROGRESS/RESOLVED/CLOSED board; apartment context, reporter, urgency, update and resolution information; status/priority/apartment filters and safe editor shortcut                                                                                       |
| `/finance`                | Existing authoritative exact payment/expense totals, base currency, unconverted count, separate recent source lists with original currencies and reversal indicators; record/view-all actions                                                                     |
| Dashboard                 | Preserved event banner/countdown, quick actions, alerts, schedule, finance and history; added missing-name, overdue-task, urgent-issue and Bed Board availability metrics with filtered module links                                                              |

Sidebar/mobile navigation now leads to manager concepts, with Accommodation opening the existing Bed Board. Module highlighting remains active on underlying record/edit routes. Every original generic entity, editor, archive, and detail route remains accessible. Actions open the existing safe forms; status shortcuts do not perform hidden mutations.

## Read correctness and safety

- No new backend model, migration, RPC, hosted schema change, or hosted business-data mutation.
- Existing `list`, `web_list_people`, `web_ledger`, `web_command_center` and `read_accommodation` contracts supply the UI. Existing event authorization and scoped-row validation remain authoritative.
- Operational relation reads exhaust 40-row pages and deduplicate IDs. A failed/repeated/capped read renders an error, never a false empty relation or zero count. The current safety ceiling is 100 pages per entity (4,000 rows); events beyond that need a bounded server aggregate/paged operational read in a future change. Reads are refreshed through existing event realtime invalidation; they are not a transactional cross-table snapshot.
- Flight/trip assignment filters include non-cancelled/non-no-show links to non-archived, non-cancelled targets. Accommodation presence means ACTIVE or TEMPORARY, not a draft reservation. Missing-name indication is actionable presentation, not a new validity rule.
- Finance totals come directly from the existing aggregate RPC; original values remain strings. No float conversion, debt, balances, profit, allocation or automatic currency conversion is introduced. People show counts of unreversed payment sources rather than invented participant balances.
- Existing server alerts provide capacity warnings; the UI does not implement another capacity policy. The existing 100-alert server bound still applies.
- Existing CAS, audit, idempotency, draft validation, lifecycle and immutable Finance mutation code is unchanged. Role and archived-event enforcement remain on the existing server/editor paths.

## Verification and visual review

Final checks passed: typecheck, lint, format check and production build; 73 unit tests (65 existing + 8 new), 189 disposable database checks, 49 Chromium tests (39 existing + 10 new), and 1 hot-reload regression. The final complete Chromium run passed all 49 checks. Existing tests were not weakened.

New focused coverage includes complete pagination and read failures, cancelled/archived relations, missing identity and overdue semantics, source amount precision, participant filters/presets and realtime reconciliation, profile relationship context, Travel tabs, board filtering/edit links, ledger source separation, navigation and actionable empty states.

Browser screenshots cover all six new/upgraded module/profile screens in English LTR and Hebrew RTL at 1440, 768 and 390 px (36 captures). Self-review included desktop People/Issues, Hebrew profile, mobile People/Tasks/Finance, and tablet Travel. Changes from review: full-width tablet cards, explicit accessible filter names, contextual module highlighting, truthful status severity badges, and full-width finance tiles for long exact amounts. All pages are checked for horizontal overflow. Screenshots are generated as `test-results/workspace-{people,travel,tasks,issues,finance,person}-{width}-{en,he}.png` by the browser suite.

No live production or two-manager verification is claimed; browser data is isolated fixtures. No fake hosted business data was created. Build retains the existing non-failing upstream Zod annotation warnings.

## Deliberately deferred

Drag-and-drop, inline lifecycle mutation and new aggregate RPCs were unnecessary for this slice. Status changes use the complete existing editor and conflict handling. Large-event read optimization beyond the explicit safety ceiling is deferred. Mobile/tablet layouts are stacked operational cards rather than reduced desktop tables. No new financial semantics, invitations, hosting/deployment or unrelated domain work.

## Files

- `src/components/workspace.tsx`: shared headers, state boundaries, actions, metrics and cards.
- `src/data/workspace.ts`: paginated event reads and presentation classifications.
- `src/design-system/workspace.css`: token-based logical/responsive styles.
- `src/features/manager-workspace.tsx`: People, Travel, Tasks, Issues and Finance.
- `src/features/participant-profile.tsx`: participant 360 sections.
- `src/features/dashboard-readiness.tsx`: focused actionable metrics.
- `src/features/operations.tsx`: dashboard module links and readiness integration.
- `src/features/record-details.tsx`: profile integration; generic details preserved.
- `src/app/shell.tsx`: concept navigation and deep-route highlighting.
- `src/main.tsx`: lazy operational routes and stylesheet.
- `src/i18n/messages.ts`: English/Hebrew labels.
- `tests/workspace.test.ts`: focused pagination/meaning tests.
- `tests/e2e/workspace.spec.ts`: operational workflows and visual matrix.
- `tests/e2e/fixture.ts`: realistic pagination and configurable summary fixtures; existing tests unchanged.
- `docs/OPERATIONAL_WORKSPACE.md`: audit, delivery, correctness and limitations.
