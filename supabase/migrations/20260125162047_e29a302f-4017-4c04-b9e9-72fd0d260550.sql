-- Phase 2: Atomic Database Functions for Data Integrity

-- Function 1: Atomic ledger entry creation with row-level locking
CREATE OR REPLACE FUNCTION public.create_ledger_entry_atomic(
  p_customer_id UUID,
  p_transaction_type TEXT,
  p_description TEXT,
  p_debit NUMERIC DEFAULT 0,
  p_credit NUMERIC DEFAULT 0,
  p_reference_id UUID DEFAULT NULL
) RETURNS customer_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_entry customer_ledger;
BEGIN
  -- Lock and get latest balance atomically
  SELECT COALESCE(running_balance, 0) INTO v_current_balance
  FROM customer_ledger
  WHERE customer_id = p_customer_id
  ORDER BY transaction_date DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;
  
  -- If no entries exist, start from 0
  IF v_current_balance IS NULL THEN
    v_current_balance := 0;
  END IF;
  
  -- Insert with atomic balance calculation
  INSERT INTO customer_ledger (
    customer_id, transaction_type, description,
    debit_amount, credit_amount, running_balance,
    reference_id, transaction_date
  ) VALUES (
    p_customer_id, p_transaction_type, p_description,
    NULLIF(p_debit, 0), NULLIF(p_credit, 0),
    v_current_balance + COALESCE(p_debit, 0) - COALESCE(p_credit, 0),
    p_reference_id, CURRENT_DATE
  ) RETURNING * INTO v_new_entry;
  
  RETURN v_new_entry;
END;
$$;

-- Function 2: Atomic payment recording for milk procurement
CREATE OR REPLACE FUNCTION public.record_procurement_payment(
  p_procurement_id UUID,
  p_payment_amount NUMERIC,
  p_payment_mode TEXT
) RETURNS milk_procurement
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result milk_procurement;
BEGIN
  -- Atomic update with row-level locking
  UPDATE milk_procurement
  SET 
    paid_amount = COALESCE(paid_amount, 0) + p_payment_amount,
    payment_status = CASE 
      WHEN COALESCE(paid_amount, 0) + p_payment_amount >= total_amount THEN 'paid'
      ELSE 'partial'
    END,
    payment_date = CURRENT_DATE,
    payment_mode = p_payment_mode,
    updated_at = NOW()
  WHERE id = p_procurement_id
  RETURNING * INTO v_result;
  
  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Procurement record not found: %', p_procurement_id;
  END IF;
  
  RETURN v_result;
END;
$$;

-- Function 3: Atomic advance payment with ledger sync
CREATE OR REPLACE FUNCTION public.record_advance_payment_atomic(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_notes TEXT DEFAULT NULL
) RETURNS customer_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_ledger_entry customer_ledger;
  v_current_advance NUMERIC;
BEGIN
  -- Lock customer record and get current advance
  SELECT COALESCE(advance_balance, 0) INTO v_current_advance
  FROM customers
  WHERE id = p_customer_id
  FOR UPDATE;
  
  -- Update advance balance atomically
  UPDATE customers
  SET 
    advance_balance = v_current_advance + p_amount,
    updated_at = NOW()
  WHERE id = p_customer_id;
  
  -- Create ledger entry
  v_ledger_entry := public.create_ledger_entry_atomic(
    p_customer_id,
    'advance',
    COALESCE(p_notes, 'Advance payment received'),
    0,
    p_amount,
    NULL
  );
  
  RETURN v_ledger_entry;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_ledger_entry_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_procurement_payment TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_advance_payment_atomic TO authenticated;