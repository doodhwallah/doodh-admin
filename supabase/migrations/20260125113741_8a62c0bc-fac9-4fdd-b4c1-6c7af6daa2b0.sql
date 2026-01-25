-- Create milk_vendors table for vendor management
CREATE TABLE public.milk_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  bank_name TEXT,
  account_number TEXT,
  ifsc_code TEXT,
  upi_id TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add vendor_id to milk_procurement (nullable to preserve existing data)
ALTER TABLE public.milk_procurement 
ADD COLUMN vendor_id UUID REFERENCES public.milk_vendors(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_milk_procurement_vendor_id ON public.milk_procurement(vendor_id);
CREATE INDEX idx_milk_vendors_name ON public.milk_vendors(name);
CREATE INDEX idx_milk_vendors_is_active ON public.milk_vendors(is_active);

-- Enable RLS
ALTER TABLE public.milk_vendors ENABLE ROW LEVEL SECURITY;

-- RLS Policies for milk_vendors
CREATE POLICY "Allow read access for authenticated users"
ON public.milk_vendors FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow insert for managers and admins"
ON public.milk_vendors FOR INSERT
TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['super_admin', 'manager', 'accountant']::user_role[])
);

CREATE POLICY "Allow update for managers and admins"
ON public.milk_vendors FOR UPDATE
TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['super_admin', 'manager', 'accountant']::user_role[])
);

CREATE POLICY "Allow delete for admins only"
ON public.milk_vendors FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::user_role)
);

-- Add trigger for updated_at
CREATE TRIGGER update_milk_vendors_updated_at
BEFORE UPDATE ON public.milk_vendors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();