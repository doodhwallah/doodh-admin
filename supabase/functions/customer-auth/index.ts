import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Phone validation regex for Indian mobile numbers
const PHONE_REGEX = /^[6-9]\d{9}$/;

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { action, phone, pin, currentPin, newPin, customerId } = await req.json();
    console.log(`Customer auth action: ${action} for phone: ${phone?.slice(-4) || 'N/A'}`);

    switch (action) {
      case 'register': {
        if (!phone || !pin) {
          return new Response(
            JSON.stringify({ success: false, error: 'Phone and PIN are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate phone format
        if (!PHONE_REGEX.test(phone)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid phone number format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate PIN format (6 digits)
        if (!/^\d{6}$/.test(pin)) {
          return new Response(
            JSON.stringify({ success: false, error: 'PIN must be 6 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Call the register function
        const { data, error } = await supabaseAdmin.rpc('register_customer_account', {
          _phone: phone,
          _pin: pin
        });

        if (error) {
          console.error('Registration error:', error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Registration result:', data);

        // If approved, create auth user
        if (data?.approved) {
          const email = `customer_${phone}@awadhdairy.com`;
          
          // Create auth user
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: pin,
            email_confirm: true,
            user_metadata: {
              phone,
              customer_id: data.customer_id,
              is_customer: true
            }
          });

          if (authError) {
            console.error('Auth user creation error:', authError);
            // Clean up customer account if auth fails
            await supabaseAdmin.from('customer_accounts').delete().eq('customer_id', data.customer_id);
            return new Response(
              JSON.stringify({ success: false, error: 'Failed to create auth account' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Link auth user to customer account
          await supabaseAdmin.from('customer_accounts')
            .update({ user_id: authUser.user.id })
            .eq('customer_id', data.customer_id);

          console.log('Customer registered and auth user created:', authUser.user.id);
        }

        return new Response(
          JSON.stringify(data),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'login': {
        if (!phone || !pin) {
          return new Response(
            JSON.stringify({ success: false, error: 'Phone and PIN are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate phone format
        if (!PHONE_REGEX.test(phone)) {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid phone number format' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify PIN using database function
        const { data: verifyResult, error: verifyError } = await supabaseAdmin.rpc('verify_customer_pin', {
          _phone: phone,
          _pin: pin
        });

        if (verifyError) {
          console.error('PIN verification error:', verifyError);
          return new Response(
            JSON.stringify({ success: false, error: verifyError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!verifyResult || verifyResult.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: 'Invalid phone number or PIN' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const account = verifyResult[0];

        if (!account.is_approved) {
          return new Response(
            JSON.stringify({ success: false, error: 'Account pending approval', pending: true }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get or create auth session
        const email = `customer_${phone}@awadhdairy.com`;
        
        // Try to sign in
        const { data: signInData, error: signInError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: `${origin || 'https://doodhwallah.lovable.app'}/customer/dashboard`
          }
        });

        if (signInError) {
          console.error('Sign in error:', signInError);
          
          // If user doesn't exist, create them
          if (signInError.message.includes('User not found')) {
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
              email,
              password: pin,
              email_confirm: true,
              user_metadata: {
                phone,
                customer_id: account.customer_id,
                is_customer: true
              }
            });

            if (createError) {
              return new Response(
                JSON.stringify({ success: false, error: 'Authentication failed' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            // Update customer account with user_id
            await supabaseAdmin.from('customer_accounts')
              .update({ user_id: newUser.user.id })
              .eq('customer_id', account.customer_id);
          }
        }

        // Generate a proper session by signing in with password
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
        const { data: session, error: sessionError } = await supabaseClient.auth.signInWithPassword({
          email,
          password: pin
        });

        if (sessionError) {
          console.error('Session creation error:', sessionError);
          
          // Try to update password and retry
          const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = userData?.users?.find(u => u.email === email);
          
          if (existingUser) {
            // Update password AND confirm email
            await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
              password: pin,
              email_confirm: true
            });

            // Retry login
            const { data: retrySession, error: retryError } = await supabaseClient.auth.signInWithPassword({
              email,
              password: pin
            });

            if (retryError) {
              return new Response(
                JSON.stringify({ success: false, error: 'Authentication failed' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            return new Response(
              JSON.stringify({
                success: true,
                session: retrySession.session,
                customer_id: account.customer_id
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          return new Response(
            JSON.stringify({ success: false, error: 'Authentication failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            session: session.session,
            customer_id: account.customer_id
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'change-pin': {
        if (!customerId || !currentPin || !newPin) {
          return new Response(
            JSON.stringify({ success: false, error: 'Customer ID, current PIN, and new PIN are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate new PIN format
        if (!/^\d{6}$/.test(newPin)) {
          return new Response(
            JSON.stringify({ success: false, error: 'New PIN must be 6 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get account details including pin_hash
        const { data: account, error: accountError } = await supabaseAdmin
          .from('customer_accounts')
          .select('user_id, phone, pin_hash')
          .eq('customer_id', customerId)
          .single();

        if (accountError || !account) {
          return new Response(
            JSON.stringify({ success: false, error: 'Account not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let verified = false;

        // Check if pin_hash exists
        if (account.pin_hash) {
          // Verify using the update_customer_pin function (which verifies and updates)
          const { data, error } = await supabaseAdmin.rpc('update_customer_pin', {
            _customer_id: customerId,
            _current_pin: currentPin,
            _new_pin: newPin
          });

          if (!error && data?.success) {
            verified = true;
            // PIN hash already updated by the function, just sync auth password
            if (account.user_id) {
              await supabaseAdmin.auth.admin.updateUserById(account.user_id, {
                password: newPin
              });
            }
            return new Response(
              JSON.stringify(data),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          } else if (data?.error) {
            return new Response(
              JSON.stringify({ success: false, error: data.error }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          // No pin_hash stored - verify against auth password instead
          if (account.user_id) {
            const email = `customer_${account.phone}@awadhdairy.com`;
            const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
            
            const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
              email,
              password: currentPin
            });

            if (!signInError && signInData?.user) {
              verified = true;
              console.log(`Customer ${customerId} verified via auth password (no pin_hash existed)`);
            }
          }
        }

        if (!verified) {
          return new Response(
            JSON.stringify({ success: false, error: 'Current PIN is incorrect' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update pin_hash using the new set_customer_pin_hash RPC
        const { data: updateResult, error: updateError } = await supabaseAdmin.rpc('set_customer_pin_hash', {
          _customer_id: customerId,
          _new_pin: newPin
        });

        if (updateError) {
          console.error('Error updating PIN hash:', updateError);
        } else {
          console.log('PIN hash updated successfully for customer:', customerId);
        }

        // Also update the auth password to keep in sync
        if (account.user_id) {
          const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(account.user_id, {
            password: newPin
          });
          
          if (authError) {
            console.error('Error updating auth password:', authError);
          }
        }

        return new Response(
          JSON.stringify({ success: true, message: 'PIN updated successfully' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Customer auth error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
