-- Create a function to set customer PIN hash directly (for first-time setup or reset)
CREATE OR REPLACE FUNCTION public.set_customer_pin_hash(_customer_id uuid, _new_pin text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    UPDATE public.customer_accounts 
    SET pin_hash = crypt(_new_pin, gen_salt('bf')), updated_at = NOW()
    WHERE customer_id = _customer_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Account not found');
    END IF;
    
    RETURN json_build_object('success', true, 'message', 'PIN hash updated successfully');
END;
$function$;