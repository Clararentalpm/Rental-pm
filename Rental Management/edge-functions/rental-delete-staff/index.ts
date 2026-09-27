// TEMPLATE — production source is NOT in this repository.
// Reconcile with the live Supabase Edge Function before deploy.
// Gate: auth.uid() must have a profiles row (any role label).
// Still refuses deleting self.
// Deploy: supabase functions deploy rental-delete-staff --no-verify-jwt=false
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
    if (user_id === userData.user.id) {
      return json({ error: 'Cannot delete your own account' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { error: delProfileErr } = await admin.from('profiles').delete().eq('id', user_id)
    if (delProfileErr) return json({ error: delProfileErr.message }, 500)

    const { error: delAuthErr } = await admin.auth.admin.deleteUser(user_id)
    if (delAuthErr) return json({ error: delAuthErr.message }, 500)

    return json({
      ok: true,
      deleted_by: userData.user.id,
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
