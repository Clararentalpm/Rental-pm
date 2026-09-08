# Rental Management (Rental PM V6.5.2)

这是以后日常修改的主文件夹。  
**All future Rental PM changes should happen in this folder.**

## Start here
1. Read [`MASTER_REQUIREMENTS.md`](MASTER_REQUIREMENTS.md) — authoritative product brief + phase gates
2. Read [`CURSOR_CONTEXT.md`](CURSOR_CONTEXT.md)
3. Read [`ASSESSMENT.md`](ASSESSMENT.md)
4. Follow [`TODO.md`](TODO.md)

## Phase status
- **Phase 1 — Stabilise:** implemented; awaiting owner approval before Phase 2
- Phase 2+ must not start until the owner approves the Phase 1 test report

## Run locally
From this folder:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/`. Sign in with an existing staff account. Do not seed or modify production Supabase data casually.

## Deploy
- **Current free host (GitHub Pages):** `https://clararentalpm.github.io/Rental-pm/`
- Legacy Netlify host (deploys currently paused on that team): `https://rental-pm-v2.netlify.app/`
- Repo-root `netlify.toml` still publishes this folder when Netlify deploys resume.
- Invite/reset redirects use `CANONICAL_URL` in `index.html` (GitHub Pages). Add that URL in Supabase Auth redirect allow-list.
