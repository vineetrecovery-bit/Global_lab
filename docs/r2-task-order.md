# R2 Image Delivery: Recommended Task Order

Last reviewed: **2026-10-03**

This is the recommended order for addressing the problems recorded in
[`r2-issues.md`](r2-issues.md). The issue inventory remains ordered by severity;
this document is ordered by urgency and architectural dependency so that each
task can be selected and completed without forcing avoidable rework later.

Do not treat the task numbers as permission to make production storage or data
changes. Retention, deletion, migration and production rollout require explicit
decisions and recovery plans first.

## 1. Stop exposing raw R2 provider errors — completed 2026-10-03

**Issues:** 7
**Why now:** This is an independent server-boundary defect and does not depend
on the future storage model.

Replace provider response text returned to the admin browser with a stable error
contract and request identifier. Preserve useful provider details only in
controlled server-side logging.

**Done when:** No R2 or SQL provider response text can cross the HTTP boundary,
and focused tests cover the public error contract.

**Outcome:** Admin upload failures now return a stable application-owned error
with a request identifier instead of R2 response text. The adjacent certificate
create and update fallbacks were also hardened so unexpected MySQL messages do
not cross the HTTP boundary. Focused tests cover unsuccessful R2 responses,
thrown R2 client errors and unexpected certificate-write errors. No production
storage or data changes were made.

## 2. Contain the unsafe immutable-cache contract — completed 2026-10-03

**Issues:** 1, temporary containment only
**Why now:** A one-year immutable response is a correctness risk today, but its
permanent replacement depends on storage identity decisions.

Until an image identity can be validated, do not classify a response as
immutable merely because a `v` query parameter exists. Choose a conservative
temporary cache policy with awareness that reducing caching increases requests
to MySQL, the application and R2.

This task must not introduce a new permanent versioning scheme.

**Done when:** Arbitrary or unverified query parameters cannot produce a
one-year immutable response, and the temporary operational tradeoff is
documented.

**Outcome:** Successful public image responses now use `Cache-Control: no-store`
whether `v` is absent, timestamp-shaped, empty or arbitrary. The existing URL
shape remains compatible, but unverified caller input can no longer grant
immutable caching. This intentionally increases requests reaching MySQL, the
application and R2 until Tasks 6, 8, 9 and 10 establish a trustworthy asset,
representation, delivery path and permanent cache identity.

## 3. Decide the image asset and ownership model

**Issues:** 8, and the foundation for 1, 2, 3, 9 and 10
**Why now:** All durable delivery and caching work depends on what the system
considers an image asset.

Decide and record:

- whether the certificate row keeps only a current R2 pointer or references a
  separate image-asset record;
- whether old image versions must remain addressable;
- whether identical uploads are separate assets or deduplicated content;
- whether originals and derived representations belong to one asset;
- which component is the source of truth for object key and metadata;
- whether upload remains server-buffered or moves to a staged/direct flow; and
- which identifier is safe to expose publicly, if any.

**Done when:** One model is selected, alternatives and tradeoffs are recorded,
and it is clear how a certificate, original, thumbnail and future variants are
related. Update `Architecture.md` because this is a durable architectural rule.

## 4. Approve retention, deletion and recovery rules

**Issues:** 8
**Depends on:** Task 3
**Why now:** Attachment and cleanup cannot be made reliable while the intended
lifetime of stored objects is unknown.

Define behavior for:

- uploads that are never attached;
- failed certificate creates or updates;
- replaced and explicitly removed images;
- deleted certificates;
- historical versions, if retained;
- minimum retention and cleanup grace periods; and
- backup, restore and rollback interactions.

No existing R2 objects should be deleted as part of defining this policy.

**Done when:** Every object state has an owner, retention rule and recoverable
cleanup process. Update `docs/operational-handover.md` for the approved policy.

## 5. Establish a pre-change delivery baseline

**Issues:** 11, measurement portion
**Depends on:** None, but complete before changing representations or delivery
**Why now:** Later performance decisions need a reproducible starting point.

Measure with synthetic or approved non-sensitive fixtures:

- representative original sizes and dimensions;
- response latency and transferred bytes;
- constrained-network image-render behavior;
- application and R2 failure behavior; and
- whether the production delivery path has a verified shared-cache layer.

Do not log certificate data, object contents, secrets or private object keys.

**Done when:** The baseline and success criteria are documented well enough to
compare later changes.

## 6. Implement the asset metadata and attachment boundary

**Issues:** 8 and 10
**Depends on:** Tasks 3 and 4
**Why now:** Later routes need trustworthy identity and metadata rather than
inferring them from filenames or mutable certificate fields.

Implement the chosen model for authoritative object identity, content type,
size, dimensions and digest where required. Define the state transition between
an uploaded object and an attached asset. Preserve transactional guarantees for
related MySQL writes and define compensation or cleanup for the R2 boundary.

Plan and test legacy metadata backfill before changing production data.

**Done when:** The application can identify the exact stored asset and its
validated metadata, attachment failures have defined outcomes, and legacy
records have a reviewed migration path.

## 7. Finalize the upload transport and memory behavior

**Issues:** 9, remaining parts of 8
**Depends on:** Tasks 3 and 6
**Why now:** Optimizing the current server-buffered upload before choosing the
asset and attachment model could be discarded by a staged or direct-upload
design.

Implement bounded upload behavior appropriate to the selected architecture.
Retain content validation, unique immutable keys, authorization and attachment
integrity. Define retry, idempotency and abandoned-upload handling before
enabling retries.

**Done when:** Maximum-size and concurrent uploads have known memory behavior,
and retries cannot silently overwrite or attach the wrong object.

## 8. Define and create delivery-sized representations

**Issues:** 2
**Depends on:** Task 6
**Why now:** Cache and URL design must distinguish an original from each derived
representation.

Choose whether the public certificate card receives a fixed thumbnail,
responsive variants or a transformed response. Define dimensions, formats,
quality, generation timing, regeneration rules and storage ownership. Keep the
original when required by the approved retention policy.

**Done when:** The approximately 320 px presentation no longer requires the
complete original, and each representation has deterministic identity and
metadata.

## 9. Choose the production delivery topology

**Issues:** 3
**Depends on:** Tasks 3, 6 and 8
**Why now:** Permanent URLs, cache headers, authentication boundaries and
observability depend on whether bytes pass through the application, a CDN, R2,
or a transformation service.

Compare the intended production paths, including failure domains, origin
protection, cache purge behavior, cost, signed/public URL behavior and Hostinger
compatibility. Verify rather than assume shared caching for dynamic routes.

**Done when:** One production request path is selected and documented, including
which system performs lookup, authorization, transformation and byte delivery.

## 10. Implement permanent image URL and cache identity

**Issues:** 1, permanent resolution
**Depends on:** Tasks 6, 8 and 9
**Why now:** The system now knows the asset, representation and delivery path
that the URL must identify.

Make the public URL identify exactly one immutable representation using the
selected object key, public asset identifier, content digest or documented
combination. Validate any caller-supplied identity before returning immutable
cache headers. Define behavior for old URLs after replacement or deletion.

**Done when:** Unrelated certificate edits do not change the image identity,
different bytes cannot be served under the same immutable URL, and arbitrary
version values cannot claim immutable caching.

## 11. Implement the HTTP delivery contract

**Issues:** 6
**Depends on:** Tasks 9 and 10
**Why now:** Validators and ranges must describe the selected representation and
must be supported by the actual delivery path.

Define and test `ETag`, `Last-Modified`, `Content-Length`, conditional requests,
byte ranges and cache-control behavior. Only implement range support if the
chosen clients and delivery topology benefit from it.

**Done when:** Revalidation and transfer metadata are correct for the selected
asset representation, with focused tests for `200`, `304` and any supported
range responses.

## 12. Set timeout and streaming policy

**Issues:** 4
**Depends on:** Tasks 8, 9 and 11
**Why now:** Appropriate deadlines depend on object sizes and whether the
application still streams response bodies.

Separate connection/header deadlines from body-delivery behavior where the
selected runtime permits it. Test slow upstream delivery, downstream
backpressure and abort behavior using synthetic fixtures.

**Done when:** Valid slow responses are not terminated by an unrelated fixed
deadline, while stalled upstream requests remain bounded.

## 13. Add accurate public loading and failure states

**Issues:** 5
**Depends on:** Tasks 9 through 12
**Why now:** The UI should be built against the final missing, transient,
retriable and immutable-delivery contracts.

Represent loading, missing image, temporary image failure, verification failure
and retry behavior separately. Do not present a transient service problem as an
invalid certificate.

**Done when:** Users can distinguish invalid data from temporary delivery
failure and can retry where retrying is meaningful.

## 14. Complete production observability and verify outcomes

**Issues:** 11, final implementation
**Depends on:** Tasks 8 through 13
**Why now:** Final telemetry must match the selected asset and delivery topology,
while Task 5 provides the before-change comparison.

Measure successful latency, transferred bytes, representation, failures and
cache outcomes at the layers the application can observe. Compare the results
with the Task 5 baseline and record production smoke-check evidence after an
authorized deployment.

**Done when:** The team can determine whether a slow or failed image came from
lookup, application processing, R2, shared delivery infrastructure, network
transfer or client rendering, without logging sensitive content.

## Selection rule

Normally pick the first incomplete task whose dependencies are complete. Tasks
1 and 2 are complete, so Task 3 is the next architectural task. Task 5 may run
in parallel with Tasks 3 and 4 because it is read-only measurement. Do not begin
a later implementation task solely because its corresponding issue has a higher
severity label.
