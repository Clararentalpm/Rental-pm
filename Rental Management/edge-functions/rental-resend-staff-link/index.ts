// TEMPLATE — production source is NOT in this repository.
// Reconcile with the live Supabase Edge Function before deploy.
// Gate: auth.uid() must have a profiles row (any role label).
// Deploy: supabase functions deploy rental-resend-staff-link --no-verify-jwt=false
//
// Client contract (from index.html):
// POST JSON { user_id }
// Success: 2xx JSON
// Failure: JSON { error: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization bearer token' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return json({ error: 'Invalid session' }, 401)

    const { data: profile } = await userClient
      .from('profiles')
      .select('id')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!profile?.id) return json({ error: 'Not an authorised Rental PM account holder' }, 403)

    const body = await req.json()
    const user_id = String(body.user_id || '').trim()
    if (!user_id) return json({ error: 'user_id required' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: target, error: targetErr } = await admin
      .from('profiles')
      .select('id, display_name')
      .eq('id', user_id)
      .maybeSingle()
    if (targetErr) return json({ error: targetErr.message }, 500)
    if (!target?.id) return json({ error: 'Staff profile not found' }, 404)

    const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(user_id)
    if (getErr || !authUser?.user?.email) {
      return json({ error: getErr?.message || 'Auth user email not found' }, 400)
    }

    // Prefer generateLink + your mailer if production already does that.
    // inviteUserByEmail / resetPasswordForEmail patterns vary by existing function —
    // merge this gate into the LIVE function rather than blind-replacing mail logic.
    const { error: linkErr } = await admin.auth.resetPasswordForEmail(authUser.user.email, {
      redirectTo: Deno.env.get('RENTAL_PM_REDIRECT_URL') || undefined,
    })
    if (linkErr) return json({ error: linkErr.message }, 400)

    return json({
      ok: true,
      resent_by: userData.user.id,
      user_id,
    })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
