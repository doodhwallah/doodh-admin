

# Automatic Delivery Marking at 10:00 AM IST

## Overview
Implement an automated system that marks routine subscription deliveries as "delivered" at 10:00 AM IST daily, unless they have been manually marked as missed, partial, or the customer is on vacation/paused.

## Current State Analysis
- **Deliveries Table**: Stores daily delivery records with statuses: `pending`, `delivered`, `missed`, `partial`
- **Vacation Check**: Database function `is_customer_on_vacation` already exists
- **Subscription Status**: `customer_products.is_active` tracks if subscription is paused
- **Existing Scheduler**: `useAutoDeliveryScheduler` creates pending deliveries but doesn't auto-mark them delivered
- **Cron Pattern**: GitHub Actions workflow already pings health-check function on schedule

## Implementation Approach

### Architecture Decision
Create a new Edge Function (`auto-mark-delivered`) triggered by a database cron job (pg_cron) at 10:00 AM IST (04:30 UTC). This approach ensures:
1. Runs server-side without requiring any user to have the app open
2. Consistent execution regardless of timezone
3. Can be monitored via edge function logs

### Flow Diagram
```text
┌─────────────────────────────────────────────────────────────────────┐
│                     Daily at 10:00 AM IST                           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    pg_cron triggers HTTP call                       │
│              to auto-mark-delivered edge function                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Edge Function: auto-mark-delivered                     │
│  1. Get today's date (IST)                                         │
│  2. Fetch all deliveries with status = 'pending' for today         │
│  3. For each pending delivery:                                     │
│     a. Check if customer is on vacation → SKIP                     │
│     b. Check if subscription is paused → SKIP                      │
│     c. Otherwise → Mark as 'delivered' with delivery_time = now    │
│  4. Log results and return summary                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Technical Details

### 1. New Edge Function: `supabase/functions/auto-mark-delivered/index.ts`

**Logic**:
- Uses service role key for admin-level access
- Fetches all pending deliveries for today
- Checks each customer against:
  - `customer_vacations` table (active vacation covering today)
  - `customer_products` table (if all subscriptions are `is_active = false`)
- Batch updates eligible deliveries to `status = 'delivered'`
- Returns JSON summary with counts: marked, skipped (vacation), skipped (paused), failed

### 2. Database Cron Job Setup

Run SQL to schedule the edge function call at 10:00 AM IST (04:30 UTC):
```sql
SELECT cron.schedule(
  'auto-mark-delivered-daily',
  '30 4 * * *',  -- 04:30 UTC = 10:00 IST
  $$
  SELECT net.http_post(
    url := 'https://eqedibnoatuxczjwkbbx.supabase.co/functions/v1/auto-mark-delivered',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### 3. Config Update: `supabase/config.toml`
Add entry for new function:
```toml
[functions.auto-mark-delivered]
verify_jwt = false
```

### 4. Frontend Integration (Optional Enhancement)
Add a status indicator in the Dashboard or Deliveries page showing when auto-marking last ran and its results. This can be done by:
- Logging results to `activity_logs` table
- Displaying last auto-mark run in the UI

## Exclusion Rules (Intelligent Skip Logic)

| Condition | Action |
|-----------|--------|
| Delivery status already `missed` or `partial` | Skip (manually set by staff) |
| Customer has active vacation covering today | Skip |
| Customer's ALL subscriptions are `is_active = false` | Skip (fully paused) |
| Delivery status is `pending` and none of above | Mark as `delivered` |

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/auto-mark-delivered/index.ts` | Create | Edge function with auto-mark logic |
| `supabase/config.toml` | Modify | Add function config entry |
| Database (via SQL insert) | Execute | Create pg_cron schedule |
| `src/hooks/useAutoDeliveryScheduler.ts` | Modify | Add manual trigger option for testing |

## Additional Considerations

1. **Timezone Handling**: All time calculations use IST (UTC+5:30). The cron runs at 04:30 UTC which equals 10:00 IST.

2. **Idempotency**: Running multiple times won't cause issues since it only updates `pending` deliveries.

3. **Logging**: Results are logged to `activity_logs` for audit trail with entity_type = 'delivery_automation'.

4. **Manual Override**: Staff can still manually mark deliveries as `missed` or `partial` before or after 10:00 AM. Once marked, they won't be changed by automation.

5. **Testing**: The edge function accepts an optional `date` parameter to test with specific dates.

## Summary
This implementation provides hands-free daily delivery marking while respecting:
- Manual staff overrides (missed/partial status)
- Customer vacation schedules
- Paused subscriptions
- Full audit logging for accountability

