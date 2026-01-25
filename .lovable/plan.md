
# Complete End-to-End Audit Report: Awadh Dairy Management System

## Executive Summary

This audit covers the Awadh Dairy Management System - a comprehensive dairy farm and milk delivery management application built with React, TypeScript, and Lovable Cloud (Supabase backend). The system handles customer management, milk production tracking, delivery scheduling, billing, employee management, and breeding records.

### Overall Assessment
The application is **well-structured** with good separation of concerns, proper TypeScript typing, and production-safe logging. However, there are several **security hardening opportunities**, **potential race conditions**, and **resilience improvements** needed before the system is fully production-ready.

---

## Section 1: Security Findings

### 1.1 CRITICAL: Hardcoded Bootstrap Credentials
**Location**: `src/pages/Auth.tsx` (lines 56, 129, 157) and `supabase/functions/bootstrap-admin/index.ts` (line 19)

**Issue**: Admin bootstrap credentials (phone: 7897716792, PIN: 101101) are hardcoded in both client-side and server-side code.

**Risk**: Anyone with access to the source code can gain admin access on fresh deployments.

**Fix**:
- Move credentials to environment variables (`BOOTSTRAP_ADMIN_PHONE`, `BOOTSTRAP_ADMIN_PIN`)
- Update bootstrap-admin function to read from `Deno.env`
- Remove credential visibility from Auth.tsx
- Add one-time-use flag to disable bootstrap after first use

### 1.2 HIGH: Wildcard CORS in All Edge Functions
**Location**: All 9 edge functions use `Access-Control-Allow-Origin: *`

**Issue**: Any website can make requests to these functions.

**Fix**:
```typescript
const allowedOrigins = [
  Deno.env.get('APP_URL'),
  'https://doodhwallah.lovable.app'
];
const origin = req.headers.get('origin');
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

### 1.3 HIGH: RLS Policy Gaps for Sensitive Data
**Affected Tables** (from security scan):
- `milk_vendors` - Bank account numbers, IFSC codes, UPI IDs accessible
- `employees` - Personal data, salaries potentially exposed
- `dairy_settings_public` - Business configuration without auth requirement

**Fix**: Add explicit DENY policies for anonymous access:
```sql
CREATE POLICY "Deny anonymous access" ON milk_vendors
  FOR ALL
  USING (auth.role() = 'authenticated');
```

### 1.4 MEDIUM: Input Validation Gaps in Edge Functions
**Issue**: Phone number format validation is inconsistent across functions.

**Fix**: Add standardized validation:
```typescript
const PHONE_REGEX = /^[6-9]\d{9}$/; // Indian mobile format
if (!PHONE_REGEX.test(phone)) {
  return errorResponse('Invalid phone number format', 400);
}
```

### 1.5 INFO: dangerouslySetInnerHTML Usage
**Location**: `src/components/ui/chart.tsx` (lines 68-80)

**Status**: LOW RISK - Used for injecting CSS variables from static config objects, not user input. No action required.

---

## Section 2: Race Condition Vulnerabilities

### 2.1 CRITICAL: Ledger Balance Race Condition
**Location**: `src/hooks/useLedgerAutomation.ts` (lines 48-66)

**Issue**: `createLedgerEntry` reads current balance, then writes new balance - classic read-then-write vulnerability. Concurrent ledger entries for the same customer can result in incorrect running balances.

**Fix**: Create a database function with row-level locking:
```sql
CREATE OR REPLACE FUNCTION create_ledger_entry_atomic(
  p_customer_id UUID,
  p_transaction_type TEXT,
  p_description TEXT,
  p_debit NUMERIC DEFAULT 0,
  p_credit NUMERIC DEFAULT 0,
  p_reference_id UUID DEFAULT NULL
) RETURNS customer_ledger AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_entry customer_ledger;
BEGIN
  -- Lock and get latest balance
  SELECT COALESCE(running_balance, 0) INTO v_current_balance
  FROM customer_ledger
  WHERE customer_id = p_customer_id
  ORDER BY transaction_date DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;
  
  -- Insert with atomic balance calculation
  INSERT INTO customer_ledger (
    customer_id, transaction_type, description,
    debit_amount, credit_amount, running_balance,
    reference_id, transaction_date
  ) VALUES (
    p_customer_id, p_transaction_type, p_description,
    NULLIF(p_debit, 0), NULLIF(p_credit, 0),
    COALESCE(v_current_balance, 0) + p_debit - p_credit,
    p_reference_id, CURRENT_DATE
  ) RETURNING * INTO v_new_entry;
  
  RETURN v_new_entry;
END;
$$ LANGUAGE plpgsql;
```

### 2.2 HIGH: Payment Recording Race Condition
**Location**: `src/components/production/MilkProcurement.tsx` (lines 358-400)

**Issue**: `handleRecordPayment` calculates new paid amount client-side based on stale data.

**Fix**: Create atomic payment update function:
```sql
CREATE OR REPLACE FUNCTION record_procurement_payment(
  p_procurement_id UUID,
  p_payment_amount NUMERIC,
  p_payment_mode TEXT
) RETURNS milk_procurement AS $$
DECLARE
  v_result milk_procurement;
BEGIN
  UPDATE milk_procurement
  SET 
    paid_amount = COALESCE(paid_amount, 0) + p_payment_amount,
    payment_status = CASE 
      WHEN COALESCE(paid_amount, 0) + p_payment_amount >= total_amount THEN 'paid'
      ELSE 'partial'
    END,
    payment_date = CURRENT_DATE,
    payment_mode = p_payment_mode
  WHERE id = p_procurement_id
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

### 2.3 MEDIUM: Advance Payment Update Race
**Location**: `src/hooks/useLedgerAutomation.ts` (lines 130-140)

**Issue**: `logAdvancePayment` silently ignores errors when updating `advance_balance`, and the update isn't atomic with the ledger entry.

**Fix**: Use a transaction or database trigger to keep `advance_balance` in sync with ledger entries.

---

## Section 3: Error Handling & Resilience

### 3.1 Existing Strengths
- Production-safe logger (`src/lib/logger.ts`) suppresses logs in production
- Error sanitization (`src/lib/errors.ts`) prevents exposing raw DB errors
- Retry logic in `MilkProcurement.tsx` (lines 118-143)

### 3.2 Improvements Needed

**Add retry wrappers for critical operations**:
```typescript
// src/lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastError!;
}
```

**Add graceful fallbacks in hooks**:
- `useAutoDeliveryScheduler.ts`: Add fallback when batch insert fails
- `useCattleStatusAutomation.ts`: Continue processing remaining cattle if one update fails
- `useExpenseAutomation.ts`: Queue failed expense entries for retry

---

## Section 4: Performance Optimizations

### 4.1 Query Optimizations

**Issue**: Some pages fetch excessive data
- `Billing.tsx`: Fetches all invoices without pagination
- `MilkProcurement.tsx`: Already has `.limit(100)` - good

**Fix**: Implement cursor-based pagination for large datasets:
```typescript
const PAGE_SIZE = 50;
const [cursor, setCursor] = useState<string | null>(null);

const { data } = await supabase
  .from('invoices')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(PAGE_SIZE)
  .lt('created_at', cursor || new Date().toISOString());
```

### 4.2 React Query Cache Configuration
**Location**: `src/App.tsx` - QueryClient created without explicit cache config

**Fix**: Add stale time and cache configuration:
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
```

### 4.3 Component Memoization
Already using `useMemo` and `useCallback` appropriately in:
- `useIntegratedAlerts.ts`
- `useLedgerAutomation.ts`
- `useAutoDeliveryScheduler.ts`

---

## Section 5: Edge Function Hardening

### 5.1 Consistent Error Response Helper
Create shared utility in `supabase/functions/_shared/responses.ts`:
```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function errorResponse(message: string, status: number) {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

export function successResponse(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

### 5.2 Rate Limiting
Add rate limiting to auth-related functions (`customer-auth`, `change-pin`, `reset-user-pin`):
- Already using `auth_attempts` and `customer_auth_attempts` tables
- Ensure these are checked before processing requests

### 5.3 Timeout Handling
Wrap external operations with timeout:
```typescript
const TIMEOUT_MS = 10000;
const result = await Promise.race([
  supabaseAdmin.from('table').select(),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Operation timed out')), TIMEOUT_MS)
  )
]);
```

---

## Section 6: Production Readiness Checklist

### 6.1 Already Implemented (No Changes Needed)
- Input validation with Zod schemas (Auth.tsx, CustomerAuth.tsx)
- Error sanitization for user-facing messages
- Production-safe logging
- RLS policies on sensitive tables
- Role-based access control
- HTTPS-only deployment (via Lovable)
- Vercel security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)

### 6.2 Changes Required

| Priority | Issue | Location | Fix |
|----------|-------|----------|-----|
| CRITICAL | Hardcoded bootstrap credentials | Auth.tsx, bootstrap-admin | Move to env vars |
| CRITICAL | Ledger race condition | useLedgerAutomation.ts | Add atomic DB function |
| HIGH | Wildcard CORS | All edge functions | Restrict to allowed origins |
| HIGH | Payment race condition | MilkProcurement.tsx | Use atomic update function |
| HIGH | Missing RLS deny policies | milk_vendors, employees | Add explicit deny for anon |
| MEDIUM | Inconsistent phone validation | Edge functions | Standardize validation |
| MEDIUM | QueryClient config | App.tsx | Add cache/retry settings |
| LOW | Edge function logging | All functions | Reduce PII in logs |

---

## Section 7: Implementation Sequence

### Phase 1: Security Critical (Immediate)
1. Add environment variables for bootstrap credentials
2. Update bootstrap-admin function to use env vars
3. Remove credential visibility from Auth.tsx
4. Add CORS origin restrictions to edge functions

### Phase 2: Data Integrity (High Priority)
5. Create `create_ledger_entry_atomic` database function
6. Create `record_procurement_payment` database function
7. Update `useLedgerAutomation.ts` to use atomic function
8. Update `MilkProcurement.tsx` to use atomic payment function

### Phase 3: RLS Hardening
9. Add explicit deny policies for anonymous access on sensitive tables
10. Review and verify all existing RLS policies

### Phase 4: Resilience
11. Add retry wrapper utility
12. Configure QueryClient with proper cache settings
13. Add graceful fallbacks in automation hooks

### Phase 5: Performance
14. Add pagination to large data fetches
15. Review and optimize slow queries

---

## Section 8: Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Auth.tsx` | Remove hardcoded credentials, use env vars |
| `src/App.tsx` | Add QueryClient configuration |
| `src/hooks/useLedgerAutomation.ts` | Use atomic DB function |
| `src/components/production/MilkProcurement.tsx` | Use atomic payment function |
| `supabase/functions/bootstrap-admin/index.ts` | Use env vars for credentials |
| `supabase/functions/*/index.ts` | Restrict CORS origins (all 9 functions) |
| `src/lib/retry.ts` (NEW) | Retry wrapper utility |
| `supabase/functions/_shared/responses.ts` (NEW) | Shared response helpers |
| Database migration (NEW) | Atomic ledger and payment functions |

---

## Verification Criteria

After implementing all fixes:
- No hardcoded credentials in source code
- All edge functions have restricted CORS
- Ledger entries maintain correct running balances under concurrent load
- Payment recordings are atomic and consistent
- All sensitive tables deny anonymous access
- Application handles network failures gracefully
- No silent crashes or data loss

This audit ensures the system is **secure, stable, and production-ready** while preserving all existing functionality.
