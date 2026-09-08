# Rental PM

Property / room rental management (V6.5.2).

## Start here
1. Read [`CURSOR_CONTEXT.md`](CURSOR_CONTEXT.md)
2. Read [`ASSESSMENT.md`](ASSESSMENT.md)
3. Follow [`TODO.md`](TODO.md)

## Run locally
Serve the project root as static files (example):

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/`. Sign in with an existing staff account. Do not seed or modify production Supabase data casually.

## Deploy
Canonical host referenced in app: `https://rental-pm-v2.netlify.app/`  
`netlify.toml` was not included in the V6.5.2 handoff package — confirm Netlify settings before changing hosting.
