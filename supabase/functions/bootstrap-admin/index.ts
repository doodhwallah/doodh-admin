import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS with origin validation
const ALLOWED_ORIGINS = [
  'https://doodhwallah.lovable.app',
  Deno.env.get('APP_URL'),
].filter(Boolean);

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || '*';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  };
}

// Phone validation regex for Indian mobile numbers
const PHONE_REGEX = /^[6-9]\d{9}$/;

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { phone, pin } = await req.json()

    // Get bootstrap credentials from environment variables
    const bootstrapPhone = Deno.env.get('BOOTSTRAP_ADMIN_PHONE')
    const bootstrapPin = Deno.env.get('BOOTSTRAP_ADMIN_PIN')

    // Validate that bootstrap credentials are configured
    if (!bootstrapPhone || !bootstrapPin) {
      console.error('Bootstrap credentials not configured in environment')
      return new Response(
        JSON.stringify({ error: 'Bootstrap not available. Contact system administrator.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate input format
    if (!phone || !PHONE_REGEX.test(phone)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pin || !/^\d{6}$/.test(pin)) {
      return new Response(
        JSON.stringify({ error: 'PIN must be exactly 6 digits' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate against environment credentials
    if (phone !== bootstrapPhone || pin !== bootstrapPin) {
      return new Response(
        JSON.stringify({ error: 'Invalid bootstrap credentials' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client with service role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const email = `${phone}@awadhdairy.com`

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === email)

    if (existingUser) {
      // User exists, ensure they have super_admin role
      const { error: roleUpdateError } = await supabaseAdmin
        .from('user_roles')
        .update({ role: 'super_admin' })
        .eq('user_id', existingUser.id)

      if (roleUpdateError) {
        console.error('Role update error:', roleUpdateError)
      }

      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ role: 'super_admin', full_name: 'Super Admin' })
        .eq('id', existingUser.id)

      if (profileUpdateError) {
        console.error('Profile update error:', profileUpdateError)
      }

      // Ensure PIN hash is stored using the fixed database function
      const { error: pinHashError } = await supabaseAdmin.rpc('update_pin_only', {
        _user_id: existingUser.id,
        _pin: pin
      })

      if (pinHashError) {
        console.error('PIN hash update error:', pinHashError)
      } else {
        console.log('PIN hash updated for existing admin')
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Admin account ready. You can now login.',
          user_id: existingUser.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create the super admin user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: {
        phone: phone,
        full_name: 'Super Admin'
      }
    })

    if (authError) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = authData.user.id

    // Wait a bit for the trigger to create profile/role
    await new Promise(resolve => setTimeout(resolve, 500))

    // Update user_roles to super_admin
    await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: userId, role: 'super_admin' }, { onConflict: 'user_id' })

    // Update profiles to super_admin
    await supabaseAdmin
      .from('profiles')
      .update({ role: 'super_admin', full_name: 'Super Admin', phone: phone })
      .eq('id', userId)

    // Store the PIN hash using the fixed database function
    const { error: pinHashError } = await supabaseAdmin.rpc('update_pin_only', {
      _user_id: userId,
      _pin: pin
    })

    if (pinHashError) {
      console.error('PIN hash storage error:', pinHashError)
    } else {
      console.log('PIN hash stored for new admin')
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Super admin account created successfully. You can now login.',
        user_id: userId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Bootstrap error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
