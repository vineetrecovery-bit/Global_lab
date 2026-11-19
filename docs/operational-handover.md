# Operational Handover

This file is the production handover checkpoint for deployment and recovery
evidence. Keep secrets, raw certificate data, backup contents and private URLs
out of Git. Record only names, owners, dates, command results and sanitized
counts.

## Current Status

As of 2026-11-19, the Fix QR and certificate OCR release (`d2aaa17`, docs
follow-up `e045ddb`) is deployed; see "2026-11-19 Release" below. It made no
schema or data changes. The 2026-10-10 Phase 1 migration-runner rollout remains
the last release that touched migration tooling. The original migration counts
remain historical evidence only; live row counts change during normal use.
Restore ownership and retirement decisions still require authorized production
access or an operator-provided record.

## Required Production Checkpoint

Fill this section during each production release.

| Item | Value |
|---|---|
| Release date/time | 2026-11-19, new build observed live at 23:12 local time (previous: 2026-10-10) |
| Deployment owner | Rohan Chawla |
| Deployed URL | `https://globallabtesting.in/` |
| Deployed Git revision | `3c2497f` (bulk row actions); previous `e045ddb` (code at `d2aaa17`: Fix QR + certificate OCR) |
| Runtime platform/process model | Hostinger Next.js deployment; standalone server output detected; Node.js server restarted after publish |
| Node/npm versions | Node.js 22.18.0 / npm 10.9.3 as of 2026-10-10; not re-checked for the 2026-11-19 release |
| Database host class/provider | Pending |
| R2 bucket/account owner | Rohan Chawla |
| Rollback owner | Pending |
| Restore owner | Pending |

Deployment metadata (recorded for the 2026-10-10 release; Hostinger build log
for 2026-11-19 not yet inspected):

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

Admin certificate listing, creation, editing, deletion, CSV import, Export All,
upload, Fix QR and bulk (Bulk Fix QR, Download Certificates) actions do not emit
activity logs. Bulk actions add no server route: selecting rows with the
per-row checkboxes swaps the toolbar for **Bulk Fix QR** (one
`POST /api/admin/certificates/[id]/fix-qr` apply call per selected row) and
**Download Certificates (zip)** (one `GET /api/certificates/[no]/image` per
selected row, zipped in the browser). Export All runs in the browser:
it pages through the admin list API and builds the zip (CSV plus one QR PNG per
certificate number) client-side, so no new server route or response-size limit
is involved. Fix QR runs server-side (`POST /api/admin/certificates/[id]/fix-qr`)
and logs only an error name and request ID on unexpected failures. Existing provider-error messages in those
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
| Homepage loads over HTTPS | 200, valid TLS, no mixed-content errors | 200 on 2026-11-19 at `d2aaa17`; only console error is the pre-existing `/_vercel/insights/script.js` 404 |
| Public verify: known synthetic certificate | 200 with approved public fields only | Pending |
| Public verify: missing certificate | Safe not-found response with request ID | 404 with `certificate: null` and request ID on 2026-11-19 |
| Public image: synthetic certificate image | Correct content type, cache policy and bytes | Pending |
| Admin login/logout | Login succeeds with current credential; logout invalidates session | Pending |
| Admin create/edit/delete synthetic row | Row changes persist; stale edit conflict is visible | Pending |
| Admin upload/save/cancel synthetic attachment | Valid upload saves; canceled upload does not alter previous record | Pending |
| CSV import synthetic sample | Bounded import, row-level failures visible, no duplicate successes | Pending |
| Admin Fix QR (synthetic row whose image has a wrong QR) | Preview shows current vs fixed QR; Apply attaches a new image under a new R2 key, the old object remains in R2, thumbnail refreshes, and the new QR scans to `https://globallabtesting.in/?batch=<number>` | Preview passed 2026-11-19 at `d2aaa17` on a real row (read-only; confirms `sharp` loads on Hostinger). Apply not yet exercised |
| Admin edit: attach the row's own certificate | Number verified; confident values replace form values with "replaced" notes; nothing saved until Save | Passed 2026-11-19 at `d2aaa17` (read-only real row; upload stubbed, not saved) |
| Admin edit: attach a different row's certificate | "Certificate number mismatch" alert; form and image unchanged; no upload request | Passed 2026-11-19 at `d2aaa17` (no requests sent) |
| Admin row selection (synthetic rows) | Row checkboxes and header select-all/indeterminate work; selecting any row replaces the toolbar with Bulk Fix QR and Download Certificates; clearing selection or changing page/search restores the usual buttons | Pending |
| Admin Bulk Fix QR (synthetic rows: one wrong QR, one correct, one without image) | Summary shows 1 fixed, 1 already correct, 1 skipped; only the wrong row gets a new R2 key; table refreshes | Pending |
| Admin Download Certificates (synthetic rows with and without image) | Zip contains one original image per selected row that has an image; rows without an image are ignored; selecting only rows without images shows "No photo selected" and downloads nothing | Pending |
| Admin Export All | Zip contains every row in `certificates.csv` and a scannable QR per certificate number; no images or thumbnails | Pending |

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

## Fix QR Deployment Notes

- Adds the exact-pinned runtime dependencies `sharp` (native image binaries) and
  `jsqr`. Confirm `npm ci` on Hostinger installs the platform `sharp` binary and
  that the first Fix QR preview succeeds after deploy; if it fails with a
  module-load error, the host lacks the binary and the feature (not the rest of
  the app) is unavailable.
- No schema change and no migration. Fixed images use new object keys; the
  superseded original stays in R2 (R2 orphan cleanup remains disabled), so a
  rollback is re-attaching the previous `r2_object_key`.
- JPEG certificates are re-encoded once (quality 98, 4:4:4); PNG and WebP are
  written losslessly. GIF/animated images are rejected.

## 2026-11-19 Release: Fix QR + Certificate OCR

- Pushed `d2aaa17` to `main` (merge of `feat/fix-certificate-qr` and
  `feat/certificate-ocr`); new build observed live at 23:12 local time via the
  new `known-values` route changing from 405 to 401.
- Pre-push: `npm run verify:local` passed (lint 0 errors, 124/124 tests,
  schema validation, build, typecheck) and both features were exercised in
  Chrome against a local database with all writes blocked.
- Production: Fix QR preview succeeds (confirms `sharp` loads on Hostinger);
  Fix QR Apply was not exercised. Hostinger build/runtime logs were not
  inspected from this session.

## Bulk Row Actions Deployment Notes

- Branch `feat/bulk-row-selection`. Browser-only change (`components/admin-panel.tsx`,
  `lib/admin-bulk.ts`); no new dependency (`fflate` already ships for Export All),
  no new server route, no schema change and no migration.
- Bulk Fix QR inherits the Fix QR rollback: superseded originals stay in R2, so a
  bad repair is undone by re-attaching the previous `r2_object_key`.
- Download Certificates holds the selected originals in browser memory while
  zipping; selection is limited to one page (25 rows).
- 2026-11-20: rebased on `main` (already current), `npm run verify:local` passed
  (lint 0 errors, 133/133 tests, schema validation, build, typecheck), merged as
  `3c2497f` and pushed. Hostinger rebuilt from `main`; the live homepage bundle
  contains the new bulk toolbar and the homepage returns 200. Admin bulk smoke
  checks were not run from this session; Hostinger build/runtime logs were not
  inspected.

## Certificate OCR Deployment Notes

- Adds `tesseract.js` (browser-only). OCR runs in the admin's browser; on first
  use the browser downloads the OCR worker, WASM core and English language data
  from the jsDelivr CDN, so admins need outbound access to `cdn.jsdelivr.net`.
  Certificate images are never sent to a third party.
- Adds the admin-only `GET /api/admin/certificates/known-values` endpoint
  (existing values per editable column, capped at 5,000 rows). No schema change
  and no migration.
- Editing a row: the certificate number read from the attached image must
  match the row exactly, otherwise the image is rejected before upload. Offline
  evaluation on 240 production certificate images (Node.js, same extractor):
  240/240 wrong-row certificates rejected; 213/240 correct certificates
  accepted on the first OCR pass, and a 2x re-read recovered 14 of the other
  27 (about 227/240, 95%). The remaining ~5% print the number beside a photo
  or in small type and need a clearer image. The browser re-read uses canvas
  scaling, so its recovery rate may differ slightly. See `Architecture.md`
  invariant 13.
- Field-fill accuracy varies by field: certificate number, colour,
  transparency, lustre, origin and type are 95-100% precise when auto-filled.
  Product name, weight, construction and botanical name often differ from
  stored values because existing records use different wording than the
  printed certificate. Certificate date is not printed on current certificates.
- Rollback: revert the OCR commit; no data or storage cleanup is required.

## Certificate Date Auto-Fill Deployment Notes

- New rows (admin Add form and CSV import, both via `POST
  /api/admin/certificates`) with an empty `CERTIFICATE_DATE` get today's
  Asia/Kolkata date, formatted like the latest 50 stored dates. A supplied date
  is kept. No schema change, no migration and no change to existing rows.
- Smoke check: add a synthetic row without a date, confirm the date shows
  today in the stored style, then delete the row.
- Rollback: revert the commit; rows already created keep their stored date.

## Schema Drift Follow-Up

Observed 2026-11-19: production `certificates` has 30 editable columns (for
example `TYPE`, `WEIGHT`, `MUKHI`, `GEM_VARIETY`, `HARDNESS`, `BATCH_NO`),
while `migrations/001_schema_baseline.sql` defines only `CERTIFICATE_NO`,
`Certificate_photograph`, `PRODUCT_NAME` and `CATEGORY` besides internal
columns. A database built only from tracked migrations would lack the columns
used by the public allowlist and the OCR extractor. Capture the live columns
in the next numbered migration (retry-safe `ADD COLUMN IF NOT EXISTS`-style
DDL, reviewed against production and tested on an isolated database) before any
other schema work. Not started; requires explicit approval.
