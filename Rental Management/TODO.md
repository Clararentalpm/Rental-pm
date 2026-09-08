# Rental PM TODO

## Phase gate
- [x] Save master requirements → `MASTER_REQUIREMENTS.md`
- [x] Phase 1 — Stabilise V6.5.2 confirmed client bugs (code complete)
- [ ] Owner review + approval of Phase 1 test report
- [ ] **Do not start Phase 2 until owner approval**

## Phase 1 checklist
- [x] Audit V6.5.2 architecture and current functionality before edits. → see `ASSESSMENT.md`
- [x] Fix confirmed client bugs from assessment (Income `property()`, payment delete table, tenant search selector, bondEvents state key) without changing rent/bond semantics.
- [x] Restore versioned `netlify.toml` (publish `Rental Management` + no-cache; no catch-all SPA rewrite).
- [x] Place working project in folder `Rental Management/` for ongoing edits.
- [x] Automated Phase 1 regression checks (see `PHASE1_TEST_REPORT.md`)
- [ ] Live signed-in UI verification (needs owner credentials / Netlify access)
- [ ] Verify Supabase schema, RLS and owner/manager/viewer authorization.
- [ ] Verify login, refresh, forgot/reset password flows against live hosting.
- [ ] Reproduce/check historical 404 and Loading issues against live Netlify (Edge Access / password gate still a risk).
- [ ] Confirm Netlify Edge Access vs public staff access for invite/reset redirects.

## Later phases (blocked until approval)
- [ ] Phase 2: improve Tenant → Stay reuse and duplicate prevention without losing data.
- [ ] Phase 3: Add Stay workflow + room/date overlap conflict warnings.
- [ ] Phase 4: Calendar usefulness for day-to-day management.
- [ ] Phase 5: Strengthen Owner / Manager / Viewer permissions.
- [ ] Phase 6: iPad/mobile UX and dashboard clarity.
- [ ] Document production deployment and rollback procedure.
