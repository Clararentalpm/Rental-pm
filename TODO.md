# Rental PM TODO

- [x] Audit V6.5.2 architecture and current functionality before edits. → see `ASSESSMENT.md`
- [x] Fix confirmed client bugs (Income `property()`, payment delete table, tenant search selector, bondEvents state key).
- [ ] Verify Supabase schema, RLS and owner/manager/viewer authorization (including `activity_log` column name: `actor_user_id` vs `user_id`).
- [ ] Verify login, refresh, forgot/reset password flows.
- [ ] Reproduce/check historical 404 and Loading issues.
- [ ] Confirm Netlify publish config / Edge Access vs public staff access; restore `netlify.toml` if available.
- [ ] Verify tenant/stay creation and editing.
- [ ] Verify room allocation and overlapping-stay handling.
- [ ] Verify calendar/availability display on iPad/mobile/desktop.
- [ ] Verify rent due/overdue/payment-period calculations.
- [ ] Verify bond/deposit/refund calculations and owner-only deletion.
- [ ] Verify staff invite/resend/reset/delete permissions.
- [ ] Document production deployment and rollback procedure.
