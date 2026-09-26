# Edge functions — authorised full access (manual follow-up)

The SPA now treats every `profiles` row as a full-access authorised account holder.
Role labels (`owner` / `manager` / `viewer`) must not gate permissions in the UI.

These Supabase Edge Functions are **not** in this repository. Before or with applying
`supabase_authorised_full_access.sql`, update them so callers are authorised by
**profile membership**, not `role === 'owner'`:

| Function | Expected gate |
|---|---|
| `rental-invite-staff` | `auth.uid()` has a `profiles` row |
| `rental-resend-staff-link` | same |
| `rental-delete-staff` | same; still refuse deleting self |

Do **not**:
- disable JWT verification
- accept anon keys for writes
- expose service-role keys to the client
- auto-run against production without review

Audit trail: keep recording the real `auth.uid()` / `created_by` / `changed_by` of the caller.
