# Admin Fix QR

**Goal:** Certificate images uploaded with a wrong ("gibberish") QR can be repaired
from the admin panel with one **Fix QR** action, without degrading the image.

**Constraint:** every step is deterministic. No AI/ML, OCR or randomness; identical
input bytes give identical output bytes.

## Flow

1. `lib/qr-locate.ts`: Otsu threshold, then 1:1:3:1:1 finder-pattern scan on rows
   with vertical cross-check; choose the right-isosceles triple of finders. Does not
   need the code to decode. Rejects zero (`not_found`), several (`multiple`),
   rotated beyond 3 degrees (`rotated`) or inconsistent geometry.
2. `lib/certificate-qr-fix.ts`: decode the current QR (`jsqr`); if it already equals
   `certificateVerificationUrl(CERTIFICATE_NO)` return `already_correct`. Otherwise
   build the expected matrix with `qrcode` (level M), sample the original dark and
   light colours (per-channel median), and paint integer-size modules centred over
   the old square. Only that rectangle is composited onto the original with `sharp`
   (ICC profile kept); the whole image is encoded once. The output is decoded again
   and must equal the expected URL, otherwise nothing is returned.
3. `lib/admin-certificate-qr-fix.ts` + `POST /api/admin/certificates/[id]/fix-qr`:
   `mode: "preview"` returns before/after crops; `mode: "apply"` uploads the result
   under a new immutable R2 key and attaches it (plus a new thumbnail) through
   `updateAdminCertificate` with `__expectedRevision`, so stale edits conflict.
   The original object is never overwritten.
4. UI: **Fix QR** button next to **Generate QR** (`components/certificate-qr-fix-dialog.tsx`).
   Auto-detects, shows current vs fixed, and offers a drag-to-select region when
   auto-detection fails.

## Format behaviour

| Format | Result |
|---|---|
| PNG | Lossless; all pixels outside the QR are identical |
| WebP | Written lossless; pixels outside the QR identical |
| JPEG | Re-encoded once at quality 98, 4:4:4 (unavoidable); UI states this |
| GIF / animated | Rejected |

## Tests

`tests/certificate-qr-fix.test.ts` uses synthetic fixtures only: PNG and JPEG fixes,
untouched pixels outside the QR, colour preservation, ICC preservation,
byte-identical repeat runs, already-correct, none, two QR codes, manual region,
bad region and unsupported format.
