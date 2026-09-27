# PR #28 — Safe production release plan

Draft PR: https://github.com/Clararentalpm/Rental-pm/pull/28  
Branch: `cursor/authorised-full-access-930a` → `main`

## Deploy fact (blocking awareness)

`.github/workflows/deploy-pages.yml` runs on **push to `main`** and deploys the entire
`Rental Management/` folder to **GitHub Pages** (production URL
`https://clararentalpm.github.io/Rental-pm/`).

Merging PR #28 **is** a production frontend deploy. There is no separate Pages gate.

The SPA talks to production Supabase (`odezjuvqmnkzmcnezoyq.supabase.co`).

## What this PR changes safely on merge alone

| Area | On merge to main |
|---|---|
| Frontend permissions (`isAuthorisedAccountHolder` / `hasFullAppAccess`) | Deployed |
| Carindale display SoT (`roomIsEnsuite` / bathroom helpers) | Deployed — UI correct even if DB flags stale |
| Carindale auto-write on `loadAll` | **Removed** — load does **not** PATCH `rooms` / `room_profiles` |
| softReconcileOpenActions (payment actions) | Still runs for authorised editors (non-destructive; no new payments) |
| RLS policies | **Not** applied by merge |
| Edge Functions | **Not** deployed by merge |
| Carindale SQL flag correction | **Not** applied by merge |

Frontend merge is therefore safe against accidental Carindale room-config writes.
**Staff “full access” is incomplete** until RLS + Edge Functions are updated.

## Precise release order (do not skip)

### 0) Pre-flight (read-only)

1. Confirm Draft PR #28 is the intended tip; no preview PR.
2. Run `supabase_authorised_full_access_VERIFY.sql` **section A** in Supabase SQL Editor.
3. **Save** the policy inventory output (needed if section-4 rewrites must be rolled back).
4. Download live Edge Function sources from Supabase; diff vs `edge-functions/*/`.

### 1) RLS — apply first

1. Apply `supabase_authorised_full_access.sql` in Supabase SQL Editor.
2. Run `supabase_authorised_full_access_VERIFY.sql` (expect B OK; C empty for writes).
3. Rollback if needed: `supabase_authorised_full_access_ROLLBACK.sql` (+ manual restore of any section-4 rewrites from the saved inventory).

### 2) Edge Functions — with or immediately after RLS

1. Merge authorisation gate into live sources (profile membership).
2. Deploy `rental-invite-staff`, `rental-resend-staff-link`, `rental-delete-staff`.
3. Probe: non-owner profile JWT succeeds; no-profile / anon fails; self-delete refused.
4. See `EDGE_FUNCTIONS_AUTHORISED_ACCESS.md`.

### 3) Carindale room-config SQL — recommended before or right after merge

1. Preview + apply `supabase_carindale_ensuite_rooms_fix.sql` (Carindale R3 ensuite, R4 not; bathroom_type align; McGregor untouched).
2. Rollback if needed: `supabase_carindale_ensuite_rooms_fix_ROLLBACK.sql`.
3. Optional: UI stays correct without this step; SQL only clears stored drift.

### 4) Merge PR #28 to main (deploys Pages)

1. Mark ready for review / undraft only when steps 1–2 are done (or explicitly accepted risk that staff Edge/RLS remain owner-gated).
2. Merge → GitHub Pages auto-deploys.
3. **Do not** create another preview PR.

### 5) Post-merge verification (production)

1. Carindale Room 3 badge/label = Ensuite; Room 4 ≠ Ensuite; McGregor unchanged.
2. Occupancy / Availability regressions still match PR #27 expectations (suite in repo).
3. Sign in as a non-owner `profiles` account: Staff Access invite/resend/delete + writes succeed **only if** steps 1–2 applied.
4. Sign in without a `profiles` row: private app denied.

## Rollback summary

| Layer | Rollback |
|---|---|
| Frontend (Pages) | Revert the merge commit on `main` (re-deploys prior Pages artifact) |
| RLS | `supabase_authorised_full_access_ROLLBACK.sql` + inventory restore |
| Edge Functions | Redeploy previous function versions |
| Carindale SQL | `supabase_carindale_ensuite_rooms_fix_ROLLBACK.sql` |

## Explicitly blocked / unverified from this agent environment

- No Supabase SQL Editor / service-role access → cannot apply or confirm live RLS.
- No live Edge Function source or deploy credentials → templates only; cannot prove staff APIs.
- No production JWT for manager/viewer/no-profile probes.
- Frontend / Node regression suite **does not** prove RLS or Edge Function behaviour.

## Do not (this release)

- Merge / deploy / run production SQL from the agent
- Create another preview PR or temporary preview link
- Rely on `reconcileCarindaleEnsuiteFlags()` auto-running on load (it does not)
