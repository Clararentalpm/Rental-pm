# Edge functions — authorised full access (manual follow-up)

The SPA treats every `profiles` row as a full-access authorised account holder.
Role labels (`owner` / `manager` / `viewer`) must not gate permissions in the UI
**or** in these Edge Functions.

## Status

| Item | In this repo? |
|---|---|
| Live production function source | **No** — not checked into GitHub |
| Templates matching client contracts | Yes — `edge-functions/*/` |
| Deployed / verified against production | **No** — requires Supabase dashboard / CLI access |

## Required gate (all three)

Authorise by **profile membership**, not `role === 'owner'`:

| Function | Client body | Expected gate |
|---|---|---|
| `rental-invite-staff` | `{ email, display_name, role, redirect_to }` | `auth.uid()` has a `profiles` row |
| `rental-resend-staff-link` | `{ user_id }` | same |
| `rental-delete-staff` | `{ user_id }` | same; still refuse deleting self |

## Deploy order (manual)

1. Export / download the **live** function source from Supabase (Dashboard → Edge Functions, or `supabase functions download`).
2. Diff against `edge-functions/<name>/index.ts` templates.
3. Keep production mail / invite / delete mechanics; **only change the authorisation check** to profile membership unless the live source is confirmed identical.
4. Deploy with JWT verification **enabled** (`--no-verify-jwt` must stay false / unset).
5. Probe with a non-owner `profiles` JWT and an unauthorised JWT (see VERIFY section G).

```bash
# Example only — run from a machine with Supabase CLI + project linked:
supabase functions deploy rental-invite-staff
supabase functions deploy rental-resend-staff-link
supabase functions deploy rental-delete-staff
```

## Do not

- disable JWT verification
- accept anon keys for writes
- expose service-role keys to the client
- auto-run against production without review
- claim staff invite/delete works from frontend tests alone

## Rollback

Redeploy the previous function versions from your Supabase dashboard history / local backup.
Frontend rollback alone does **not** restore owner-only Edge gates.

## Audit trail

Keep recording the real `auth.uid()` / `created_by` / `changed_by` / `invited_by` /
`deleted_by` of the caller.
