# Admin Certificate QR Implementation Plan

> **For agentic workers:** Implement this plan task by task. Use `superpowers:executing-plans` if that workflow is applicable.

**Goal:** Add a visible **Generate QR** button to every certificate row in the admin panel. Clicking it shows a scannable QR for `https://globallabtesting.in/?batch=<certificate_number>` and allows downloading the image.

**Architecture:** Use each admin row's existing `CERTIFICATE_NO` value. Build the public URL in a small pure helper, then generate the QR image in the browser when its dialog opens. The existing home page already reads `batch` and automatically verifies it. No API, schema, or stored QR field is needed.

**Tech Stack:** Next.js App Router, React, TypeScript, existing admin table and modal styling, a browser-compatible QR generator such as `qrcode` with its TypeScript types.

**Spec:** User request in this conversation, 2026-10-19.

## Decisions and constraints

- `certificate_number` means the row's existing `CERTIFICATE_NO` field.
- Keep **Generate QR** visible in the Actions cell for every row. If a legacy row has no certificate number, disable its button and explain why in its accessible label or title.
- Encode the number as a query parameter; for example, `TEST/42` becomes `https://globallabtesting.in/?batch=TEST%2F42`.
- Show the number and destination URL alongside the QR so an admin can verify the target before downloading it.
- Generate the PNG only when requested. Do not persist it or add a server endpoint.
- No architectural invariant changes are expected; do not update `Architecture.md` unless implementation reveals a new durable rule.

## Review focus

- Certificate numbers with `/`, spaces, `&`, `?`, or `#` must round-trip through the `batch` query parameter.
- A row with a missing number still shows the action, but cannot create a broken QR.
- Opening a different row after closing the dialog must show that row's number and QR, never the previous image.
- A failed browser image generation must show a readable error and avoid offering an invalid download.
- The downloaded PNG must encode the same URL displayed in the dialog.

## Task 1: URL construction

**Files:** Create `lib/certificate-qr.ts`; create `tests/certificate-qr.test.ts`.

**Interface:** `certificateVerificationUrl(certificateNo: string): string` returns the absolute production URL. It accepts a nonblank certificate number and uses `URL`/`searchParams` to encode it.

- [ ] Write focused tests for a plain number and reserved characters; parse each result with `new URL(...)` and assert the hostname, pathname, and `searchParams.get('batch')` equal the input number.
- [ ] Run `npx vitest run tests/certificate-qr.test.ts` and confirm the tests fail for the missing helper.
- [ ] Implement the helper using the fixed production origin `https://globallabtesting.in/`.
- [ ] Run the same focused test and confirm it passes.

## Task 2: Per-row action and QR dialog

**Files:** Modify `components/admin-panel.tsx`; create `components/certificate-qr-dialog.tsx`; update `package.json` and lockfile for a QR library and types if needed.

**Interface:** `CertificateQrDialog` receives `{ certificateNo: string; onClose: () => void }`. It uses `certificateVerificationUrl`, generates a PNG data URL when opened, and renders a preview, target URL, and **Download PNG** action. The admin table stores the selected certificate number in local state.

- [ ] Add a focused component test or browser-level check that the action label appears for each rendered row, a missing-number row keeps a disabled action, and selecting a new row changes the dialog target.
- [ ] Add a text-labeled **Generate QR** button beside Edit and Delete in each row's Actions cell. Pass `doc.CERTIFICATE_NO` from that row to the dialog, and clear the selected value on close.
- [ ] Implement the dialog in the existing modal style, with a close control, loading state, image-generation error state, QR preview, destination URL, and PNG download. Use an accessible image description containing the certificate number.
- [ ] Ensure a prior asynchronous generation cannot replace the QR after the dialog switches rows or closes. Keep the download disabled until the image for the current URL is ready.
- [ ] Run only focused tests needed for this change. Manually scan or decode one generated QR and confirm it opens the displayed URL and triggers the existing public verification flow.

## Before push

- [ ] Review the complete diff for unintended API, schema, or data changes.
- [ ] Run the repository-required `npm run verify:local` immediately before pushing, per `AGENTS.md`.
