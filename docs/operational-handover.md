# Operational Handover

This file is the production handover checkpoint for deployment and recovery
evidence. Keep secrets, raw certificate data, backup contents and private URLs
out of Git. Record only names, owners, dates, command results and sanitized
counts.

## Current Status

As of 2026-10-03, the production URL, deployed Hostinger revision and migration
baseline have been recorded. The operator stated that no production data changes
were made after the migration/import, so the migration counts are the current
working production counts unless a later live check proves drift. Production
smoke results, restore ownership and retirement decisions still require
authorized production access or an operator-provided record.

## Required Production Checkpoint

Fill this section during each production release.

| Item | Value |
|---|---|
| Release date/time | 2026-10-02 02:03 |
| Deployment owner | Rohan Chawla |
| Deployed URL | `https://globallabtesting.in/` |
| Deployed Git revision | `9885912f` (`Add npm security audit workflow`) |
| Runtime platform/process model | Hostinger Next.js deployment; standalone server output detected; Node.js server restarted after publish |
| Node/npm versions | Node.js 22.x / npm version not shown in Hostinger log |
| Database host class/provider | Pending |
| R2 bucket/account owner | Rohan Chawla |
| Rollback owner | Pending |
| Restore owner | Pending |

Deployment metadata:

- Build ID: `01a0f92a-efb2-72db-918a-6191c3d20838`
- Source: `github.com/vineetrecovery-bit/Global_lab`, branch `main`
- Repository field in Hostinger deployment summary: `—`
- Root directory: `./`
- Framework: Next.js
- Build command: `npm run build`
- Output directory: `.next`
- Environment: variables loaded from `.env`
- Published in 1.4s; application restarted in 11.2s; deployment completed in
  1m 25s according to the Hostinger log.

## Migration Baseline

This baseline comes from `docs/migration-plan.md` and
`migrations/001_schema_baseline.sql`; it is not raw production data.

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

Current production confirmation can be limited to checking whether production
still matches the baseline counts and required constraints if drift is suspected
or before a schema/data migration. Do not paste or commit real certificate rows.

## Release Gate Results

Record exact command output summaries from the release branch.

| Gate | Result |
|---|---|
| `npm ci` | Not run by Hostinger; deployment used `npm install` and installed 370 packages with 0 reported vulnerabilities |
| `npm run lint` | Not shown in Hostinger deployment log |
| `npm test` | Not shown in Hostinger deployment log |
| `npm run schema:validate` | Not shown in Hostinger deployment log |
| `npm run schema:validate:isolated` | Not shown in Hostinger deployment log |
| `npm run build` | Passed on Hostinger with Next.js 16.3.6; production build compiled successfully in 12.6s and generated 10 static pages |
| `npm run typecheck` | Not run as a separate gate; Hostinger log says build skipped validation of types |

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

Do not delete migration, Appwrite export, backup, rollback or restore tooling
until the owner and retention window are recorded.

| Decision | Owner | Status |
|---|---|---|
| Appwrite export/rollback retention window | Pending | Pending |
| Local ignored backup retention policy | Pending | Pending |
| R2 orphan cleanup policy | Pending | Pending |
| Migration script retirement approval | Pending | Pending |
| `vercel.json` retirement or retention | Pending | Pending |

## R2 Storage

| Item | Value |
|---|---|
| Bucket | `global-lab-certificates` |
| Bucket owner | Rohan Chawla |
| Bucket access | Private |
| Retention/lifecycle policy | Manual/operator-owned unless later configured in Cloudflare |
| Orphan cleanup policy | Pending; do not delete unattached objects until retention policy is explicit |
