# Rental Management (Rental PM V6.5.2)

这是以后日常修改的主文件夹。  
**All future Rental PM changes should happen in this folder.**

## Start here
1. Read [`CURSOR_CONTEXT.md`](CURSOR_CONTEXT.md)
2. Read [`ASSESSMENT.md`](ASSESSMENT.md)
3. Follow [`TODO.md`](TODO.md)

## Run locally
From this folder:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/`. Sign in with an existing staff account. Do not seed or modify production Supabase data casually.

## Deploy
Canonical host: `https://rental-pm-v2.netlify.app/`  
Repo-root `netlify.toml` publishes this folder (`publish = "Rental Management"`).
