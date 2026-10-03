# Global Lab architecture guide

Last reviewed: **2026-10-02**

This is the durable engineering contract for Global Lab. Read it before changing
application code. Keep it short and current. Detailed evidence, unresolved
findings, task dependencies, and verification history live in
[`docs/ARCHITECTURE_AUDIT.md`](docs/ARCHITECTURE_AUDIT.md).

## System shape

Global Lab is a single Next.js App Router application. It should be improved
incrementally; do not split it into services or introduce a broad framework
without a measured need.

- `app/` owns pages and HTTP route handlers.
- `components/` owns browser UI and local interaction state.
- `lib/` contains browser API clients and server-side auth, database, and R2
  integrations. Server-only modules must never enter browser bundles.
- MySQL stores certificate records and thumbnails.
- Private Cloudflare R2 stores original certificate files. Originals become
  publicly retrievable only through the application image route.
- `scripts/` contains one-off backup and migration tooling; it is not runtime
  application code.

Current request flow:

```text
Public UI -> certificate API -> MySQL -> R2 original delivery
Admin UI  -> protected admin API -> MySQL / R2
```

## Non-negotiable invariants

Every change must preserve or move the code toward these rules:

1. Every admin operation is authorized on the server. UI visibility is never
   treated as authorization.
2. Every mutation has an explicit, typed server boundary. Database columns and
   schema introspection are not API contracts.
3. Public certificate responses use an allowlist. A newly added database column
   is private by default.
4. Merely selecting or previewing a file must never overwrite an attached
   original. Upload keys are unique and immutable per upload.
5. Save, Cancel, replacement, and cleanup have explicit attachment semantics.
   Cleanup must never delete an object still referenced by a certificate.
6. Certificate and thumbnail database changes use one acquired connection and
   one transaction. A failure cannot leave a partial SQL save.
7. Uploaded files are bounded and verified by content, not trusted by filename
   or browser-provided MIME type alone.
8. Retryable mutations define conflict and idempotency behavior before retries
   are enabled.
9. Public and admin UI distinguish missing, unauthorized, invalid, conflict,
   and temporarily unavailable states. Raw SQL/provider errors never reach the
   browser.
10. File cache identity follows content identity. Replacements and deletions
    must not silently serve stale content under an unchanged cacheable URL.
11. Schema changes are ordered migrations tested on an isolated database.
    Existing public certificate links and retained originals remain compatible
    unless an explicit product decision changes that requirement.
12. Secrets, cookies, hashes, private records, and file contents never enter
    source control, logs, fixtures, screenshots, or architecture documents.

## Boundary rules

| Area | Owns | Must not own |
|---|---|---|
| `app/api` | HTTP decoding, authentication guard, validation, use-case call, response mapping | Image processing, UI logic, or multi-step business workflows |
| UI components | Presentation, form state, loading/error states | SQL, secrets, provider signing, or trusted validation |
| Shared contracts | Intentional public/admin request and response shapes | Node-only database or provider imports |
| CSV module | Pure parsing, header mapping, and preflight validation | React state or network writes |
| Certificate server module | Invariants, revision checks, transaction ownership | HTTP/cookie details or browser assumptions |
| SQL modules | Parameterized queries and explicit projections | Presentation or provider protocols |
| Storage/image modules | R2 protocol, file validation, bounded processing | Certificate form state |
| Auth/config | Session policy and immutable validated configuration | Client-bundled secrets |
| Migrations/scripts | Explicit one-off operations and recovery procedures | Imports into browser or route runtime code |

Avoid generic CRUD layers and wrappers that do not enforce a real invariant.
Extract one tested responsibility at a time rather than performing a mass folder
move.

## Required change workflow

Before implementation:

1. Read the relevant task and finding in
   [`docs/ARCHITECTURE_AUDIT.md`](docs/ARCHITECTURE_AUDIT.md).
2. Identify the invariant, compatibility requirement, and acceptance check that
   the change affects.
3. Preserve unrelated working-tree changes and never use `.env` values in test
   fixtures.

Before declaring a change complete:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Also run any narrower focused tests for the changed behavior. Tests must use
synthetic data and mocked provider boundaries unless an isolated database is
explicitly part of the test. Do not restore
`ignoreBuildErrors`, add blanket lint exclusions, or weaken a gate merely to
make a check pass. Do not introduce new lint warnings.

Record the task status, date, commit (when available), environment, and exact
verification in the audit. A code change is not “Resolved” until the applicable
acceptance checks are recorded. Local verification is not production
verification.

## Current baseline and known exceptions

- T01 is implemented and locally verified in the current working tree; commit
  is pending.
- Node.js 24 and npm 11 are the documented runtime/tooling baseline. `.nvmrc`
  and the package engine constraints keep local and CI environments aligned.
- Builds enforce TypeScript. `npm run typecheck`, `npm run lint`, `npm test`,
  and `npm run build` are the baseline commands.
- Lint currently reports 27 pre-existing warnings and zero errors. These remain
  visible; new warnings are not acceptable. Existing warnings should be removed
  in focused changes rather than hidden with file-level exclusions.
- T02's minimum regression harness is implemented locally with synthetic tests
  for upload keys, CSV, public mapping, auth/route validation, and save failures.
  Known defects are explicit expected failures that must become ordinary passing
  tests with their corresponding fixes.
- T22a is implemented locally: GitHub Actions runs locked installation,
  typecheck, lint, focused tests, and build without application secrets. The
  lint command permits only the recorded 27-warning baseline, so new warnings
  fail the gate.
- T04 is implemented locally: uploaded originals keep a readable certificate
  prefix but use a per-upload UUID-backed object key, preventing same-number and
  sanitization-collision overwrites while preserving read compatibility for
  stored keys.
- T05 is implemented locally: new admin uploads are validated as raster images
  before storage, and public original delivery uses deliberate content headers.
  New PDF uploads are blocked until a product PDF policy is agreed.
- T03 is implemented locally: CSV parsing handles quoted commas, escaped quotes,
  multiline fields, BOM and CRLF, and malformed row widths block import before
  create requests begin.
- T09 is implemented locally: admin certificate mutations validate explicit
  payload contracts, reject system-field writes and map invalid/missing rows to
  bounded HTTP statuses.
- T06 is implemented locally: certificate and thumbnail create/update writes use
  one acquired MySQL connection and one transaction.
- T10 is implemented locally with a conservative public allowlist:
  `CERTIFICATE_NO`, generated `Certificate_photograph`, `PRODUCT_NAME`, and
  `CATEGORY`. Additions require an explicit public-field decision.
- T11 is implemented locally: admin password hashes must use
  `scrypt:<salt>:<hex>`, login has a bounded in-memory throttle, and
  `npm run auth:hash` generates replacement hashes without committing secrets.
- T12 is implemented locally: sessions bind to the configured admin email and
  password-hash version, and logout revokes the current token nonce in-process
  until expiry. Multi-worker durable revocation remains a deployment decision.
- T18a is implemented locally: `migrations/001_schema_baseline.sql` is the
  tracked sanitized schema baseline, `.env.example` documents required variable
  names, and `npm run schema:validate` checks migration ordering/content.
- T07 is implemented locally: admin uploaded originals are attached through a
  signed object-key token, so clients cannot attach arbitrary R2 keys. Orphan
  cleanup remains deferred until retention policy is explicit.
- T08 is implemented locally at the application layer: create/update and public
  reads report duplicate certificate numbers as conflicts. The production
  unique-index migration still requires duplicate/backup rollout evidence.
- T13 is implemented locally for public verification/image routes: errors carry
  request IDs, upstream image failures are distinguishable from missing images,
  and R2 calls have a bounded timeout.
- T14 is implemented locally: original and thumbnail URLs include an
  `updated_at`-derived version when available; unversioned file reads use
  conservative cache headers.
- T15 is implemented locally: CSV imports have a 500-row client bound,
  row-specific failure messages, and Stop-after-current-request behavior.
- T17 is implemented locally: admin edit saves carry an expected `updated_at`
  revision and stale revisions return conflicts instead of overwriting.
- T19 is implemented locally: contact now uses an honest direct email action
  instead of showing a fake sent state.
- T16 is implemented locally: admin certificate list/search is server-side with
  pagination, totals, deterministic ordering, and bounded page size.
- T20 has an initial extraction slice locally: CSV import mapping lives in a
  pure helper module, while the panel keeps UI state.
- T21 is implemented locally: confirmed dead admin wrappers, the unused button
  module and obsolete Hero comments were removed, and admin image preview object
  URLs are revoked on replace/remove/unmount.
- The local/CI slice of T22b is implemented: `npm run verify:local` runs the
  repeatable lint/test/schema/build/typecheck gate, and CI now adds an isolated
  MySQL migration smoke check.
- T18b has a tracked handover template in `docs/operational-handover.md`, but
  production deployment revision, smoke results, restore owner and retirement
  decisions are still evidence-pending.
- The immediate implementation queue is production handover evidence collection:
  `V01 -> V02 -> V05 -> V08`.
- Production topology, schema, cache behavior, and backup/restore evidence are
  still unresolved. Do not represent local or mocked checks as production
  evidence and do not perform production mutations without explicit authority.

## Maintaining this guide

Update this file in the same change whenever module ownership, a system
boundary, an invariant, a required verification command, or a deliberate
compatibility policy changes. Put investigation detail and task history in the
audit rather than allowing this guide to become a second backlog.
