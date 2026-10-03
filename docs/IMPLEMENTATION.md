# Architecture and backend decisions

## Authority

Reference: C:/Users/Nechem/Documents/UMAN_MANAGMENT, read only.
Target: C:/Users/Nechem/Documents/uman_web_app.

Precedence: Master 2.6, Technical 1.2, ADR-001, current workcards and deployed contracts. Flutter UI is not reused. The old web prototype supplies the navy/gold visual direction only; its fake records and localStorage operational model are removed from the working tree. Baseline commit 4b139fc preserves it.

Hosted legacy_draft_forms is newer than the reference checkout. Its nullable event/flight/trip metadata is supported. Draft saving and operational activation have distinct validation. The current financial specification overrides older unpaid-balance wording: no participant debt is inferred.

## Boundaries

React components call the repository boundary. Event-scoped paginated reads use RLS; mutations use narrow server RPCs. New RPCs use pinned search paths, explicit administrator authorization and revoked PUBLIC/anon execute privileges. New tables grant authenticated SELECT only, with event membership RLS. No client direct DML, service-role key or public membership grant is used.

All entities validate their event scope at the client boundary. Passport details are fetched only on the person detail/editor path through read_person; relation labels use public names only. Operational query data is memory-only and discarded on identity/event changes. Supabase manages the authenticated session; localStorage otherwise contains display preferences only.

The metadata-driven field catalog covers the domain differences while keeping validation, persistence and presentation separate. Known status options and editable columns follow existing RPC allowlists. Unknown person custom_fields are preserved. Unchanged timestamps retain server precision; timestamp inputs/displays and schedule grouping use Europe/Kyiv, with UTC persistence. The centralized conversion rejects DST gaps and asks managers to select an occurrence for repeated hours; no airport timezone inference is performed. Civil accommodation dates remain dates with [start,end) semantics.

## Writes and conflicts

- New records carry a stable request UUID. Server retries return the original record only for the same creator, event and payload.
- Existing records require expected version. A stale write cannot overwrite a newer row.
- A conflict keeps the draft and offers the latest row for comparison. Accepting the new base carries forward untouched fields from the latest row while retaining the manager's edits.
- A failed creation response classified as network loss freezes submitted fields. Retrying first checks the creator-scoped request status, then safely repeats the same request if no committed result is found.
- Route changes and page close warn on unsaved input. Logout checks dirty forms before ending the session.
- Write success is shown only after the server confirms. Offline writes are disabled and never queued.
- Related assignment identities remain immutable where historical semantics require it; moving creates an explicit new record.
- Warning review never moves anyone automatically. Race-created operational conflicts remain visible through source-derived alerts.

## Realtime

Each event owns a filtered subscription for relevant source tables. Notifications debounce 250 ms and invalidate canonical queries. Reconciliation is serialized, with a rerun if another invalidation arrives during a read. Subscribe/re-subscribe, foreground, reconnect and a visible-page 20-second interval repair missed notifications and revoked access.

Token refresh does not replace the event identity or unmount an editor. A background read error retains cached context and disables writes. A successful empty membership read removes access. Subscription disposal cancels event queries and clears that event's cache.

## Financial integrity

New source amounts/rates are PostgreSQL numeric; public ledger RPC values are decimal strings. Conversion is original amount divided by original-currency units per one base-currency unit, rounded to four places. Same-currency entries use rate one. Foreign-currency entries may remain explicitly unconverted when no rate is supplied.

Finalized originals cannot be edited. A correction uses explicit audited reversal and a new source entry. Reversals retain the original values and are excluded from totals. Event base currency becomes fixed once financial entries exist. Source mutations and audit entries commit together.

## Read models

Command-center counts, totals, upcoming milestones and alerts are derived from the authorized event. Availability returns pages of actual beds, hierarchy and intersecting occupants for the requested interval. Adjacent stays do not conflict.

Implemented alert checks: overdue tasks; unresolved apartment issues; delayed/cancelled/incomplete flights; missing driver near departure; over-capacity trips; overlapping beds; missing financial rates; incomplete full-event accommodation; missing inbound/outbound transport; passport expiry risk; unavailable assigned vehicles; arrivals without timely onward transport; overlapping/nearby duplicate flight assignments; room occupancy exceeding active beds.

No alert is a source mutation. SHA-256 keys use rule, entity kind, entity UUID and stable scope; paired records are sorted. Re-evaluation does not duplicate logical alerts. Persistent acknowledgment/dismissal and automatic lifecycle transitions are not implemented. Event-required-contact policy is not guessed from missing fields.

## Development updates

Vite development singletons keep React contexts and the mount root stable when source modules are re-evaluated. An isolated copied-app regression exercises this path; no development singleton behavior is used in the production bundle. Changing source while filling a form is not a supported production workflow; use the built deployment for operational use.

## Delivery

Routes load lazily; library bundles split into React/router/query vendor, Supabase and validation. CSS uses logical properties for RTL/LTR, focus styles and responsive lists/forms. Hidden mobile navigation is removed from visual interaction and keyboard focus until opened.

Static deployment requires no paid application server. SPA rewrites and CSP are included. The server remains the existing Supabase project. No authenticated offline data cache is introduced.
