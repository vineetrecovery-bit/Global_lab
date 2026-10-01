# Production Follow-Up Plan

This plan starts after the custom branch is deployed to Hostinger and the deployed domain smoke test passes.

## 1. Immediate Auth Hardening

The site is expected to have one admin only. Keep the app-owned cookie auth, but harden it before considering the migration fully complete.

- Add login rate limiting for `/api/admin/auth/login`.
- Prefer per-IP plus per-email throttling.
- Remove or stop using plain `sha256:` password hashes.
- Use `scrypt:<salt>:<hex>` for `ADMIN_PASSWORD_HASH`.
- Keep `SESSION_SECRET` long and random.
- Rotate `SESSION_SECRET` if an admin session may be compromised.
- Consider moving the admin UI to a dedicated `/admin` route or hiding the floating admin button in production.

## 2. Admin Upload Guardrails

Manual admin upload writes originals to private R2 and stores thumbnails in MySQL during save. Add stricter production controls:

- Enforce maximum upload size server-side.
- Allow only expected image/PDF MIME types.
- Reject unknown extensions and suspicious content types.
- Decide how to clean orphan R2 objects when an image is uploaded but the admin closes the form before saving.

## 3. Admin Table Pagination

The current admin list can load all certificate rows. Replace it with paginated server-side listing.

- Add `page`, `pageSize`, and optional search/filter query params to `/api/admin/certificates`.
- Return `{ documents, total, page, pageSize }`.
- Query MySQL with `LIMIT` and `OFFSET`.
- Join `certificate_thumbnails` only for visible page rows.
- Add frontend pagination controls.
- Add search by certificate number and common fields if needed.

## 4. R2 Security Finalization

After deployed image rendering and admin upload both work from Hostinger:

- Restrict the production R2 token client IP filter to Hostinger server IP `147.93.109.213`, or the confirmed Hostinger outbound IP if different.
- Confirm the browser never receives R2 credentials, signed URLs, or permanent R2 object URLs.
- Keep the R2 bucket private.

## 5. Migration Cleanup Later

Only after production is stable and rollback is no longer needed:

- Decide whether to keep or remove Appwrite backup/migration scripts.
- If scripts are removed, remove the `appwrite` dev dependency.
- Keep ignored local backups out of Git.
- Merge into `main` only after deployed testing and follow-up risk review are complete.
