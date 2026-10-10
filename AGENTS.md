# Repository instructions for coding agents

These instructions apply to the entire repository.

Before editing code:

1. Read [`Architecture.md`](Architecture.md).
2. Inspect the working tree and preserve unrelated user changes.

Follow the architecture invariants and module boundaries. In particular, do not
weaken type/lint/build gates, expose schema fields by default, trust client file
metadata, reuse mutable upload keys, split related SQL writes across
transactions, or treat hidden admin UI as authorization.

Use synthetic fixtures and never copy `.env` values, credentials, private
records, or original certificate files into code, tests, logs, or documentation.
Do not mutate production data or infrastructure without explicit user authority.

## Database migration safety

Before pushing any change that affects the database schema or stored data:

- Implement the change as the next numbered migration. Never edit a migration
  that has already been applied to any shared or production database.
- Review compatibility with both the currently deployed application and the new
  application version so deployment ordering cannot break either version.
- Identify the expected data impact, failure behavior, recovery procedure and
  backup or restore owner. Obtain explicit user approval before any destructive,
  irreversible or production-data operation.
- Validate schema assumptions without relying on fixed production row counts.
  Treat counts as observational before-and-after evidence only.
- Exercise the migration against an isolated disposable database when
  applicable, add focused regression coverage and confirm reruns are safe.
- Run the repository's required pre-push checks, review the complete migration
  diff and verify migration filenames, ordering and checksums before pushing.
- After deployment, inspect the migration and build logs and confirm the
  application smoke checks before considering the database change complete.

Do not run the full validation suite (`npm run verify:local`, lint, the full test
suite, schema validation, build, or typecheck) for routine edits or before every
response. Run those required checks only immediately before pushing code, or
when the user explicitly asks for them. During normal implementation, use only
a narrowly focused check when it is necessary to diagnose the requested change;
otherwise leave validation for the pre-push step.

When a durable architectural rule changes, update `Architecture.md` in the same
patch. When deployment or recovery evidence changes, update
`docs/operational-handover.md`.

## Codex Efficiency Rules

- Search for relevant files before opening them.
- Read only the files needed for the current task.
- Prefer targeted searches over dumping entire directories.
- Reuse existing project patterns and dependencies.
- Keep shell output concise, especially test logs.
- Use relevant skills only when they add value.
- For simple changes, avoid unnecessary planning.
- For complex changes, plan before implementing.
- Verify changes with focused tests first.
- Never skip necessary validation to save tokens.
- Keep final explanations concise.
