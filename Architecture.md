# Global Lab Architecture Guide

Last reviewed: **2026-11-19**

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
13. Certificate OCR runs in the browser only and never sends an image to a
    third-party or AI service. When a certificate is attached to an existing
    row, the certificate number read from the image must match the row's
    number exactly (no fuzzy digit matching); a mismatch or unreadable number
    rejects the image before upload with an explicit message. On a match,
    confident values replace the row's values in the form; in Add mode they
    fill only empty fields. Low-confidence reads are suggestions, and nothing
    is saved until the admin presses save. The extractor stays pure and
    design-independent: labels come from live column names, never from a
    certificate template.
14. Deployments apply immutable, checksummed migrations before starting a new
    application build. Concurrent migration runners are serialized, and an
    application release stops if migration history is missing or inconsistent.
15. Certificate QR repair is deterministic and verified. It uses only
    finder-pattern geometry and integer pixel math (no AI/ML, OCR or randomness),
    changes only the QR square, never overwrites the original object, stores the
    result under a new key through the revision-checked certificate transaction,
    and returns nothing unless the repaired image decodes to the expected
    verification URL. Identical input bytes must produce identical output bytes.

## Boundary Rules

| Area | Owns | Must not own |
|---|---|---|
| `app/api` | HTTP decoding, auth guard, validation, use-case call, response mapping | UI state or provider secrets in responses |
| UI components | Presentation, form state, loading/error states | SQL, secrets, provider signing or trusted validation |
| OCR modules | Browser-local text recognition and pure field extraction | Network writes, SQL or form state |
| CSV modules | Pure parsing, header mapping and preflight validation | React state or network writes |
| Certificate server module | Invariants, revision checks and transaction ownership | Browser assumptions |
| Storage/image modules | R2 protocol, file validation and bounded processing | Certificate form state |
| Certificate QR repair (`lib/qr-locate.ts`, `lib/certificate-qr-fix.ts`, `lib/admin-certificate-qr-fix.ts`) | Deterministic QR location, pixel-exact repaint, decode verification, and the server use-case that stores the result as a new image | React state, SQL outside `updateAdminCertificate`, any ML/OCR/heuristic-with-randomness step |
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

- Tracked migrations lag production: 26 live `certificates` attribute columns
  are missing from `001_schema_baseline.sql` (observed 2026-11-19). Add them as
  the next numbered migration before other schema work; see
  `docs/operational-handover.md` "Schema Drift Follow-Up".
- Record each new deployed revision in `docs/operational-handover.md`.
- Run production smoke checks after Hostinger deployment.
- Keep R2 orphan cleanup disabled until retention policy is explicit.
- Perform an isolated restore drill before any future schema/data migration.
