# Appwrite to MySQL and Cloudflare R2 Migration Plan

## Goal

Move Global Lab off Appwrite for runtime certificate data and file storage.

Final production architecture:

```text
Browser/frontend
  -> Next.js app on Hostinger
      -> MySQL for certificate/admin data
      -> private Cloudflare R2 for certificate images and PDFs
```

The frontend must not call R2 directly and must not receive permanent R2 public URLs. Certificate images/PDFs are served through backend routes in the Next.js app. The app validates the request, looks up the R2 object key in MySQL, fetches the private object from R2 using server-side credentials, and streams the file back to the browser.

Appwrite is used only as the source system during migration and backup. Runtime Appwrite dependencies should be removed after the migration is complete.

## Branch and Merge Rules

- Work happens on the custom branch, currently `damadji`.
- Do not merge anything into `main` until local testing is complete.
- Push the branch only after backup, import, runtime migration, and local end-to-end testing are done.

## Phase 1: Backup Appwrite to Local

This is the most important step. Do not start destructive migration work before this backup is complete and verified.

Backup and migration-prep output:

```text
backups/appwrite/{timestamp}/
  schema.json
  certificates.json
  certificates.csv
  manifest.json
  thumbnail-manifest.json
  images/
    {CERTIFICATE_NO}.jpg
  thumbnails/
    {CERTIFICATE_NO}-{APPWRITE_DOCUMENT_ID}.jpg
```

Run command:

```bash
npm run backup:appwrite
```

The backup script must:

- Fetch all certificate documents from Appwrite.
- Fetch collection schema/attribute metadata.
- Download all certificate images from Appwrite Storage.
- Save data as JSON and CSV.
- Save images locally using certificate-number-based names where possible.
- Generate `manifest.json` with:
  - exported timestamp
  - document count
  - image count
  - missing image list
  - failed image download list
  - Appwrite project/database/collection/bucket IDs, without secrets

Required Appwrite environment variables:

```env
NEXT_PUBLIC_APPWRITE_ENDPOINT=
NEXT_PUBLIC_APPWRITE_PROJECT_ID=
NEXT_PUBLIC_APPWRITE_DATABASE_ID=
NEXT_PUBLIC_APPWRITE_CERTIFICATES_COLLECTION=
NEXT_PUBLIC_APPWRITE_BUCKET_ID=
APPWRITE_API_KEY=
```

Checkpoint:

- Document count looks correct.
- Image count looks correct.
- Missing/failed images are reviewed.
- Random sample certificates and images are manually checked.

The backup command must exit non-zero if documents/files are missing or image downloads fail. A non-zero exit still leaves the partial backup and `manifest.json` for inspection.

## Phase 2: Prepare Cloudflare R2

Create an R2 bucket, for example:

```text
global-lab-certificates
```

The R2 bucket should stay private for production:

- Do not enable public `r2.dev` access for production.
- Do not expose public R2 object URLs to the frontend.
- Use R2 only through server-side credentials from the Next.js backend and migration scripts.

Required R2 environment variables for the current upload script:

```env
CLOUDFLARE_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=global-lab-certificates
```

The real upload command also requires this explicit safety flag:

```env
R2_UPLOAD_CONFIRM=upload
```

Preferred object key format:

```text
certificates/{CERTIFICATE_NO}.jpg
certificates/{CERTIFICATE_NO}.pdf
```

These are private object keys, not public URLs. MySQL should store the object key only.

Generate and validate the upload manifest first:

```bash
npm run migration:r2-manifest
npm run migration:validate
```

Dry-run the upload command before using credentials:

```bash
R2_DRY_RUN=1 npm run migration:r2-upload
```

For future reruns, upload local backup images to R2 only after the dry run passes and Cloudflare credentials are available.

Checkpoint:

- Local image count equals uploaded R2 object count.
- Random sample objects can be fetched from R2 using server-side credentials.
- Missing image list is zero or explicitly accepted.

Current status:

- R2 bucket `global-lab-certificates` has been created.
- R2 credentials are stored in local ignored `.env`.
- Dry-run passed with 212 upload items.
- Real upload completed successfully with 212/212 original certificate images uploaded to private R2.

## Phase 3: Prepare MySQL Schema

Use the Appwrite `schema.json` backup to build the MySQL schema. Do not guess the final table blindly.

Current commands:

```bash
npm run migration:thumbnails
npm run migration:mysql
```

Likely main table:

```text
certificates
  id
  CERTIFICATE_NO
  Certificate_photograph
  r2_object_key
  all existing Appwrite fields
  created_at
  updated_at
```

Separate thumbnail table:

```text
certificate_thumbnails
  certificate_id
  thumbnail_blob
  thumbnail_mime
  thumbnail_width
  thumbnail_height
  thumbnail_size_bytes
  thumbnail_sha256
  created_at
  updated_at
```

`certificate_thumbnails.certificate_id` should be a foreign key to `certificates.id` with `ON DELETE CASCADE`.

`Certificate_photograph` keeps the original Appwrite image/file value for traceability. `r2_object_key` should store the private R2 object key, not a full URL:

```text
certificates/GL-001.jpg
```

The app should not build or return a public R2 URL. It should use this key inside backend image/PDF routes to fetch from private R2 and stream the file to the browser.

Admin table thumbnails should be stored directly in MySQL as small binary thumbnails in the separate `certificate_thumbnails` table:

```text
thumbnail_blob        MEDIUMBLOB
thumbnail_mime        image/jpeg
thumbnail_width       <= 120
thumbnail_height      <= 120
thumbnail_size_bytes  <= 25000
thumbnail_sha256      SHA-256 of thumbnail bytes
```

Only thumbnails go into MySQL. Full/original certificate images remain in private R2.

Keep thumbnail blobs out of the main `certificates` table so public verification queries and ordinary admin metadata queries stay light. Admin list/table queries can join `certificate_thumbnails` only when table previews are needed.

Checkpoint:

- MySQL table exists locally.
- `certificate_thumbnails` table exists with a foreign key to `certificates.id`.
- Certificate number column is indexed.
- All required Appwrite columns are represented.
- Schema handles empty/null fields from Appwrite.
- Thumbnail table rows exist for all clean certificate rows.

## Phase 4: Import Data Into MySQL

Use the local Appwrite backup as the source.

For each certificate:

- Normalize and validate certificate number.
- Map old Appwrite image/file ID to the new R2 object key.
- Insert the certificate row into MySQL.
- Insert the small admin-table thumbnail into `certificate_thumbnails` using the inserted certificate row id.

Checkpoint:

- Appwrite document count equals MySQL row count.
- `certificate_thumbnails` row count equals MySQL certificate row count.
- Duplicate certificate numbers are checked.
- Random sample rows match source data.
- Random sample image keys exist in R2.

## Phase 5: Update Runtime App

Final runtime target:

- Public verification reads from MySQL.
- Public verification returns certificate data and app-owned image/PDF route URLs only.
- Frontend image tags use Next.js backend routes, for example `/api/certificates/{certificateNo}/image`.
- Backend image/PDF routes validate the request, read the R2 object key from MySQL, fetch the private R2 object, and stream it back.
- Keep a small server-side recent-verification cache for the last 10 verified certificate numbers. Cache only non-secret certificate metadata and private R2 object keys, never R2 credentials or public/signed URLs.
- Admin table previews join `certificate_thumbnails` so paginated admin lists do not call R2 for each preview image.
- Admin edit/detail screens load the actual full certificate image through the backend private-R2 image route, not from the MySQL thumbnail.
- Admin CRUD reads/writes MySQL.
- Admin image upload uploads to private R2 from the backend.
- Admin stores R2 object key in MySQL.
- R2 credentials remain server-side only.
- Runtime Appwrite Auth, Database, and Storage are removed.

Admin auth must be replaced with a non-Appwrite option.

Simple first version:

```env
ADMIN_EMAIL=
ADMIN_PASSWORD_HASH=
SESSION_SECRET=
```

Longer-term option:

```text
Auth.js credentials provider
```

Checkpoint:

- App does not require Appwrite env vars at runtime.
- Verification works with MySQL.
- Images render through the app image route, with no public R2 URL in the frontend.
- Repeated verification of one of the last 10 certificate numbers can use the server-side cache instead of a fresh MySQL lookup.
- Admin login works without Appwrite.
- Admin add/edit/delete works.
- Admin upload writes to R2 and stores the object key in MySQL.
- Browser never receives R2 credentials or permanent R2 object URLs.
- Admin table pagination renders thumbnails from MySQL, with zero R2 reads for table previews.
- Admin edit/detail image preview renders the full original image through the backend R2 route.

## Phase 6: Local End-to-End Testing

Run:

```bash
npm run build
npm run dev
```

Test locally:

- Verify an existing certificate.
- Confirm certificate image renders through the backend image route.
- Admin login.
- Add a certificate with image upload.
- Edit a certificate.
- Delete or disable a certificate, depending on final product decision.
- CSV import if it remains part of admin workflow.

Checkpoint:

- Build passes.
- Manual verification flow passes.
- Admin workflow passes.
- Private R2 image route works locally with server-side R2 credentials.
- No runtime Appwrite calls remain.

## Phase 7: Deploy Later

Only after local testing passes:

- Push the custom branch.
- Add MySQL, R2, and admin auth env vars to Hostinger.
- Deploy branch/environment.
- Test deployed domain.
- After deployed backend R2 access is verified, restrict the production R2 token client IP filter to the Hostinger server IP `147.93.109.213`, or the confirmed Hostinger outbound IP if testing shows a different outbound address.
- Merge later through the agreed branch process.

## Current Session Handoff

This section is the source of truth for the next session.

### Completed Locally

- Appwrite backup was exported and cleaned.
- Clean backup contains 212 certificate rows.
- Exact duplicate rows were removed deterministically.
- Local backup images are present for all 212 current clean rows.
- The `AR-DVP-0013-089` conflict was resolved by deleting Record A from the clean backup and keeping Record B.
- MySQL import SQL has been generated from the clean backup.
- Cloudflare R2 upload manifest has been generated from the clean backup.
- Admin-table thumbnails have been generated from the clean backup.
- R2 upload runner has been added and dry-run checked through the S3-compatible R2 API.
- Cloudflare R2 bucket `global-lab-certificates` has been created.
- Real R2 upload completed successfully: 212/212 original certificate images uploaded to the private bucket.
- Server-side private R2 sample verification passed for 5 manifest objects, including the shared-image sample `AR-SLW-0013-009`; all returned HTTP 200 with matching byte counts and SHA-256 hashes.
- Hostinger MySQL database `u641918041_global_lab` has been created and both generated SQL files were imported through phpMyAdmin.
- Hostinger MySQL import verification passed: `certificates` has 212 rows and `certificate_thumbnails` has 212 rows.
- Migration validation passes.
- Architecture decision updated: admin-table thumbnails should live in a separate `certificate_thumbnails` table with a foreign key to `certificates.id`, not as blob columns on the main `certificates` table.
- Runtime migration continued:
  - public certificate verification now calls `/api/certificates/verify`
  - `/api/certificates/verify` reads certificate rows from MySQL server-side
  - verified certificate image URLs now point to `/api/certificates/{certificateNo}/image`
  - `/api/certificates/{certificateNo}/image` looks up the private R2 object key in MySQL and streams the object from private R2 server-side
  - admin auth now uses app-owned cookie sessions with `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and `SESSION_SECRET`
  - admin list/read/create/update/delete now uses MySQL through server routes
  - admin table previews now use `certificate_thumbnails` through authenticated thumbnail routes
  - admin uploads now write original images to private R2 from the backend and store the private object key in MySQL
  - browser runtime Appwrite helpers and the old Appwrite image proxy route were removed
  - `mysql2` has been added as a runtime dependency for server-side MySQL access

### Runtime Migration Files Changed

Public verification and image streaming changes made so far:

```text
lib/certificates.ts
  Browser helper now calls /api/certificates/verify instead of Appwrite directly.

lib/mysql.ts
  New server-only MySQL pool helper using:
  MYSQL_HOST
  MYSQL_PORT
  MYSQL_USER
  MYSQL_PASSWORD
  MYSQL_DATABASE
  MYSQL_CONNECTION_LIMIT optional

app/api/certificates/verify/route.ts
  New server route.
  Looks up certificates by CERTIFICATE_NO in MySQL.
  Hides internal columns such as id, appwrite_document_id, r2_object_key, timestamps.
  Returns Certificate_photograph as /api/certificates/{certificateNo}/image when an R2 key exists.

lib/r2.ts
  New server-only private R2 fetch helper.
  Uses AWS Signature V4 against the Cloudflare R2 S3-compatible endpoint.
  Avoids exposing R2 object URLs, credentials, or signed URLs to the browser.

app/api/certificates/[certificateNo]/image/route.ts
  New server route.
  Looks up r2_object_key in MySQL by CERTIFICATE_NO.
  Fetches the private R2 object server-side and streams it to the browser.

lib/admin-auth.ts
  New server-only admin session helper.
  Verifies ADMIN_EMAIL and ADMIN_PASSWORD_HASH, signs HttpOnly admin session cookies with SESSION_SECRET.

lib/admin-certificates.ts
  New server-only admin certificate data helper.
  Lists MySQL rows, joins certificate_thumbnails for preview availability, and handles admin create/update/delete.

app/api/admin/*
  New authenticated admin routes for login/logout/me, certificate CRUD, schema attributes, thumbnail streaming, and R2 uploads.

components/admin-panel.tsx
lib/admin.ts
  Admin UI now calls app-owned API routes instead of Appwrite.
  Table previews use MySQL thumbnails; edit/detail previews use backend image routes.

package.json
package-lock.json
  mysql2 dependency added.
  appwrite moved to devDependencies for local backup scripts only.
```

### Runtime Verification Status

- `npm run build` passes after allowing network access for Next.js Google Font fetches.
- Initial sandboxed `npm run build` failed only because Google Fonts could not be fetched without network access.
- `npm run lint` does not currently run because `eslint` is not installed in the project.
- `npx tsc --noEmit` currently reports pre-existing TypeScript errors in `components/sample-reports.tsx`; these were not introduced by the MySQL/R2/admin runtime work.
- Local MySQL is installed through Homebrew, running locally, and loaded with the generated import SQL.
- Local `.env` points the app at local MySQL with a passworded local app user.
- Local route smoke testing passed:
  - public certificate verification returns a MySQL row
  - verified certificate image renders through `/api/certificates/{certificateNo}/image`
  - backend image streaming from private R2 returns `image/jpeg`
  - admin login works with local test credentials
  - admin list returns 212 MySQL rows
  - admin thumbnails stream from `/api/admin/certificates/{id}/thumbnail`
  - admin create/update/delete passed with a temporary row and the database returned to 212 rows
  - home page returns HTTP 200 from the local dev server

### Current Generated Artifacts

```text
backups/appwrite/2026-09-19T21-08-58-219Z/certificates.json
backups/appwrite/2026-09-19T21-08-58-219Z/certificates.csv
backups/appwrite/2026-09-19T21-08-58-219Z/mysql/001_create_certificates.sql
backups/appwrite/2026-09-19T21-08-58-219Z/mysql/002_insert_certificates.sql
backups/appwrite/2026-09-19T21-08-58-219Z/r2-upload-manifest.json
backups/appwrite/2026-09-19T21-08-58-219Z/thumbnail-manifest.json
```

### Validation Command

```bash
npm run migration:validate
```

### Latest Validation Result

```text
Clean backup rows: 212
MySQL certificate insert rows: 212
MySQL thumbnail insert rows: 212
R2 upload items: 212
R2 missing image items: 0
Thumbnail items: 212
Duplicate certificate numbers still under review: 0
R2 _needs-review upload items: 0
```

### Pending Before Final Production Import/Runtime Switch

- Shared-image item for `AR-SLW-0013-009` and `AR-SLW-0013-010` is accepted for migration. The two certificates should remain as separate MySQL `certificates` rows with different primary keys, even if they temporarily point to the same image/object key. The certification team can correct the image after migration through the admin/runtime workflow.
- Runtime/backend R2 credentials still need to be added to Hostinger environment variables before deployment. The R2 runtime path is S3-compatible API access from the server, not public bucket access, Workers, or manual dashboard upload.
- Runtime app migration is code-complete for public verification, certificate image rendering, admin CRUD, admin uploads, admin auth, and runtime Appwrite removal.
- One intentional production/admin upload test is still pending because local smoke testing skipped writing a throwaway upload object to the private R2 bucket.
- Hostinger production environment variables still need to be configured before deployment.


### Scripts Added

```text
scripts/export-appwrite-backup.mjs
scripts/generate-mysql-import.mjs
scripts/generate-mysql-thumbnails.mjs
scripts/generate-r2-upload-manifest.mjs
scripts/upload-r2-from-manifest.mjs
scripts/validate-migration-artifacts.mjs
```

Package scripts currently added:

```bash
npm run backup:appwrite
npm run migration:mysql
npm run migration:r2-manifest
npm run migration:thumbnails
npm run migration:r2-upload
npm run migration:validate
```

### Backup Cleanup Already Done

- Original Appwrite export had 298 rows.
- Deterministic duplicate cleanup removed 85 exact duplicate rows.
- Manual removal of bad duplicate Record A for `AR-DVP-0013-089` removed 1 more row.
- Clean local backup now has 212 rows.
- Duplicate cleanup compared all non-Appwrite-system fields after trimming strings.
- Ignored only Appwrite metadata fields: `$id`, `$collectionId`, `$databaseId`, `$createdAt`, `$updatedAt`, `$permissions`, `$sequence`.
- Deterministic winner rule: earliest `$createdAt`, then lowest `$id`.
- User asked to keep only the clean backup locally. Raw 298-row local data should not be reintroduced unless explicitly needed from Appwrite again.

### Important Data Notes

- The backup folder is intentionally ignored by git through `.gitignore`. Do not push certificate data or images to GitHub.
- `certificates.json` and `certificates.csv` inside the backup folder are the cleaned dataset.
- Certification-team-facing data issues are in `docs/appwrite-backup-audit.md`. Keep that file actionable and avoid internal/debug details there.
- The `AR-DVP-0013-089` certificate number conflict was resolved by deleting Record A (`6a731ed200398c074679`, file `6a731e41000b5fde5105`) from the clean backup and keeping Record B (`6a8c0bfd5001fbd28676`, file `6a76c18d001022b0c431`).
- `AR-SLW-0013-009` and `AR-SLW-0013-010` intentionally remain separate records for migration even though they currently share image/file `6a761dbf00024e3205e4`; this is not a blocker because MySQL will assign different primary keys and the image can be corrected later.

### Current Git/Working Tree Notes

Expected changed/untracked files after this session:

```text
.gitignore
lib/certificates.ts
lib/mysql.ts
lib/r2.ts
lib/admin.ts
lib/admin-auth.ts
lib/admin-certificates.ts
package.json
package-lock.json
app/api/certificates/verify/route.ts
app/api/certificates/[certificateNo]/image/route.ts
app/api/admin/
components/admin-panel.tsx
docs/
scripts/
```

Expected ignored local backup folder:

```text
backups/
```

Do not merge to `main`. Continue on the custom branch through production environment setup and deployed-domain testing first.

### Exact Next Steps For The Next Session

1. Configure Hostinger production runtime environment variables.

   Hostinger needs MySQL, admin auth, and private R2 runtime credentials:

   ```env
   MYSQL_HOST=
   MYSQL_PORT=3306
   MYSQL_DATABASE=u641918041_global_lab
   MYSQL_USER=
   MYSQL_PASSWORD=
   CLOUDFLARE_ACCOUNT_ID=
   R2_ACCESS_KEY_ID=
   R2_SECRET_ACCESS_KEY=
   R2_BUCKET=global-lab-certificates
   ADMIN_EMAIL=
   ADMIN_PASSWORD_HASH=
   SESSION_SECRET=
   ```

2. Run a final local sanity check before deployment:

   ```bash
   npm run build
   npm run dev
   ```

   Already-passed local smoke checks include public verification, backend image streaming, admin auth, admin list, admin thumbnails, and reversible admin create/update/delete.
   Still do one browser pass before deploying if the UI has changed.

3. Deploy the custom branch to Hostinger and test the deployed domain.

   Deployed-domain checklist:
   - public certificate verification returns a MySQL row
   - verified certificate image renders through `/api/certificates/{certificateNo}/image`
   - browser receives no R2 credentials, signed URLs, or permanent R2 object URLs
   - admin login works with production `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH`
   - admin list loads MySQL rows
   - admin table previews load from `/api/admin/certificates/{id}/thumbnail`
   - admin image upload writes the original image to private R2 and stores only `r2_object_key`
   - admin edit updates MySQL and can replace an image through R2
   - admin delete removes the MySQL row and cascades thumbnail deletion
   - no runtime Appwrite calls remain

4. Commit and push the production follow-up plan with this deployment branch.

   The follow-up plan starts after deployed-domain smoke testing passes:

   ```text
   docs/production-follow-up.md
   ```

5. If the certification team later provides corrections for the shared-image certificates, update those records after migration through the admin/runtime workflow. If a pre-import correction is explicitly requested, update the clean backup deterministically and rerun:

   ```bash
   npm run migration:r2-manifest
   npm run migration:thumbnails
   npm run migration:mysql
   npm run migration:validate
   ```

   If corrections change image files/object keys after the R2 upload, upload the corrected object(s) to R2 again.

6. Only after deployed smoke tests pass, continue the agreed merge process. Do not merge into `main` before testing is complete.
