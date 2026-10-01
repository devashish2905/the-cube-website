# The Cube — Family Medical Vault (marketing site)

Static marketing landing page for **The Cube (MediVault)**.

## Preview locally

**Option A — open the file**

```bash
open /workspace/cube-website/index.html
# or double-click index.html in your file manager
```

**Option B — simple static server**

```bash
cd /workspace/cube-website
python3 -m http.server 8080
# then visit http://localhost:8080
```

Or with Node:

```bash
npx --yes serve -l 8080 /workspace/cube-website
```

## Files

| Path | Role |
|------|------|
| `index.html` | Single-page marketing site |
| `styles.css` | Mobile-first premium styles |
| `script.js` | Nav toggle, sticky header, smooth scroll |
| `assets/the-cube-logo-transparent.png` | Product logo |

No build step. Google Fonts CDN is used for DM Sans + Instrument Serif.

## Tone

Healthcare-adjacent, calm, trustworthy. Product organizes family medical records and reminders — **not** medical advice, diagnosis, or treatment. See the on-page disclaimer.
