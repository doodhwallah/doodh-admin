-- =============================================
-- FIX CRITICAL RLS SECURITY VULNERABILITIES
-- =============================================

-- 1. FIX milk_vendors: Restrict bank details to authorized roles only
-- Drop the overly permissive read policy
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON public.milk_vendors;

-- Create restricted read policy - only managers, admins, and accountants can see full details
CREATE POLICY "Authorized staff can read milk_vendors"
ON public.milk_vendors
FOR SELECT
USING (
  has_any_role(auth.uid(), ARRAY['super_admin'::user_role, 'manager'::user_role, 'accountant'::user_role])
);

-- 2. ADD delivery_staff read access to customers (needed for deliveries)
CREATE POLICY "Delivery staff can read customers for deliveries"
ON public.customers
FOR SELECT
USING (has_role(auth.uid(), 'delivery_staff'::user_role));

-- 3. ADD accountant read access to employees (needed for payroll)
CREATE POLICY "Accountants can read employees for payroll"
ON public.employees
FOR SELECT
USING (has_role(auth.uid(), 'accountant'::user_role));

-- 4. ADD employees can read their own record
CREATE POLICY "Employees can read own record"
ON public.employees
FOR SELECT
USING (user_id = auth.uid());

-- 5. ADD delivery_staff read access to deliveries table
-- First check if deliveries table exists and add proper policies
DO $$
BEGIN
  -- Check if the policy already exists before creating
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'deliveries' 
    AND policyname = 'Delivery staff can manage deliveries'
  ) THEN
    EXECUTE 'CREATE POLICY "Delivery staff can manage deliveries"
    ON public.deliveries
    FOR ALL
    USING (has_role(auth.uid(), ''delivery_staff''::user_role))';
  END IF;
END $$;

-- 6. ADD accountant read access to deliveries (for billing reconciliation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'deliveries' 
    AND policyname = 'Accountants can read deliveries'
  ) THEN
    EXECUTE 'CREATE POLICY "Accountants can read deliveries"
    ON public.deliveries
    FOR SELECT
    USING (has_role(auth.uid(), ''accountant''::user_role))';
  END IF;
END $$;

-- 7. ADD auditor read access to deliveries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'deliveries' 
    AND policyname = 'Auditors can read deliveries'
  ) THEN
    EXECUTE 'CREATE POLICY "Auditors can read deliveries"
    ON public.deliveries
    FOR SELECT
    USING (has_role(auth.uid(), ''auditor''::user_role))';
  END IF;
END $$;

-- 8. ENSURE delivery_items has proper customer access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'delivery_items' 
    AND policyname = 'Delivery staff can manage delivery_items'
  ) THEN
    EXECUTE 'CREATE POLICY "Delivery staff can manage delivery_items"
    ON public.delivery_items
    FOR ALL
    USING (has_role(auth.uid(), ''delivery_staff''::user_role))';
  END IF;
END $$;

-- 9. ADD managers/admins full access to deliveries if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'deliveries' 
    AND policyname = 'Managers and admins have full access to deliveries'
  ) THEN
    EXECUTE 'CREATE POLICY "Managers and admins have full access to deliveries"
    ON public.deliveries
    FOR ALL
    USING (is_manager_or_admin(auth.uid()))';
  END IF;
END $$;

-- 10. ADD customers can read own deliveries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'deliveries' 
    AND policyname = 'Customers can read own deliveries'
  ) THEN
    EXECUTE 'CREATE POLICY "Customers can read own deliveries"
    ON public.deliveries
    FOR SELECT
    USING (EXISTS (
      SELECT 1 FROM customer_accounts ca
      WHERE ca.customer_id = deliveries.customer_id
        AND ca.user_id = auth.uid()
    ))';
  END IF;
END $$;

-- 11. ADD managers/admins full access to delivery_items if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'delivery_items' 
    AND policyname = 'Managers and admins have full access to delivery_items'
  ) THEN
    EXECUTE 'CREATE POLICY "Managers and admins have full access to delivery_items"
    ON public.delivery_items
    FOR ALL
    USING (is_manager_or_admin(auth.uid()))';
  END IF;
END $$;

-- 12. Ensure RLS is enabled on all sensitive tables
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milk_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;