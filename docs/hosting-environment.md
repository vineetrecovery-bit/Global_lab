# Hosting Environment

This file records where the current Global Lab site is hosted so migration and infrastructure choices can use the same source of truth.

## Hostinger

### Server Details

```text
Server Name: server685
Server Location: Asia (India)
Backups Location: Singapore
```

## Infrastructure Decisions

- Prefer Cloudflare R2 bucket location hint: `Asia-Pacific / apac`.
- Keep R2 storage class as `Standard`, not Infrequent Access.
- Keep the R2 bucket private for production.
- Continue with the current architecture:
  - Hostinger/Next.js serves the app and backend routes.
  - MySQL stores certificate/admin data and small admin-table thumbnails.
  - Private R2 stores full/original certificate images and PDFs.
  - Frontend never receives R2 credentials or permanent R2 object URLs.

## Notes

- Hostinger and R2 being in different nearby Asian locations should mainly affect latency, not R2 egress billing.
- Cloudflare R2 egress is free; billing is mainly storage plus Class A/Class B operations.
- Since the Hostinger server is in India and backups are in Singapore, `Asia-Pacific / apac` is the best R2 location hint for this project.
