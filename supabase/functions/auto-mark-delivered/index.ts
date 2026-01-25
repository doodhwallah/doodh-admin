import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

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

interface AutoMarkResult {
  date: string;
  marked: number;
  skipped_vacation: number;
  skipped_paused: number;
  skipped_already_processed: number;
  errors: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional date parameter for testing (defaults to today IST)
    let targetDate: string;
    try {
      const body = await req.json().catch(() => ({}));
      targetDate = body.date || getISTDateString();
    } catch {
      targetDate = getISTDateString();
    }

    console.log(`[auto-mark-delivered] Running for date: ${targetDate}`);

    const result: AutoMarkResult = {
      date: targetDate,
      marked: 0,
      skipped_vacation: 0,
      skipped_paused: 0,
      skipped_already_processed: 0,
      errors: [],
    };

    // 1. Fetch all pending deliveries for today
    const { data: pendingDeliveries, error: fetchError } = await supabase
      .from("deliveries")
      .select("id, customer_id, status")
      .eq("delivery_date", targetDate)
      .eq("status", "pending");

    if (fetchError) {
      console.error("[auto-mark-delivered] Error fetching deliveries:", fetchError);
      result.errors.push(`Fetch error: ${fetchError.message}`);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    if (!pendingDeliveries || pendingDeliveries.length === 0) {
      console.log("[auto-mark-delivered] No pending deliveries found for today");
      await logActivity(supabase, "auto_mark_completed", result);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[auto-mark-delivered] Found ${pendingDeliveries.length} pending deliveries`);

    // 2. Get unique customer IDs
    const customerIds = [...new Set(pendingDeliveries.map(d => d.customer_id))];

    // 3. Fetch customers on vacation for today
    const { data: vacations } = await supabase
      .from("customer_vacations")
      .select("customer_id")
      .eq("is_active", true)
      .lte("start_date", targetDate)
      .gte("end_date", targetDate);

    const vacationCustomerIds = new Set(vacations?.map(v => v.customer_id) || []);
    console.log(`[auto-mark-delivered] Customers on vacation: ${vacationCustomerIds.size}`);

    // 4. Fetch customers with ALL subscriptions paused (is_active = false for all products)
    const { data: activeSubscriptions } = await supabase
      .from("customer_products")
      .select("customer_id")
      .eq("is_active", true)
      .in("customer_id", customerIds);

    const customersWithActiveSubscriptions = new Set(activeSubscriptions?.map(s => s.customer_id) || []);

    // 5. Determine which deliveries to mark as delivered
    const deliveriesToMark: string[] = [];
    
    for (const delivery of pendingDeliveries) {
      // Skip if customer is on vacation
      if (vacationCustomerIds.has(delivery.customer_id)) {
        result.skipped_vacation++;
        continue;
      }

      // Skip if customer has no active subscriptions (all paused)
      if (!customersWithActiveSubscriptions.has(delivery.customer_id)) {
        result.skipped_paused++;
        continue;
      }

      deliveriesToMark.push(delivery.id);
    }

    console.log(`[auto-mark-delivered] Marking ${deliveriesToMark.length} deliveries as delivered`);

    // 6. Batch update deliveries
    if (deliveriesToMark.length > 0) {
      const { error: updateError, count } = await supabase
        .from("deliveries")
        .update({
          status: "delivered",
          delivery_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", deliveriesToMark)
        .eq("status", "pending"); // Extra safety check

      if (updateError) {
        console.error("[auto-mark-delivered] Error updating deliveries:", updateError);
        result.errors.push(`Update error: ${updateError.message}`);
      } else {
        result.marked = count || deliveriesToMark.length;
      }
    }

    // 7. Log the results to activity_logs
    await logActivity(supabase, "auto_mark_completed", result);

    console.log("[auto-mark-delivered] Completed:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unexpected error occurred";
    console.error("[auto-mark-delivered] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

/**
 * Get current date string in IST timezone (YYYY-MM-DD)
 */
function getISTDateString(): string {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.toISOString().split("T")[0];
}

/**
 * Log activity to activity_logs table
 */
async function logActivity(
  supabase: AnySupabaseClient,
  action: string,
  details: AutoMarkResult
): Promise<void> {
  try {
    await supabase.from("activity_logs").insert({
      entity_type: "delivery_automation",
      entity_id: null,
      action,
      details: JSON.stringify(details),
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[auto-mark-delivered] Failed to log activity:", error);
  }
}
