---
name: npm-security-audit
description: Audit and remediate npm dependency vulnerabilities in this repo using the local security audit workflow instead of manually triaging pasted scanner rows.
---

# NPM Security Audit

Use this skill when the user asks to fix Hostinger, npm, GitHub, or package vulnerability reports for this repository.

## Workflow

- Work from `/Users/rohanchawla/Desktop/global_lab/Global_lab`.
- Prefer the repo scripts over manual one-off commands:
  - `npm run security:audit` writes `security-reports/latest-audit.json` and `security-reports/latest-audit.md`.
  - `npm run security:fix` runs `npm audit fix --package-lock-only`, syncs `node_modules`, runs the production build, then writes the reports.
  - `npm run security:verify` is the strict final check: npm production audit plus production build.
- Treat `package.json` and `package-lock.json` as the source of truth for dependency vulnerability cleanup.
- Generated files under `security-reports/` are local artifacts and should not be committed.
- Do not manually paste or process scanner rows unless the scanner reports something that `npm audit` cannot see.

## Triage Rules

- Start with production vulnerabilities: this repo deploys a Next.js app, so `npm audit --omit=dev` is the default signal.
- If a fix only changes `package-lock.json`, run `npm install` afterward so local `node_modules` matches the lockfile.
- Always verify with `npm run build` after dependency changes.
- If vulnerabilities remain after `npm run security:fix`, inspect `security-reports/latest-audit.md` and only then decide whether a semver-major upgrade, package replacement, or risk note is needed.
- Preserve unrelated user changes in the working tree. In particular, do not revert application files while doing dependency remediation.
