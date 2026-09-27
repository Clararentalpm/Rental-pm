// TEMPLATE — production source is NOT in this repository.
// Reconcile with the live Supabase Edge Function before deploy.
// Gate: auth.uid() must have a profiles row (any role label).
// Deploy: supabase functions deploy rental-invite-staff --no-verify-jwt=false
//
// Client contract (from index.html):
// POST JSON { email, display_name, role, redirect_to }
// Success: 2xx JSON (any body the client ignores beyond ok)
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

    const { data: profile, error: profileErr } = await userClient
      .from('profiles')
      .select('id, role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (profileErr) return json({ error: profileErr.message }, 500)
    // Authorised = profiles row present. Role labels do NOT gate.
    if (!profile?.id) return json({ error: 'Not an authorised Rental PM account holder' }, 403)

    const body = await req.json()
    const email = String(body.email || '').trim().toLowerCase()
    const display_name = String(body.display_name || '').trim() || email
    const role = ['owner', 'manager', 'viewer'].includes(String(body.role))
      ? String(body.role)
      : 'viewer'
    const redirect_to = String(body.redirect_to || '').trim()
    if (!email) return json({ error: 'email required' }, 400)

    const admin = createClient(supabaseUrl, serviceKey)
    const invite = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: redirect_to || undefined,
      data: { display_name, role },
    })
    if (invite.error) return json({ error: invite.error.message }, 400)

    const newId = invite.data.user?.id
    if (newId) {
      const { error: upsertErr } = await admin.from('profiles').upsert({
        id: newId,
        display_name,
        role,
      })
      if (upsertErr) return json({ error: upsertErr.message }, 500)
    }

    return json({
      ok: true,
      invited_by: userData.user.id,
      user_id: newId,
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
