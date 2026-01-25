-- Create milk procurement table for tracking externally procured milk
CREATE TABLE public.milk_procurement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_date DATE NOT NULL,
  supplier_name TEXT NOT NULL,
  supplier_phone TEXT,
  supplier_address TEXT,
  quantity_liters DECIMAL(10,2) NOT NULL,
  fat_percentage DECIMAL(4,2),
  snf_percentage DECIMAL(4,2),
  rate_per_liter DECIMAL(8,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid')),
  paid_amount DECIMAL(12,2) DEFAULT 0,
  payment_date DATE,
  payment_mode TEXT,
  vehicle_number TEXT,
  quality_grade TEXT CHECK (quality_grade IN ('A', 'B', 'C', 'D')),
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster date-based queries
CREATE INDEX idx_milk_procurement_date ON public.milk_procurement(procurement_date DESC);
CREATE INDEX idx_milk_procurement_supplier ON public.milk_procurement(supplier_name);

-- Enable RLS
ALTER TABLE public.milk_procurement ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Managers and admins have full access to milk_procurement"
  ON public.milk_procurement FOR ALL
  USING (is_manager_or_admin(auth.uid()));

CREATE POLICY "Accountants can manage milk_procurement"
  ON public.milk_procurement FOR ALL
  USING (has_role(auth.uid(), 'accountant'::user_role));

CREATE POLICY "Auditors can read milk_procurement"
  ON public.milk_procurement FOR SELECT
  USING (has_role(auth.uid(), 'auditor'::user_role));

CREATE POLICY "Farm workers can read milk_procurement"
  ON public.milk_procurement FOR SELECT
  USING (has_role(auth.uid(), 'farm_worker'::user_role));

-- Add trigger for updated_at
CREATE TRIGGER update_milk_procurement_updated_at
  BEFORE UPDATE ON public.milk_procurement
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();