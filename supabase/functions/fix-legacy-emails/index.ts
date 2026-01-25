import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get all users with the old domain
    const { data: allUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }

    const oldDomain = "@doodhwallah.app";
    const newDomain = "@awadhdairy.com";
    
    const usersToUpdate = allUsers.users.filter(user => 
      user.email?.endsWith(oldDomain)
    );

    console.log(`Found ${usersToUpdate.length} users with old domain`);

    const results = [];

    for (const user of usersToUpdate) {
      const oldEmail = user.email!;
      const newEmail = oldEmail.replace(oldDomain, newDomain);
      
      // Check if new email already exists
      const existingUser = allUsers.users.find(u => u.email === newEmail && u.id !== user.id);
      
      if (existingUser) {
        results.push({
          oldEmail,
          newEmail,
          status: "skipped",
          reason: "New email already exists - may need manual cleanup"
        });
        continue;
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { email: newEmail }
      );

      if (updateError) {
        results.push({
          oldEmail,
          newEmail,
          status: "failed",
          reason: updateError.message
        });
      } else {
        results.push({
          oldEmail,
          newEmail,
          status: "updated"
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalFound: usersToUpdate.length,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fixing legacy emails:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
