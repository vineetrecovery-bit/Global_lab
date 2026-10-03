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

Do not run the full validation suite (`npm run verify:local`, lint, the full test
suite, schema validation, build, or typecheck) for routine edits or before every
response. Run those required checks only immediately before pushing code, or
when the user explicitly asks for them. During normal implementation, use only
a narrowly focused check when it is necessary to diagnose the requested change;
otherwise leave validation for the pre-push step.

When a durable architectural rule changes, update `Architecture.md` in the same
patch. When deployment or recovery evidence changes, update
`docs/operational-handover.md`.
