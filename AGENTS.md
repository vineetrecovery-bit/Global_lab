# Repository instructions for coding agents

These instructions apply to the entire repository.

Before editing code:

1. Read [`Architecture.md`](Architecture.md).
2. Read the relevant finding, task, dependencies, and acceptance criteria in
   [`docs/ARCHITECTURE_AUDIT.md`](docs/ARCHITECTURE_AUDIT.md).
3. Inspect the working tree and preserve unrelated user changes.

Follow the architecture invariants and module boundaries. In particular, do not
weaken type/lint/build gates, expose schema fields by default, trust client file
metadata, reuse mutable upload keys, split related SQL writes across
transactions, or treat hidden admin UI as authorization.

Use synthetic fixtures and never copy `.env` values, credentials, private
records, or original certificate files into code, tests, logs, or documentation.
Do not mutate production data or infrastructure without explicit user authority.

Run the required checks and focused tests before reporting completion. Update
the audit verification ledger and, when a durable architectural rule changes,
update `Architecture.md` in the same patch. Do not mark a finding resolved on
the basis of source inspection alone.
