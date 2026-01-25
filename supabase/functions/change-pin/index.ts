import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// CORS with origin validation
const ALLOWED_ORIGINS = [
  'https://doodhwallah.lovable.app',
  Deno.env.get('APP_URL'),
].filter(Boolean);

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the requesting user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { currentPin, newPin } = await req.json()

    if (!currentPin || !newPin) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: currentPin, newPin' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate new PIN format
    if (!/^\d{6}$/.test(newPin)) {
      return new Response(
        JSON.stringify({ error: 'New PIN must be exactly 6 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's profile including pin_hash
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('phone, pin_hash')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.phone) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let verified = false

    // Check if user has a pin_hash stored
    if (profile.pin_hash) {
      // Verify using the stored hash
      const { data: verifiedUserId, error: verifyError } = await supabaseAdmin.rpc('verify_pin', {
        _phone: profile.phone,
        _pin: currentPin
      })

      if (!verifyError && verifiedUserId) {
        verified = true
      }
    } else {
      // No pin_hash stored - verify against auth password instead
      // This handles first-time PIN change for users created before hash storage was fixed
      const email = `${profile.phone}@awadhdairy.com`
      
      const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password: currentPin
      })

      if (!signInError && signInData?.user) {
        verified = true
        console.log(`User ${user.id} verified via auth password (no pin_hash existed)`)
      }
    }

    if (!verified) {
      return new Response(
        JSON.stringify({ error: 'Current PIN is incorrect' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update the PIN hash using the fixed database function
    const { error: updatePinError } = await supabaseAdmin.rpc('update_pin_only', {
      _user_id: user.id,
      _pin: newPin
    })

    if (updatePinError) {
      console.error('Error updating PIN hash:', updatePinError)
      return new Response(
        JSON.stringify({ error: 'Failed to update PIN' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Also update the auth password to keep in sync
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPin
    })

    if (authError) {
      console.error('Error updating auth password:', authError)
      // Don't fail the request - the PIN hash is updated, which is the primary auth method
    }

    console.log(`PIN updated successfully for user ${user.id}`)

    return new Response(
      JSON.stringify({ success: true, message: 'PIN updated successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in change-pin function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
