# 02 — Research: Cloudinary + Cloudflare R2 storage fit

**Type:** wayfinder:research (AFK)

**Status:** closed

## Resolution

**Both providers: go.**

- **Cloudinary (Source Images) — go, with caveat.** Free plan: 25 credits/month pooled across
  storage + bandwidth + transformations (1 credit = 1GB or 1000 transforms), 500 req/hour Admin
  API limit. No ToS clause blocks commercial/production use — a paid tier is needed once combined
  usage crosses roughly 20–25GB/month. (The 500 req/hour figure came from a page that 403'd on
  direct fetch, sourced via search-snippet instead — worth a manual click-through to confirm
  before treating as final.)
- **Cloudflare R2 (GLB Assets) — go, indefinitely on egress.** Cloudflare's pricing page states
  explicitly: "There are no charges for egress bandwidth for any storage class." Free tier: 10
  GB-month storage, 1M Class A ops/month, 10M Class B ops/month, no file-type restriction (GLB is
  fine). **Caveat:** the free `r2.dev` subdomain is docs-flagged as rate-limited/dev-only —
  production serving needs a custom domain attached to the bucket (still free, no Cloudflare
  Worker required).

**Asset:** [research/02-storage-fit.md](../research/02-storage-fit.md)

**Blocked by:** None — can start immediately

## Question

Confirm current free-tier limits and ToS for the two chosen storage providers, and whether they
actually fit this production use case:

- **Cloudinary** (Source Images) — free-tier storage/bandwidth caps, any restriction relevant to
  a production multi-user service.
- **Cloudflare R2** (generated GLB Assets) — confirm the zero-egress-fee claim still holds,
  current free-tier storage cap, and any limitation on serving binary files (not images/video) to
  a `<model-viewer>`-style frontend.

Produce a cited markdown file with current numbers and a go/no-go recommendation for each
provider.
