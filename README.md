# Rental Management

This repository’s working app folder is **`Rental Management/`**.

以后修改、加功能、修 bug，都在这个文件夹里做。

## Open the project
- Master requirements: [`Rental Management/MASTER_REQUIREMENTS.md`](Rental%20Management/MASTER_REQUIREMENTS.md)
- App: [`Rental Management/index.html`](Rental%20Management/index.html)
- Context: [`Rental Management/CURSOR_CONTEXT.md`](Rental%20Management/CURSOR_CONTEXT.md)
- Assessment: [`Rental Management/ASSESSMENT.md`](Rental%20Management/ASSESSMENT.md)
- TODO: [`Rental Management/TODO.md`](Rental%20Management/TODO.md)
- Changelog: [`Rental Management/CHANGELOG.md`](Rental%20Management/CHANGELOG.md)

## Phase gate
Phase 1 stabilisation is implemented and must be tested/approved before Phase 2.

## Run locally
```bash
cd "Rental Management"
python3 -m http.server 8080
```
Open `http://localhost:8080/`.

## Deploy
`netlify.toml` at the repo root publishes the `Rental Management` folder.
Canonical host: `https://rental-pm-v2.netlify.app/`
