# Domain Migration Architecture Plan

Date: 7 October 2026

Status: Proposed; planning only. No application, DNS, or hosting changes have been made.

## 1. Business requirement

Make a new domain the primary address for the business while keeping existing links to the old domain working. Website visitors should arrive at the equivalent page on the new domain. Existing API clients must continue reaching the application without losing request data or authentication.

**Recommended architecture:** retain ownership, DNS, and HTTPS for the old domain; redirect website traffic to the new domain; route legacy API traffic to the same application through a compatibility endpoint until clients migrate.

DNS alone cannot change the address shown in a browser. A redirect requires an HTTP service on the old domain. A redirect also depends on the client following it; server-side forwarding is required for clients that do not follow redirects.

## 2. Working assumptions and decisions needed

The repository's [architecture guide](../Architecture.md) documents the following baseline. These are repository facts, not a live infrastructure audit.

| Item | Working value / decision |
|---|---|
| Current domain | `globallabtesting.in`, confirmed by the business owner |
| New canonical domain | Not yet decided; `new-domain.example` is a placeholder to replace before implementation |
| Hosting | Hostinger, running Next.js App Router |
| Data services | Existing MySQL database and private Cloudflare R2 storage |
| URL structure | Keep existing paths and query parameters; explicitly map any changed paths |
| Hostnames | Inventory apex, `www`, and any active subdomains; do not assume a wildcard covers them |
| Scope | Website, APIs, and webhooks, confirmed by the business owner; separately inventory email and other protocols |
| Availability objective | No planned outage; target recovery within 15 minutes during the temporary redirect stage |
| Legacy support | Retain website redirects indefinitely where practical; retain API compatibility while required clients remain |

Before execution, identify the domain/DNS account owner, hosting owner, engineering owner, business owner, final hostname, migration window, and any external API or webhook consumers. Confirm hosting support for both domains and the chosen routing rules. R2 usage does not establish that Cloudflare manages the site's DNS or edge traffic. The presence of `vercel.json` does not establish that Vercel hosts production.

## 3. Target request flow

```text
Old domain: HTTP/HTTPS
          |
          v
  Host-aware routing service with valid TLS
          |
          +-- Website GET/HEAD --> redirect --> New canonical HTTPS domain
          |                                           |
          +-- Legacy APIs / supported mutations ------+--> Same application
              (server-side routing / forwarding)             |
                                                        MySQL + private R2

New canonical domain --> Same application, without a migration redirect
```

Prefer routing at the existing hosting ingress if it supports host/path/method rules and the required forwarding behavior. Otherwise use a dedicated HTTPS gateway for the old domain. Avoid introducing a second production application or database solely to rename the domain.

Hostinger documents connecting custom domains to Node.js applications, but the exact dual-domain and forwarding capabilities must be checked for this account before choosing configuration. Keep the old endpoint operational before replacing any primary-domain association. [Hostinger domain connection documentation](https://www.hostinger.com/support/how-to-connect-a-custom-domain-to-a-node-js-application/)

If both hostnames can reach the existing Next.js application, host-scoped application routing is an alternative. Next.js supports host matching and temporary/permanent redirects; a blanket redirect is insufficient when APIs need exceptions. Select one layer to own migration redirects and review existing HTTPS, `www`, and trailing-slash rules to avoid loops. [Next.js redirect configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects)

## 4. Routing contract

Evaluate rules in the following order:

| Request | Required behavior |
|---|---|
| Unrecognized hostname | Reject; never build a destination from an arbitrary Host header |
| Required certificate-validation or platform-health route | Handle locally where required by the provider; document exceptions |
| Old-domain `/api/*`, confirmed webhook routes, and other supported mutation routes | Forward to the fixed trusted application origin, preserving the request and response contract |
| Old-domain website GET/HEAD | Redirect to the canonical HTTPS host, preserving path and query |
| New-domain alias, such as `www` | Apply the same API compatibility policy; redirect website navigation to the canonical host |
| New canonical hostname | Serve normally; no migration redirect |

Use **307 Temporary Redirect** during the initial observation period and **308 Permanent Redirect** after acceptance. These statuses preserve the HTTP method when a client follows the redirect; 301/302 can change POST to GET. Permanent redirects can be cached, which limits rollback. Use `Cache-Control: no-store` for temporary migration redirects and verify it at the chosen routing layer. [HTTP semantics, redirect definitions](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.4)

Example website mapping:

```text
http://globallabtesting.in/?campaign=launch
  -> https://new-domain.example/?campaign=launch

https://www.globallabtesting.in/<existing-path>?x=1&x=2
  -> https://new-domain.example/<existing-path>?x=1&x=2
```

Preserve repeated query parameters and encoded path semantics. Target a single redirect to the final canonical URL. Missing pages should still return a meaningful 404/410 at their destination; do not send every old URL to the homepage. URL fragments are not sent to the server, so verify important bookmarked anchors in browsers.

“All requests” means all inventoried, supported web traffic retains its intended behavior. Invalid requests remain invalid, authorization remains enforced, and unsupported methods need not become successful. HTTPS APIs are the supported mutation transport; HTTP forwarding cannot protect credentials already transmitted in plaintext. Email, SSH, and other protocols require separate migration arrangements.

## 5. API, authentication, and storage continuity

The application contains certificate verification and image APIs, plus protected admin authentication, certificate management, and upload routes. Treat all `/api/*` routes as compatibility routes initially, including read-only endpoints, because callers may not support redirects.

Cross-origin redirects can strip the Authorization header, and browser preflight behavior can prevent redirected API calls. This is why method-preserving redirects alone do not satisfy API continuity. [Authorization header behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Authorization), [CORS and redirects](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)

Implementation requirements:

- Forward to a fixed, TLS-verified application origin that cannot loop through the old-domain redirect. Preserve method, raw body, query, content type, relevant credentials, status, and required response headers; strip hop-by-hop headers.
- Preserve upload size limits, streaming behavior, timeouts, and download behavior. Keep private responses out of shared caches. Do not automatically retry non-idempotent requests after ambiguous failures.
- Preserve old-host cookies for legacy same-origin API calls. Review any response cookie Domain attributes and absolute Location headers. Forwarded host/client-IP headers must come from a trusted proxy, with user-supplied copies sanitized.
- The current admin cookie in `lib/admin-auth.ts` is host-only, HttpOnly, and SameSite=Strict. Users should expect to sign in again on the new domain. Do not pass sessions in redirect query strings or weaken cookie policy to share them across unrelated domains.
- Keep server-side authorization and existing validation intact. Review CORS, CSRF/origin checks, OAuth callbacks, webhook signatures, and third-party allowlists where applicable; do not assume these integrations exist.
- For each webhook provider, inventory the callback URL, signature scheme, timeout, retry policy, and event identifier. Forward the exact raw payload and signature headers. If signatures include the original URL or host, validate against the securely retained original request context according to that provider's specification. Do not disable signature validation to accommodate the domain change.
- Move webhook registrations provider by provider after validating the new endpoint. Use provider test deliveries and failure/retry tests; deduplicate by the provider's stable event identifier where supported. Avoid registering both endpoints simultaneously unless duplicate delivery is safely handled. Keep the old callback endpoint forwarding through the provider's retry window and any remaining consumer-support period.
- Preserve the existing deployment topology during the rename. Authentication throttles and revoked sessions currently use process-local maps; introducing extra application instances would require a separate consistency review.
- Keep MySQL and R2 resources unchanged. Validate certificate lookup and file delivery through the new domain. Inventory existing signed links; URLs whose signatures bind the hostname need explicit compatibility handling rather than a host substitution.
- Keep assets needed by already-open browser tabs available during the transition. Inventory stale client bundles, service workers if present, and cached HTML before adding broad asset redirects.

## 6. Delivery phases and ownership

| Phase | Owner | Work and exit condition |
|---|---|---|
| 1. Discovery | Engineering + operations | Confirm domains, inspect current DNS/TLS/routing, inventory URLs and consumers, capture baseline traffic/errors, and record an explicit route policy |
| 2. Prepare destination | Operations + engineering | Connect new domain, provision and verify HTTPS, serve the existing application, and confirm data access and critical workflows |
| 3. Prepare compatibility | Engineering | Implement host-scoped redirects and API forwarding; validate cookies, uploads, query preservation, caching, and rollback in a test environment |
| 4. Controlled cutover | Operations | Enable temporary website redirects; keep legacy API compatibility active; observe for a proposed 24–48 hours including normal business use |
| 5. Commit move | Engineering + business owner | After acceptance, switch website redirects to permanent, update public links/search configuration, and record deployment evidence |
| 6. Maintain | Operations + business | Monitor both domains, migrate remaining clients, renew the old domain/TLS, and review compatibility traffic monthly |

Indicative effort: 2–5 engineering/operations days for preparation and validation, followed by observation and ongoing maintenance. DNS propagation, TLS issuance, external integrations, and hosting limitations can extend this estimate.

### Preparation checklist

- Export the current DNS zone and routing configuration to an appropriate secure operational location; record restore steps without copying credentials into this document.
- Inventory A, AAAA, CNAME, CAA, MX, TXT, DNSSEC, and verification records. Preserve mail and unrelated service records. Change only the records needed for web traffic where possible.
- If an existing web DNS record must change, lower its TTL in advance, allowing at least its previous TTL to elapse. Keep both old and new routing destinations functional during propagation, including IPv6.
- Provision valid TLS for every supported old/new HTTPS hostname before switching traffic; enable expiry monitoring and renewal. An old HTTPS request must complete TLS before it can receive a redirect, including for HSTS clients.
- Audit hardcoded URLs, generated links, metadata, QR codes, emails, analytics, and third-party configurations. Update relevant metadata in `app/layout.tsx` and add/update canonical URLs, sitemap, and robots configuration as needed.
- Validate the destination without exposing duplicate indexable content during preparation; remove temporary indexing restrictions at launch.
- Use synthetic records for write/upload tests in a test environment. Any production smoke test must use an explicitly designated test fixture and agreed cleanup process.

## 7. Acceptance criteria and validation

| Area | Required evidence |
|---|---|
| Host coverage | Every inventoried old apex/`www`/subdomain resolves to a working endpoint over its supported protocols |
| Website routing | GET and HEAD receive the expected 307 during observation and 308 afterward; Location uses the fixed new HTTPS host |
| URL fidelity | Root, nested paths, encoded characters, repeated/empty query values, and bookmarks reach equivalent destinations |
| Direct destination | New canonical URLs serve directly; no self-redirects or loops; expected missing pages remain 404/410 |
| API compatibility | Old API URLs work with automatic redirect-following disabled, matching expected statuses and response contracts |
| Webhooks | Provider test events reach old and new endpoints as applicable, signatures validate, acknowledgements meet provider timeouts, and repeated events cause no duplicate business action |
| Authentication | New-domain login/logout works; legacy compatibility sessions behave as designed; unauthorized calls still fail |
| Data operations | Synthetic certificate reads, updates, and uploads preserve bodies, validation, and transaction behavior; no duplicate writes on retries |
| Storage and assets | Images/downloads and assets load; private files remain private; already-open tabs retain required functionality |
| TLS and security | Trusted certificates on all HTTPS hosts; renewal configured; unknown hosts rejected; no open redirect; forwarding trust boundaries verified |
| Browser behavior | Desktop/mobile navigation and admin workflows pass, including a browser with no previous cookies and an existing session |
| Operations | Dashboards, alerts, configuration restore, and rollback drill completed before cutover |

Suggested read-only checks after replacing placeholders and deploying the candidate rules:

```bash
# Check the redirect response without following it.
curl -sS -o /dev/null -D - 'https://globallabtesting.in/?migration_check=1&x=1&x=2'

# Follow website redirects; confirm the final URL and hop count.
curl -sS -L --max-redirs 5 -o /dev/null \
  -w '%{http_code} %{url_effective} %{num_redirects}\n' \
  'http://globallabtesting.in/?migration_check=1'

# No certificate number: expect the existing API validation response, not a redirect.
curl -sS -D - 'https://globallabtesting.in/api/certificates/verify'
```

Do not treat a successful homepage check as proof of API or mutation compatibility. Before pushing implementation changes, follow the checks required by [AGENTS.md](../AGENTS.md) and [Architecture.md](../Architecture.md). This planning-only document does not require the application validation suite.

## 8. Monitoring and rollback

Track old/new request counts by route class, redirect targets and loops, API 4xx/5xx rates, latency, login failures, upload failures, and certificate/image availability. Use synthetic browser checks to measure completed journeys: a redirect log alone cannot show whether a visitor reached the destination. Avoid recording credentials, cookies, request bodies, or sensitive URL values in migration logs.

Proposed rollback triggers, to calibrate against the baseline before launch:

- Any redirect loop, invalid certificate, authorization regression, or confirmed data corruption/duplicate mutation: act immediately.
- Critical synthetic journey fails twice consecutively within five minutes.
- New-domain 5xx rate exceeds 1% for five minutes with sufficient traffic, or p95 latency exceeds twice the baseline for ten minutes.

Rollback procedure:

1. Disable temporary migration redirects at their owning layer and restore direct service on the old website hostname.
2. Restore the previous routing configuration or known-good application release as appropriate; preserve the shared database and storage.
3. Keep the new hostname serving a working application, including for clients already using it. Do not introduce reverse redirects that can loop with cached old-to-new redirects.
4. Restore DNS only if necessary; DNS caches make DNS reversal slower than routing rollback.
5. Re-run critical journeys on both domains, record the incident, and resume the migration only after the cause is resolved.

After permanent redirects are published, cached clients cannot reliably be forced back to the old hostname. Recovery then requires keeping the new domain healthy, potentially by routing it to the previous known-good application. The 15-minute recovery target must be demonstrated during rehearsal; it is not a propagation guarantee.

## 9. Search visibility and long-term operation

Map old pages to their equivalent new pages, update canonical/internal links and sitemap URLs, verify both Search Console properties, and submit the domain move through Change of Address where applicable. Keep old redirects accessible to crawlers. Monitor indexing, crawl errors, and search traffic; short-term ranking fluctuations remain possible. Google recommends retaining redirects for at least one year; long-lived certificate links and printed QR codes justify keeping them much longer. [Google Search Central site-move guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)

Enable old-domain auto-renewal, assign an accountable owner, and budget for domain renewal plus routing/TLS operations. Retire API compatibility only after consumer inventory and traffic evidence establish that it is no longer required and the business accepts the impact. If the requirement is that old requests always work, the old domain and compatibility service must remain operational.

## 10. Definition of done

- [ ] Final domains, supported traffic, owners, and route policy are recorded.
- [ ] New domain serves the application with valid HTTPS.
- [ ] Existing website links redirect to equivalent new URLs with paths and queries preserved.
- [ ] Legacy APIs and supported mutations reach the application successfully under the compatibility policy.
- [ ] Authentication, uploads, certificate verification, and image delivery pass acceptance checks.
- [ ] Monitoring and rollback are rehearsed; the temporary observation period passes.
- [ ] Permanent website redirects, search configuration, and public business links are updated.
- [ ] Old-domain retention, renewal, and maintenance have an owner and budget.
- [ ] Actual deployed architecture and recovery evidence are recorded in `Architecture.md` and `docs/operational-handover.md` after implementation.
