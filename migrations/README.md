# Migrations

This directory is the tracked schema baseline for fresh MySQL setup. It contains
no certificate rows, original files, thumbnails, credentials, or private backup
contents.

Apply files in filename order. The current baseline is intentionally compatible
with the migration-generated shape while keeping future schema changes
reviewable as additional numbered files.

Local static validation:

```bash
npm run schema:validate
```

Live isolated-database validation applies the tracked migrations to the
configured test database and runs synthetic certificate/thumbnail checks:

```bash
MYSQL_ISOLATED_SCHEMA_VALIDATE=1 \
MYSQL_ALLOW_SCHEMA_RESET=1 \
MYSQL_HOST=127.0.0.1 \
MYSQL_USER=root \
MYSQL_PASSWORD=<test-password> \
MYSQL_DATABASE=global_lab_ci \
npm run schema:validate:isolated
```

Only run the isolated validator against a disposable database. Production
schema/storage migrations still require the backup/restore and deployment
evidence tracked in `docs/ARCHITECTURE_AUDIT.md`.
