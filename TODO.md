# Rental PM TODO

- [x] Audit V6.5.2 architecture and current functionality before edits. → see `ASSESSMENT.md`
- [x] Fix confirmed client bugs from assessment (Income `property()`, payment delete table, tenant search selector, bondEvents state key) without changing rent/bond semantics.
- [x] Restore versioned `netlify.toml` (publish root + no-cache; no catch-all SPA rewrite).
- [ ] Verify Supabase schema, RLS and owner/manager/viewer authorization.
- [ ] Verify login, refresh, forgot/reset password flows.
- [ ] Reproduce/check historical 404 and Loading issues against live Netlify (Edge Access / password gate still a risk).
- [ ] Confirm Netlify Edge Access vs public staff access for invite/reset redirects.
- [ ] Verify tenant/stay creation and editing.
- [ ] Phase 2: improve Tenant → Stay reuse and duplicate prevention without losing data.
- [ ] Phase 3: Add Stay workflow + room/date overlap conflict warnings.
- [ ] Verify calendar/availability display on iPad/mobile/desktop.
- [ ] Verify rent due/overdue/payment-period calculations.
- [ ] Verify bond/deposit/refund calculations and owner-only deletion.
- [ ] Verify staff invite/resend/reset/delete permissions.
- [ ] Document production deployment and rollback procedure.
