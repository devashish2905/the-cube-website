# Deploy The Cube site → thecubelife.in (GitHub Pages + GoDaddy DNS)

**Repo:** https://github.com/devashish2905/the-cube-website  
**Registrar / DNS:** GoDaddy (keep nameservers on GoDaddy — do **not** point NS to GitHub)  
**Hosting:** GitHub Pages only (no GoDaddy hosting plan)

Live github.io URL (works today): https://devashish2905.github.io/the-cube-website/

## Critical: keep Resend SMTP DNS

These records must stay. Deleting them breaks transactional email.

| Type | Host / Name | Value (keep as-is) |
|------|-------------|--------------------|
| TXT | `resend._domainkey` | (existing Resend DKIM) |
| CNAME | `send` | `send.forge.rmta.net` (or Resend’s current value) |
| CNAME | `rsend` | `rsend-apne1.forge.rmta.net` |

No root MX required (outbound-only email).

## One-time: GitHub Pages custom domain

Already configured on the repo (as of 2026-10-02):

1. Settings → Pages → Custom domain: `thecubelife.in`
2. Repo root `CNAME` file contains `thecubelife.in`
3. After DNS verifies (green checks), turn on **Enforce HTTPS** (can take up to ~1 hour after DNS)

Do not change the Pages source: branch `main`, folder `/`.

## GoDaddy DNS — add only these (apex + www)

In GoDaddy → thecubelife.in → DNS → manage records:

### Apex `thecubelife.in` (host `@`)

Add **four** A records (keep any other unrelated A records only if you know you need them; remove old website A records that conflict):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` | `185.199.108.153` | 600 or default |
| A | `@` | `185.199.109.153` | 600 or default |
| A | `@` | `185.199.110.153` | 600 or default |
| A | `@` | `185.199.111.153` | 600 or default |

Optional IPv6 (AAAA) for `@`:

| Type | Name | Value |
|------|------|-------|
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

### `www`

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | `www` | `devashish2905.github.io` | 600 or default |

**Important:** Value must be `devashish2905.github.io` (the Pages owner), not `the-cube-website.github.io` and not a trailing path.

## What not to do

- Do **not** change nameservers away from GoDaddy (would break Resend unless you re-create every record elsewhere).
- Do **not** buy / enable GoDaddy website hosting for this domain.
- Do **not** delete `resend._domainkey`, `send`, or `rsend`.
- Do **not** add a root MX unless you later decide to receive mail at @thecubelife.in.

## Propagation & HTTPS

- DNS: usually minutes, sometimes a few hours.
- GitHub domain check: Settings → Pages shows green when A/CNAME resolve correctly.
- Enforce HTTPS after checks are green; certificate can take up to ~1 hour.

## Verify

```bash
dig +short thecubelife.in A
# expect the four 185.199.10x.153 addresses

dig +short www.thecubelife.in CNAME
# expect: devashish2905.github.io.

curl -sI https://thecubelife.in | head -5
curl -sI https://www.thecubelife.in | head -5
```

## Content updates

Edit files in this repo, push to `main`. Pages rebuilds automatically. No build step.

## Ownership

Website deploy stream: Grok Bot (primary), with Learning owning MediVault/Cube product. DNS changes on GoDaddy need Dev (or a signed-in GoDaddy session).
