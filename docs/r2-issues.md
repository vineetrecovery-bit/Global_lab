# R2 Image Delivery: Current Issues

Last reviewed: **2026-10-03**

This document is an evidence-based inventory of current R2 and certificate-image
delivery problems, ordered by severity. It intentionally does not prescribe a
storage model, transformation service, cache provider or implementation plan.

## 1. Temporarily contained 2026-10-03: cache identity does not equal image identity

The public image URL uses the certificate row's `updated_at` value (falling back
to `appwrite_updated_at`) as its version. That timestamp identifies a database
row update, not the bytes or immutable R2 key of the image.

Previously, the image route did not validate the version. The presence of any
`v` query parameter was enough to return:

```http
Cache-Control: public, max-age=31536000, immutable
```

Former immediate consequences:

- An unrelated certificate edit changes the image URL and discards a valid
  cached image unnecessarily.
- An image change that does not change the row timestamp can retain the same URL
  and leave an old image cached for up to one year.
- A caller can supply an arbitrary `v` value and cause a mutable lookup URL to be
  treated as immutable by browser or shared caches.
- The database timestamp has lower identity strength than an immutable object key
  or content digest, including possible collisions between rapid updates.

Evidence:

- `lib/public-certificate.ts`
- `app/api/certificates/[certificateNo]/image/route.ts`
- `tests/public-image-route.test.ts`

Temporary containment:

- Successful public image responses now use `Cache-Control: no-store`
  regardless of whether `v` is absent, empty, timestamp-shaped or arbitrary.
- The route no longer makes a one-year immutable promise from unverified caller
  input.
- This increases requests reaching MySQL, the application and R2 and is not the
  permanent cache design.

Remaining work:

- The public URL still uses a certificate-row timestamp rather than an image or
  representation identity.
- Task 10 will implement permanent immutable URLs after the asset,
  representation and delivery-topology decisions are complete.

## 2. High: small certificate cards receive the complete original

The certificate result displays an image at approximately 320 px wide, but the
public route streams the complete R2 object. Next.js image optimization is
disabled globally.

Uploads currently allow images up to 8 MiB and dimensions up to 8000x8000.

Consequences:

- A visitor can download several megabytes for a 320 px presentation.
- Slow connections have a long blank or partially loaded image period.
- Old and low-memory devices must decode the full-resolution image.
- Mobile data consumption is much greater than the rendered result requires.
- Several simultaneous image loads can amplify server bandwidth and memory
  pressure.

Evidence:

- `components/certificate-result.tsx`
- `next.config.mjs`
- `lib/upload-validation.ts`
- `app/api/certificates/[certificateNo]/image/route.ts`

## 3. High: every uncached image depends on MySQL, the application and R2

For every request that is not satisfied before reaching the application, the
route first queries MySQL for the object key and then performs a signed R2 GET.
The application remains in the response path while the R2 body is streamed.

The temporary containment policy now disables caching for this route. The
repository also contains no verified Hostinger or other CDN configuration for a
future cacheable dynamic route.

Consequences:

- A MySQL, application-host or R2 incident can independently prevent image
  delivery.
- Cold-cache latency includes both a database lookup and an object-storage
  request.
- Origin bandwidth and concurrent connections can grow with cache misses.
- Current code and documentation cannot demonstrate the production shared-cache
  hit ratio or whether dynamic image responses are cached at all.

Evidence:

- `app/api/certificates/[certificateNo]/image/route.ts`
- `lib/r2.ts`
- `docs/operational-handover.md`

## 4. High: a fixed ten-second abort signal covers R2 response delivery

R2 GET and PUT requests use `AbortSignal.timeout(10_000)`. The GET returns a
streaming response body, and the signal is not replaced or separated after
response headers arrive.

Consequences:

- Slow upstream delivery or streaming backpressure may terminate a valid image
  response after ten seconds.
- Large originals are more exposed to the deadline than appropriately sized
  resources.
- The repository has no throttled or delayed-stream test proving correct behavior
  at the deadline.

Evidence:

- `lib/r2.ts`
- `app/api/certificates/[certificateNo]/image/route.ts`

## 5. High: image failures are not represented accurately in the public UI

The image route distinguishes missing objects from temporary R2 failures, but the
certificate image itself has no visible loading, failure or retry state. At the
verification level, transient verification failures are presented as a generic
not-found result.

Consequences:

- A valid certificate with a temporary image failure can appear incomplete or
  broken.
- Users cannot tell whether retrying could succeed.
- Operational failures can be mistaken for invalid certificate data.

Evidence:

- `components/certificate-result.tsx`
- `components/hero.tsx`
- `app/api/certificates/[certificateNo]/image/route.ts`

## 6. Medium: public image responses omit useful object validators and metadata

The public route sets a content type and cache policy but does not forward R2
`ETag`, `Last-Modified` or `Content-Length` headers. It does not handle
conditional requests or byte ranges.

Consequences:

- A revalidation cannot complete with a small `304 Not Modified` response.
- Clients and intermediaries receive less information for cache validation,
  progress reporting and transfer planning.
- Interrupted or partial large-image retrieval cannot use an application-defined
  range contract.

Evidence:

- `app/api/certificates/[certificateNo]/image/route.ts`
- `lib/r2.ts`

## 7. Resolved 2026-10-03: the upload path exposed provider failure details

Previously, when an R2 upload failed, the route read up to 200 characters of the
provider response, included them in an exception and returned that exception
message to the admin browser.

Former consequences:

- Provider implementation details can cross the server boundary.
- Error responses are inconsistent with the architecture rule that raw provider
  errors must not reach browsers.
- Administrators receive unstable provider text rather than a controlled error
  contract and request identifier.

Evidence:

- `app/api/admin/upload/route.ts`
- `Architecture.md`, invariant 9
- `tests/admin-upload.test.ts`
- `tests/admin-provider-error-boundary.test.ts`

Resolution:

- Upload failures now use a stable application-owned message and return the same
  request identifier in the JSON body and `X-Request-ID` header.
- Server logs retain controlled correlation fields without recording provider
  response bodies or thrown provider messages.
- Unexpected certificate create and update failures no longer return raw MySQL
  exception messages.

## 8. Medium: R2 upload and certificate attachment are separate operations

The image is uploaded to R2 before the certificate create or update transaction.
A signed attachment token connects the later database operation to the uploaded
key, but the two writes are not atomic.

Consequences:

- Closing the form after upload leaves an unattached R2 object.
- Database validation, conflict or transaction failure after upload can leave an
  orphan.
- Repeated attempts create new immutable keys and can accumulate unused objects.
- Orphan cleanup is intentionally disabled because no retention policy has been
  approved.

Evidence:

- `app/api/admin/upload/route.ts`
- `lib/upload-attachment.ts`
- `lib/admin-certificates.ts`
- `Architecture.md`, Known Operational Follow-Ups

## 9. Medium: uploads require multiple full-file memory representations

The admin route parses multipart form data, reads the complete `File` into an
`ArrayBuffer`, copies it into a Node.js `Buffer`, hashes it and sends it in a
signed PUT. The maximum accepted file is 8 MiB.

Consequences:

- Concurrent uploads can multiply application memory consumption.
- Upload latency includes complete request buffering and hashing before R2
  delivery begins.
- Memory behavior under concurrent maximum-size uploads is not measured.

Evidence:

- `app/api/admin/upload/route.ts`
- `lib/r2.ts`
- `lib/upload-validation.ts`

## 10. Medium: response MIME type is inferred from the object-key extension

The public route does not use R2 object metadata to determine the response MIME
type. It maps the file extension from the stored key and defaults unknown
extensions to JPEG.

New application uploads are content-validated before key creation, but migrated,
manually inserted or externally modified records still depend on key correctness.

Consequences:

- Incorrect legacy metadata can produce the wrong response type.
- An unknown extension is presented as JPEG even when the stored bytes are not
  JPEG.
- Storage integrity is assumed rather than checked at the delivery boundary.

Evidence:

- `lib/r2.ts`
- `app/api/certificates/[certificateNo]/image/route.ts`
- `lib/upload-validation.ts`

## 11. Low: R2 performance and cache behavior are not observable

The route logs failures with a request identifier but does not record successful
R2 latency, transferred bytes, browser/shared-cache outcomes or image-render
timing. There is no documented constrained-network baseline.

Consequences:

- The team cannot rank optimizations using production evidence.
- Regressions in size, latency or cache effectiveness can go unnoticed.
- It is not possible to verify from application telemetry whether slow delivery
  originates in MySQL, the application host, R2, the network or client decoding.

Evidence:

- `app/api/certificates/[certificateNo]/image/route.ts`
- `docs/operational-handover.md`

## Adjacent issue outside R2

The initial page also contains large bundled images: `hero-lab.png` and
`about-lab.png` are approximately 1.3--1.4 MiB each, and global Next.js image
optimization is disabled. Even after R2 delivery is improved, these assets can
remain a significant problem on slow connections and older devices.

This issue is recorded here for visibility but is not part of the R2 ranking.
