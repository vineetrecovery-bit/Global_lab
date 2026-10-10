# Migrations

This directory is the tracked schema baseline for fresh MySQL setup. It contains
no certificate rows, original files, thumbnails, credentials, or private backup
contents.

Files are applied in filename order by the deployment migration runner. Applied
filenames and SHA-256 checksums are recorded in the `schema_migrations` table.
Never edit an applied migration; add the next numbered file instead. The current
baseline is intentionally compatible with the migration-generated shape while
keeping future schema changes reviewable as additional numbered files.

Create migrations with consecutive, three-digit names:

```text
002_add_image_assets.sql
003_backfill_image_assets.sql
```

Migration SQL must be retry-safe because MySQL DDL can commit implicitly. Keep
each file focused, use explicit constraints, and do not use `DELIMITER` or stored
routine definitions. A deployment obtains a database advisory lock, verifies all
previous checksums, applies pending statements, and records the migration only
after every statement succeeds.

Run pending migrations against the configured database:

```bash
npm run db:migrate
```

The command uses environment variables already present in the process and also
loads local `.env` / `.env.local` files when they exist. Never point a local
migration command at production by accident.

Production deployments must use:

```bash
npm run deploy:build
```

The command stops the deployment if the database is unavailable, the lock times
out, a migration fails, an applied migration changed, or the database contains a
migration absent from the checked-out release. Ordinary `npm run build` remains
database-free for local and CI builds.

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

Only run the isolated validator against a disposable database. Automatic schema
application does not authorize destructive data or storage changes. Production
schema/storage migrations still require the backup/restore and deployment
evidence tracked in `docs/operational-handover.md`.
