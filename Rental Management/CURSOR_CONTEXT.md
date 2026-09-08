# Rental PM — Cursor Handoff

## Authoritative base
- Product: Rental PM
- Working folder name: **Rental Management**
- Base version: **V6.5.2**
- Master requirements: `MASTER_REQUIREMENTS.md` (authoritative brief + phase gates)
- Source in this folder: `index.html` (app). Deploy config: repo-root `netlify.toml` publishes this folder.
- Treat this existing code as the authoritative starting point. Do **not** rebuild from scratch.
- Future edits should stay inside `Rental Management/` unless deploy/root config must change.
- Complete one phase, test, report, and wait for owner approval before the next phase.

## First instruction to Cursor
Before changing code, inspect the full project and report:
1. current architecture and data flow;
2. working features;
3. broken/incomplete features;
4. Supabase/auth/RLS/security risks;
5. deployment risks;
6. recommended priority order.

Do not make destructive changes until this assessment is complete. Preserve existing functionality and data compatibility.

## Architecture observed in V6.5.2
This is currently a single-page HTML/CSS/JavaScript application. The client talks directly to Supabase REST/Auth. Session data is stored in browser localStorage. `netlify.toml` publishes the project root and disables caching. The UI identifies itself as V6.5.2.

The code currently includes concepts/tables for properties, rooms, tenants, tenancies/stays, rent payments, bonds/deposits/refunds, staff profiles/roles, room profiles, price history and activity/history.

Roles visible in the UI/code include owner, manager and viewer. Owner-level destructive/staff actions must remain restricted.

## Product purpose
Rental PM is a shared property/room rental management system for a primary owner plus authorised managers/sub-accounts. It must support both long-term and short-stay tenants and make occupancy, payments, bonds and upcoming movements easy to understand.

## Confirmed functional requirements
- Dashboard overview of property/rooms and current occupancy.
- Rooms and room profiles.
- Tenant profiles and search.
- Long-term and short-stay tenancies.
- Check-in/check-out dates and times.
- Daily/weekly rent and configurable payment cycles.
- Rent payment recording, due dates and overdue visibility.
- Bonds/deposits, deductions and refunds.
- Occupancy/availability calendar, including future stays.
- Shared management: primary owner plus authorised manager/viewer accounts.
- Owner retains higher-level permissions, especially destructive/account-management actions.
- Staff/sub-account access should expose only appropriate information/actions.
- Responsive usability on desktop, tablet and mobile/iPad.
- Avoid duplicate tenant/property records where practical.
- Preserve history rather than overwriting past stays/payment records.
- Maintain a changelog and TODO list for future modifications.

## Known recent issues / history
- Earlier deployments experienced **404 Not Found**.
- Another deployment could remain stuck on **Loading**.
- V6.5.2 contains an 8-second startup timeout so it fails visibly instead of loading forever.
- Deployment/configuration has been worked on using Netlify/Vercel during prior iterations. Inspect current configuration before changing hosting assumptions.
- Do not replace working deployment configuration merely for stylistic reasons.

## Existing rental context used during development
The project was designed around a multi-room Brisbane rental property. Historical development examples included long-term rooms and short stays, including a Room 5 short stay with an 11:00 check-in. Treat any live tenant information in Supabase as real operational data: **do not seed, overwrite, delete or migrate it casually.**

## Security / data rules
- Never commit passwords, service-role keys or other secrets.
- The existing Supabase key in client code is a publishable client key, not permission by itself. Verify **Row Level Security (RLS)** and policies before trusting client-side role checks.
- Client-side `owner/manager/viewer` checks are UX only unless backed by database policies/server-side authorization.
- Do not expose a Supabase service-role key in browser code.
- Do not wipe or reseed production tables.
- Before schema changes, identify dependencies and propose a migration/rollback plan.
- Protect owner-only destructive actions at the data/API layer, not just by hiding buttons.
- Review whether localStorage session handling is appropriate and whether auth recovery/reset flows are secure.

## Development rules
1. Read all existing code first.
2. Preserve working UI/business rules unless explicitly asked to change them.
3. Make incremental, testable changes.
4. Never silently change rent, bond, payment-cycle or occupancy semantics.
5. Do not delete live data to solve UI problems.
6. Test authentication and each role after auth-related changes.
7. Test mobile/tablet/desktop after UI changes.
8. Check console/network errors when diagnosing Loading failures.
9. Verify deployment routing/build settings before diagnosing a 404 as an app-code issue.
10. Keep `CHANGELOG.md` and `TODO.md` updated.

## First-pass priorities
1. Establish that V6.5.2 runs locally without modifying data.
2. Map Supabase tables, foreign keys, RLS policies and role model.
3. Verify login/session refresh/password recovery.
4. Verify owner/manager/viewer permissions at both UI and database levels.
5. Verify CRUD for tenants/stays/payments/bonds without destructive test data.
6. Verify calendar and rent-due calculations.
7. Verify current deployment configuration and reproduce/fix any 404 or startup failure.
8. Only then continue feature development.

## Important instruction
When requirements are ambiguous, ask the owner rather than inventing a business rule. This is an existing operational project, not a greenfield demo.
