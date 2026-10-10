# Global Lab Architecture Guide

Last reviewed: **2026-10-03**

This is the durable engineering contract for Global Lab. Keep it short and
current. Operational deployment evidence lives in
[`docs/operational-handover.md`](docs/operational-handover.md).

## System Shape

Global Lab is a single Next.js App Router application.

- `app/` owns pages and HTTP route handlers.
- `components/` owns browser UI and local interaction state.
- `lib/` contains browser API clients plus server-side auth, MySQL and R2
  integrations.
- `migrations/` contains tracked schema baselines and future ordered migrations.
- `tests/` contains synthetic regression tests.
- `scripts/` contains live maintenance helpers only. Appwrite and one-off
  migration generation/upload tooling was retired after migration completion.

Current request flow:

```text
Public UI -> certificate API -> MySQL -> R2 original delivery
Admin UI  -> protected admin API -> MySQL / R2
```

## Invariants

Every change must preserve or move the code toward these rules:

1. Admin operations are authorized on the server. UI visibility is never
   authorization.
2. Mutations have explicit server validation. Database columns are not public
   API contracts.
3. Public certificate responses use an allowlist.
4. File selection/preview never overwrites an attached original.
5. Upload keys are unique and immutable per upload.
6. Certificate and thumbnail writes use one acquired connection and transaction.
7. Uploaded files are bounded and verified by content.
8. Retryable mutations define conflict and idempotency behavior before retries.
9. UI distinguishes missing, unauthorized, invalid, conflict and transient
   failure states. Raw SQL/provider errors never reach the browser.
10. File cache identity follows content identity.
11. Schema changes are ordered migrations tested on an isolated database.
12. Secrets, hashes, private records and file contents never enter source
    control, logs, fixtures or documentation.
13. Deployments apply immutable, checksummed migrations before starting a new
    application build. Concurrent migration runners are serialized, and an
    application release stops if migration history is missing or inconsistent.

## Boundary Rules

| Area | Owns | Must not own |
|---|---|---|
| `app/api` | HTTP decoding, auth guard, validation, use-case call, response mapping | UI state or provider secrets in responses |
| UI components | Presentation, form state, loading/error states | SQL, secrets, provider signing or trusted validation |
| CSV modules | Pure parsing, header mapping and preflight validation | React state or network writes |
| Certificate server module | Invariants, revision checks and transaction ownership | Browser assumptions |
| Storage/image modules | R2 protocol, file validation and bounded processing | Certificate form state |
| Auth/config | Session policy and validated configuration | Client-bundled secrets |
| Migrations | Explicit schema evolution and recovery procedure | Runtime browser imports |

Avoid generic CRUD abstractions that do not enforce a real invariant. Extract one
tested responsibility at a time.

## Required Checks

Before pushing application changes:

```bash
npm run verify:local
```

This runs lint, tests, schema validation, build and typecheck. Also run focused
tests for the changed behavior when useful. Do not weaken type/lint/build gates
or add broad ignores to make a check pass.

## Production Baseline

- Production URL: `https://globallabtesting.in/`
- Runtime host: Hostinger Next.js deployment.
- Database: Hostinger MySQL.
- Original files: private Cloudflare R2 bucket `global-lab-certificates`.
- Migration baseline: 212 `certificates` rows, 212 `certificate_thumbnails`
  rows and 0 duplicate certificate numbers under review.
- Appwrite migration/export tooling is retired from this repo. Ignored local
  backups remain outside Git for now.

## Known Operational Follow-Ups

- Record each new deployed revision in `docs/operational-handover.md`.
- Run production smoke checks after Hostinger deployment.
- Keep R2 orphan cleanup disabled until retention policy is explicit.
- Perform an isolated restore drill before any future schema/data migration.
