# Operational Handover

This file is the production handover checkpoint for deployment and recovery
evidence. Keep secrets, raw certificate data, backup contents and private URLs
out of Git. Record only names, owners, dates, command results and sanitized
counts.

## Current Status

As of 2026-10-10, Phase 1 of the migration-runner rollout is deployed. The
runner is present but was not invoked by that release, so it made no database
changes. The original migration counts remain historical evidence only; live row
counts are expected to change during normal use. Production smoke results,
restore ownership and retirement decisions still require authorized production
access or an operator-provided record.

## Required Production Checkpoint

Fill this section during each production release.

| Item | Value |
|---|---|
| Release date/time | 2026-10-10 (exact time not provided) |
| Deployment owner | Rohan Chawla |
| Deployed URL | `https://globallabtesting.in/` |
| Deployed Git revision | `fd78dea` (`Add deployment database migration runner`) |
| Runtime platform/process model | Hostinger Next.js deployment; standalone server output detected; Node.js server restarted after publish |
| Node/npm versions | Node.js 22.18.0 / npm 10.9.3 |
| Database host class/provider | Pending |
| R2 bucket/account owner | Rohan Chawla |
| Rollback owner | Pending |
| Restore owner | Pending |

Deployment metadata:

- Build ID: `01a1241d-7795-73d1-9f4e-eedf6c9478aa`
- Source: `github.com/vineetrecovery-bit/Global_lab`, branch `main`
- Repository field in Hostinger deployment summary: `—`
- Root directory: `./`
- Framework: Next.js
- Phase 1 build command: `npm run build` (application-only at revision `fd78dea`)
- Phase 2 build behavior: the same command applies migrations, then runs `build:app`
- Output directory: `.next`
- Environment: variables loaded from `.env`
- Published in 1.3s; application restarted in 1.8s; deployment completed in
  1m 38s according to the Hostinger log.

## Migration Baseline

Future deployments run `npm run db:migrate` before the application build through
the standard `build` script. The runner serializes concurrent deployments with a
MySQL advisory lock and records immutable migration filenames and checksums in
`schema_migrations`. Hostinger can keep its default `npm run build` command; a
failed or inconsistent migration must fail the release before the new application
build is published. Local verification, CI and Vercel use the database-free
`npm run build:app` command.

The first run safely adopts the existing baseline: `001_schema_baseline.sql`
uses `CREATE TABLE IF NOT EXISTS`, then its checksum is recorded. Before that
first production run, confirm that the live schema still matches the baseline
and that a restorable database backup exists. This setup does not authorize
destructive migrations or automatic R2 changes.

This baseline comes from the completed migration record and
`migrations/001_schema_baseline.sql`; it is not raw production data. The bulky
historical migration plan was removed after successful migration.

| Item | Baseline |
|---|---|
| Production MySQL database | `u641918041_global_lab` |
| Clean Appwrite backup rows | 212 |
| Imported `certificates` rows | 212 |
| Imported `certificate_thumbnails` rows | 212 |
| Duplicate certificate numbers under review | 0 |
| R2 bucket | `global-lab-certificates` |
| R2 original upload result | 212/212 uploaded to private R2 |
| R2 missing image items | 0 |
| Thumbnail items | 212 |
| Current production data changes after migration | None reported by operator on 2026-10-03 |

Expected schema shape:

- `certificates` has an auto-increment `id`, required `appwrite_document_id`,
  required `CERTIFICATE_NO`, optional `Certificate_photograph`, `PRODUCT_NAME`,
  `CATEGORY`, `r2_object_key`, Appwrite provenance timestamps and local
  `created_at`/`updated_at`.
- `certificates` has `uniq_appwrite_document_id`, `idx_certificate_no`,
  `idx_category` and `idx_product_name`.
- `certificate_thumbnails` has `certificate_id` as primary key, thumbnail blob
  metadata and `idx_thumbnail_sha256`.
- `certificate_thumbnails.certificate_id` references `certificates.id` with
  `ON DELETE CASCADE`.

Current production confirmation should verify required schema constraints and
record live row counts only as an observational before/after snapshot. It must
not require the historical count of 212. Do not paste or commit real certificate
rows.

## Release Gate Results

Record exact command output summaries from the release branch.

| Gate | Result |
|---|---|
| `npm ci` | Not run by Hostinger; Phase 1 used `npm install`, installed 627 packages and reported 13 audit findings (1 moderate, 11 high, 1 critical) |
| `npm run lint` | Not shown in Hostinger deployment log |
| `npm test` | Not shown in Hostinger deployment log |
| `npm run schema:validate` | Not shown in Hostinger deployment log |
| `npm run schema:validate:isolated` | Not shown in Hostinger deployment log |
| `npm run build` | Phase 1 passed on Hostinger with Next.js 16.3.6; compilation completed in 13.6s and generated 10 static pages |
| `npm run typecheck` | Not run separately; the Next.js build completed its TypeScript stage in 7.8s |

## Runtime Logs

The application writes one-line JSON events to the Node.js process streams so
Hostinger can show them under the application's **Runtime Logs** view after the
revision is deployed. A deployment made before Hostinger enabled runtime logs
may need to be redeployed once before this view starts collecting output.

| Event | Outcomes and statistics | Deliberately excluded |
|---|---|---|
| `certificate.verify` | `verified`, `not_found`, `invalid_request`, `duplicate`, or `service_error`; request ID, certificate number when supplied, duration, verified public-field count/names, and image presence | Certificate field values, image/storage keys, file contents, IP address |
| `auth.login` | `success`, `rejected`, `throttled`, or `service_error`; request ID and duration | Email, password, session token, IP address |

Admin certificate listing, creation, editing, deletion, CSV import and upload
actions do not emit activity logs. Existing provider-error messages in those
routes remain error diagnostics rather than admin audit events.

To verify a deployment, open **Websites → Dashboard** for the domain, select
**Runtime Logs**, trigger one synthetic certificate verification and one login,
then filter/search for `certificate.verify` and `auth.login`. Informational
events are written to stdout; warnings and errors are written to stderr. Use
the event `outcome` values for counts and `durationMs` for latency summaries.

## Smoke Checks

Run with synthetic records only unless a production owner explicitly approves a
read-only real-record check.

| Check | Expected result | Result |
|---|---|---|
| Homepage loads over HTTPS | 200, valid TLS, no mixed-content errors | Pending |
| Public verify: known synthetic certificate | 200 with approved public fields only | Pending |
| Public verify: missing certificate | Safe not-found response with request ID | Pending |
| Public image: synthetic certificate image | Correct content type, cache policy and bytes | Pending |
| Admin login/logout | Login succeeds with current credential; logout invalidates session | Pending |
| Admin create/edit/delete synthetic row | Row changes persist; stale edit conflict is visible | Pending |
| Admin upload/save/cancel synthetic attachment | Valid upload saves; canceled upload does not alter previous record | Pending |
| CSV import synthetic sample | Bounded import, row-level failures visible, no duplicate successes | Pending |

## Backup And Restore

| Item | Value |
|---|---|
| Database backup owner | Hostinger account owner / Rohan Chawla |
| Database backup location/class | Hostinger automated website backups; daily automated backups enabled |
| R2 backup/retention owner | Rohan Chawla |
| Restore runbook location | Hostinger hPanel backup page; tabs shown: Manage backups, Restore and download, Restore history |
| Last isolated restore drill date | Pending |
| Restore drill result | Pending; backup availability is confirmed, but no isolated restore drill has been recorded |

Hostinger backup evidence recorded on 2026-10-03:

- Backup page states some files are excluded: backup plugin archives, cache and
  database export files.
- Exclusion policy shown as starting from 2026-06-25.
- Latest backup: 2026-10-02 16:49.
- Manual backups can be created once every 24 hours.
- Automated backups: Daily.
- Next backup: 2026-10-03.

Minimum restore drill evidence:

1. Restore the latest approved database backup into an isolated database.
2. Compare sanitized table counts and required indexes against the release
   branch expectations.
3. Restore or verify access to the matching R2 object backup/snapshot.
4. Run public verify/image smoke against synthetic restored records.
5. Record discrepancies and owner sign-off here.

## Retention And Retirement Decisions

Migration/Appwrite export tooling has been retired after successful migration.
The ignored local backup folder is intentionally retained for now and must not
be committed.

| Decision | Owner | Status |
|---|---|---|
| Appwrite export/rollback retention window | Rohan Chawla | Keep ignored local backup for now; no new Appwrite export tooling retained in repo |
| Local ignored backup retention policy | Rohan Chawla | Retained locally; do not delete or commit |
| R2 orphan cleanup policy | Pending | Pending |
| Migration script retirement approval | Rohan Chawla | Approved 2026-10-03; one-off Appwrite/MySQL/R2 migration scripts removed |
| `vercel.json` retirement or retention | Pending | Pending |

## R2 Storage

| Item | Value |
|---|---|
| Bucket | `global-lab-certificates` |
| Bucket owner | Rohan Chawla |
| Bucket access | Private |
| Retention/lifecycle policy | Manual/operator-owned unless later configured in Cloudflare |
| Orphan cleanup policy | Pending; do not delete unattached objects until retention policy is explicit |
